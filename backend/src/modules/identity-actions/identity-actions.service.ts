import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountActionTokenPurpose, Prisma, RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  accountActionTokenId,
  buildAccountActionToken,
  buildEmailVerificationToken,
  hashAccountActionToken,
  verifyAccountActionTokenSignature,
  verifyEmailVerificationTokenSignature,
} from '../../common/utils/account-action-token.util';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompleteAccountActionDto, VerifyEmailDto } from './dto/identity-action.dto';

const SALT_ROUNDS = 12;
const RECOVERY_RESPONSE = { accepted: true as const };
const EMAIL_VERIFICATION_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_USER_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_IP_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

interface RequestContext { ipAddress?: string; userAgent?: string }

@Injectable()
export class IdentityActionsService {
  private readonly logger = new Logger(IdentityActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async unusablePasswordHash(): Promise<string> {
    return bcrypt.hash(randomBytes(32).toString('base64url'), SALT_ROUNDS);
  }

  async issueTokenInTransaction(
    tx: Prisma.TransactionClient,
    input: { purpose: AccountActionTokenPurpose; userId: string; companyId: string | null; createdByUserId?: string | null },
  ) {
    if (input.purpose === AccountActionTokenPurpose.EMAIL_VERIFICATION) {
      throw new Error('Email verification tokens require current-address binding');
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMilliseconds(input.purpose));
    const id = randomUUID();
    const material = { id, purpose: input.purpose, userId: input.userId, expiresAt };
    const token = buildAccountActionToken(material, this.tokenSecret());
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`account-action:${input.userId}:${input.purpose}`}, 0))::text`;
    await tx.accountActionToken.updateMany({
      where: { userId: input.userId, purpose: input.purpose, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
      data: { invalidatedAt: now },
    });
    return tx.accountActionToken.create({
      data: {
        ...material,
        companyId: input.companyId,
        tokenHash: hashAccountActionToken(token),
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  async requestEmailVerification(actor: AuthenticatedUser, context: RequestContext) {
    const subjectHash = this.privateHash(`user:${actor.id}`);
    const ipHash = this.privateHash(`ip:${context.ipAddress ?? 'unknown'}`);
    try {
      await this.prisma.$transaction(async (tx) => {
        const keys = [
          `email-verification-ip:${ipHash}`,
          `email-verification-user:${subjectHash}`,
          `account-action:${actor.id}:${AccountActionTokenPurpose.EMAIL_VERIFICATION}`,
        ].sort();
        for (const key of keys) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        }
        const now = new Date();
        const [userCount, ipCount] = await Promise.all([
          tx.accountActionRequestEvidence.count({
            where: {
              purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
              subjectHash,
              createdAt: { gte: new Date(now.getTime() - EMAIL_VERIFICATION_USER_WINDOW_MS) },
            },
          }),
          tx.accountActionRequestEvidence.count({
            where: {
              purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
              ipHash,
              createdAt: { gte: new Date(now.getTime() - EMAIL_VERIFICATION_IP_WINDOW_MS) },
            },
          }),
        ]);
        await tx.accountActionRequestEvidence.create({
          data: { purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION, subjectHash, ipHash },
        });
        await tx.accountActionRequestEvidence.deleteMany({
          where: { createdAt: { lt: new Date(now.getTime() - EMAIL_VERIFICATION_RETENTION_MS) } },
        });
        if (userCount >= 3 || ipCount >= 10) return;

        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: actor.id },
          include: { roles: { include: { role: true } } },
        });
        if (
          !user ||
          user.deletedAt ||
          user.status !== UserStatus.ACTIVE ||
          user.companyId !== null ||
          !user.roles.some(({ role }) => role.systemName === RoleName.SUPER_ADMIN)
        ) return;
        const targetEmail = user.email.trim().toLowerCase();
        if (user.verifiedEmail === targetEmail && user.emailVerifiedAt) return;

        await tx.accountActionToken.updateMany({
          where: {
            userId: user.id,
            purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        });
        const material = {
          id: randomUUID(),
          purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
          userId: user.id,
          companyId: null,
          targetEmail,
          emailRevision: user.emailRevision,
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        } as const;
        const bearer = buildEmailVerificationToken(material, this.tokenSecret());
        const token = await tx.accountActionToken.create({
          data: {
            ...material,
            tokenHash: hashAccountActionToken(bearer),
            createdByUserId: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: null,
            actorUserId: user.id,
            action: 'USER_EMAIL_VERIFICATION_REQUESTED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        await this.notifications.createEmailVerificationEmailInTransaction(tx, {
          tokenId: token.id,
          targetUserId: user.id,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch {
      this.logger.warn({ failureCategory: 'EMAIL_VERIFICATION_REQUEST_PROCESSING_FAILED', actorUserId: actor.id });
    }
    return RECOVERY_RESPONSE;
  }

  async emailVerificationStatus(actor: AuthenticatedUser) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: actor.id,
        companyId: null,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: { some: { role: { systemName: RoleName.SUPER_ADMIN } } },
      },
      select: { email: true, verifiedEmail: true, emailVerifiedAt: true },
    });
    const verified = Boolean(
      user?.emailVerifiedAt &&
      user.verifiedEmail === user.email.trim().toLowerCase(),
    );
    return { verified, verifiedAt: verified ? user!.emailVerifiedAt : null };
  }

  async verifyEmail(dto: VerifyEmailDto, context: RequestContext) {
    const invalid = () => new BadRequestException('The email verification link is invalid or expired');
    const id = accountActionTokenId(dto.token);
    if (!id) throw invalid();
    const candidate = await this.prisma.accountActionToken.findUnique({ where: { id } });
    if (
      !candidate ||
      candidate.purpose !== AccountActionTokenPurpose.EMAIL_VERIFICATION ||
      candidate.companyId !== null ||
      candidate.targetEmail === null ||
      candidate.emailRevision === null ||
      !verifyEmailVerificationTokenSignature(dto.token, {
        id: candidate.id,
        purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        userId: candidate.userId,
        companyId: candidate.companyId,
        targetEmail: candidate.targetEmail,
        emailRevision: candidate.emailRevision,
        expiresAt: candidate.expiresAt,
      }, this.tokenSecret()) ||
      candidate.tokenHash !== hashAccountActionToken(dto.token)
    ) throw invalid();
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`account-action:${candidate.userId}:${AccountActionTokenPurpose.EMAIL_VERIFICATION}`}, 0))::text`;
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId}::uuid FOR UPDATE`;
        const user = await tx.user.findFirst({
          where: {
            id: candidate.userId,
            companyId: null,
            status: UserStatus.ACTIVE,
            deletedAt: null,
            roles: { some: { role: { systemName: RoleName.SUPER_ADMIN } } },
          },
          select: { id: true, email: true, emailRevision: true },
        });
        if (
          !user ||
          user.email.trim().toLowerCase() !== candidate.targetEmail ||
          user.emailRevision !== candidate.emailRevision
        ) throw invalid();
        const claimed = await tx.accountActionToken.updateMany({
          where: {
            id: candidate.id,
            purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
            userId: user.id,
            companyId: null,
            targetEmail: candidate.targetEmail,
            emailRevision: candidate.emailRevision,
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (claimed.count !== 1) throw invalid();
        await tx.user.update({
          where: { id: user.id },
          data: { verifiedEmail: candidate.targetEmail, emailVerifiedAt: now },
        });
        await tx.accountActionToken.updateMany({
          where: {
            userId: user.id,
            purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
            id: { not: candidate.id },
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        });
        await tx.auditLog.create({
          data: {
            companyId: null,
            actorUserId: user.id,
            action: 'USER_EMAIL_VERIFIED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw invalid();
    }
    return { success: true as const };
  }

  async enqueueInvitation(tokenId: string, targetUserId: string, organizationName: string): Promise<boolean> {
    try {
      const result = await this.notifications.createAccountInvitationEmail({ tokenId, targetUserId, organizationName });
      return result.created;
    } catch {
      this.logger.warn({ failureCategory: 'ACCOUNT_INVITATION_ENQUEUE_FAILED', targetUserId, tokenId });
      return false;
    }
  }

  async requestPasswordReset(email: string, context: RequestContext) {
    const normalizedEmail = email.trim().toLowerCase();
    const subjectHash = this.privateHash(`email:${normalizedEmail}`);
    const ipHash = this.privateHash(`ip:${context.ipAddress ?? 'unknown'}`);
    let issued: { id: string; userId: string } | null = null;
    try {
      issued = await this.prisma.$transaction(async (tx) => {
        const keys = [`identity:${subjectHash}`, `identity:${ipHash}`].sort();
        for (const key of keys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        const since = new Date(Date.now() - 60 * 60 * 1000);
        const [subjectCount, ipCount] = await Promise.all([
          tx.accountActionRequestEvidence.count({ where: { purpose: AccountActionTokenPurpose.PASSWORD_RESET, subjectHash, createdAt: { gte: since } } }),
          tx.accountActionRequestEvidence.count({ where: { purpose: AccountActionTokenPurpose.PASSWORD_RESET, ipHash, createdAt: { gte: since } } }),
        ]);
        await tx.accountActionRequestEvidence.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
        await tx.accountActionRequestEvidence.create({ data: { purpose: AccountActionTokenPurpose.PASSWORD_RESET, subjectHash, ipHash } });
        if (subjectCount >= this.emailLimit() || ipCount >= this.ipLimit()) return null;
        const user = await tx.user.findFirst({
          where: { email: normalizedEmail, deletedAt: null, status: UserStatus.ACTIVE },
          select: { id: true, companyId: true },
        });
        if (!user) return null;
        const token = await this.issueTokenInTransaction(tx, {
          purpose: AccountActionTokenPurpose.PASSWORD_RESET,
          userId: user.id,
          companyId: user.companyId,
        });
        await tx.auditLog.create({
          data: { companyId: user.companyId, actorUserId: null, action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id, ipAddress: context.ipAddress, userAgent: context.userAgent },
        });
        return { id: token.id, userId: user.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch {
      this.logger.warn({ failureCategory: 'PASSWORD_RESET_REQUEST_PROCESSING_FAILED' });
      return RECOVERY_RESPONSE;
    }
    if (issued) {
      try {
        await this.notifications.createPasswordResetRequestedEmail({ tokenId: issued.id, targetUserId: issued.userId });
      } catch {
        this.logger.warn({ failureCategory: 'PASSWORD_RESET_NOTIFICATION_ENQUEUE_FAILED', targetUserId: issued.userId, tokenId: issued.id });
      }
    }
    return RECOVERY_RESPONSE;
  }

  activate(dto: CompleteAccountActionDto, context: RequestContext) {
    return this.consume(dto, AccountActionTokenPurpose.INVITATION, true, context);
  }

  resetPassword(dto: CompleteAccountActionDto, context: RequestContext) {
    return this.consume(dto, AccountActionTokenPurpose.PASSWORD_RESET, false, context);
  }

  private async consume(dto: CompleteAccountActionDto, purpose: AccountActionTokenPurpose, activate: boolean, context: RequestContext) {
    if (dto.password !== dto.passwordConfirmation) throw new BadRequestException('Passwords do not match');
    const id = accountActionTokenId(dto.token);
    if (!id) throw new BadRequestException('The account action link is invalid or expired');
    const candidate = await this.prisma.accountActionToken.findUnique({ where: { id } });
    if (!candidate || candidate.purpose !== purpose || !verifyAccountActionTokenSignature(dto.token, candidate, this.tokenSecret()) || candidate.tokenHash !== hashAccountActionToken(dto.token)) {
      throw new BadRequestException('The account action link is invalid or expired');
    }
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.accountActionToken.updateMany({
          where: { id, purpose, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claimed.count !== 1) throw new BadRequestException('The account action link is invalid or expired');
        const user = await tx.user.findFirst({
          where: { id: candidate.userId, companyId: candidate.companyId, deletedAt: null, status: activate ? UserStatus.INACTIVE : UserStatus.ACTIVE },
          select: { id: true, companyId: true },
        });
        if (!user) throw new BadRequestException('The account action link is invalid or expired');
        await tx.user.update({ where: { id: user.id }, data: { passwordHash, ...(activate ? { status: UserStatus.ACTIVE } : {}) } });
        await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.accountActionToken.updateMany({
          where: { userId: user.id, purpose, id: { not: id }, consumedAt: null, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
        await tx.auditLog.create({
          data: { companyId: user.companyId, actorUserId: user.id, action: activate ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: user.id, ipAddress: context.ipAddress, userAgent: context.userAgent },
        });
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('The account action link is invalid or expired');
    }
    return { success: true as const };
  }

  private ttlMilliseconds(purpose: AccountActionTokenPurpose): number {
    return purpose === AccountActionTokenPurpose.INVITATION
      ? this.config.get<number>('IDENTITY_INVITATION_TTL_HOURS', 48) * 60 * 60 * 1000
      : this.config.get<number>('IDENTITY_PASSWORD_RESET_TTL_MINUTES', 30) * 60 * 1000;
  }

  private tokenSecret(): string {
    return this.config.get<string>('IDENTITY_ACTION_TOKEN_SECRET') || this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private privateHash(value: string): string {
    return createHmac('sha256', this.tokenSecret()).update(value).digest('hex');
  }

  private emailLimit(): number { return this.config.get<number>('IDENTITY_RECOVERY_EMAIL_LIMIT_PER_HOUR', 5); }
  private ipLimit(): number { return this.config.get<number>('IDENTITY_RECOVERY_IP_LIMIT_PER_HOUR', 20); }
}
