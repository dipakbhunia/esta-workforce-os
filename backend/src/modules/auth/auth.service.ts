import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CompanyStatus, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../../database/prisma.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { lockUserSessionAuthority } from './refresh-session-revocation';

const authUserInclude = {
  roles: {
    include: {
      role: true,
    },
  },
  company: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.UserInclude;

type UserWithAuthRelations = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

interface PreparedTokenPair {
  response: AuthResponseDto;
  refreshToken: {
    id: string;
    tokenHash: string;
    expiresAt: Date;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
    context: RequestContext,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: authUserInclude,
    });

    if (
      !user ||
      user.deletedAt ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertUserCanAuthenticate(user);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE
      `);
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        include: authUserInclude,
      });
      if (
        !currentUser ||
        currentUser.passwordHash !== user.passwordHash ||
        currentUser.email.trim().toLowerCase() !== dto.email.trim().toLowerCase()
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }
      this.assertUserCanAuthenticate(currentUser);
      const sessionId = randomUUID();
      const prepared = await this.prepareTokenPair(currentUser, sessionId);
      await tx.user.update({
        where: { id: currentUser.id },
        data: { lastLoginAt: new Date() },
      });
      await tx.refreshSession.create({
        data: {
          id: sessionId,
          userId: currentUser.id,
          expiresAt: prepared.refreshToken.expiresAt,
        },
      });
      await tx.refreshToken.create({
        data: {
          ...prepared.refreshToken,
          userId: currentUser.id,
          sessionId,
        },
      });
      await this.writeAuditLog(tx, currentUser, 'AUTH_LOGIN', context);
      return prepared.response;
    });
  }

  async refresh(
    refreshToken: string,
    context: RequestContext,
  ): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const result = await this.prisma.$transaction(async (tx) => {
      const authority = await this.resolveAndLockSession(
        tx,
        payload,
        this.hashToken(refreshToken),
      );
      if (!authority) return { kind: 'rejected' } as const;

      const now = new Date();
      if (
        authority.session.revokedAt ||
        authority.session.expiresAt <= now ||
        authority.token.expiresAt <= now
      ) {
        return { kind: 'rejected' } as const;
      }

      if (authority.token.revokedAt) {
        await this.revokeSessionFamily(tx, authority.session.id, now);
        await this.writeAuditLog(
          tx,
          authority.user,
          'AUTH_REFRESH_REPLAY',
          context,
        );
        return { kind: 'rejected' } as const;
      }

      this.assertUserCanAuthenticate(authority.user);
      const prepared = await this.prepareTokenPair(
        authority.user,
        authority.session.id,
      );
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: authority.token.id,
          userId: authority.user.id,
          sessionId: authority.session.id,
          tokenHash: authority.token.tokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException('Refresh token is invalid or revoked');
      }
      await tx.refreshToken.create({
        data: {
          ...prepared.refreshToken,
          userId: authority.user.id,
          sessionId: authority.session.id,
        },
      });
      await tx.refreshSession.update({
        where: { id: authority.session.id },
        data: { expiresAt: prepared.refreshToken.expiresAt },
      });
      await this.writeAuditLog(tx, authority.user, 'AUTH_REFRESH', context);
      return { kind: 'success', response: prepared.response } as const;
    });

    if (result.kind === 'rejected') {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }
    return result.response;
  }

  async logout(
    refreshToken: string,
    context: RequestContext,
  ): Promise<LogoutResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const knownSession = await this.prisma.$transaction(async (tx) => {
      const authority = await this.resolveAndLockSession(
        tx,
        payload,
        this.hashToken(refreshToken),
      );
      if (!authority) return false;
      if (!authority.session.revokedAt) {
        await this.revokeSessionFamily(tx, authority.session.id, new Date());
        await this.writeAuditLog(tx, authority.user, 'AUTH_LOGOUT', context);
      }
      return true;
    });

    if (!knownSession) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }
    return { success: true };
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.findUserForAuthentication(userId);
    this.assertUserCanAuthenticate(user);
    return this.toAuthenticatedUser(user);
  }

  private async prepareTokenPair(
    user: UserWithAuthRelations,
    sessionId: string,
  ): Promise<PreparedTokenPair> {
    const authenticatedUser = this.toAuthenticatedUser(user);
    const refreshTokenId = randomUUID();
    const basePayload = {
      sub: user.id,
      companyId: user.companyId,
      roles: authenticatedUser.roles,
    };

    const accessToken = await this.jwtService.signAsync(
      { ...basePayload, type: 'access' } satisfies JwtPayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ) as SignOptions['expiresIn'],
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        ...basePayload,
        type: 'refresh',
        jti: refreshTokenId,
        sid: sessionId,
      } satisfies JwtPayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as SignOptions['expiresIn'],
      },
    );
    const decoded = this.jwtService.decode<JwtPayload>(refreshToken);

    if (!decoded.exp) {
      throw new Error('Refresh token expiration was not generated');
    }

    return {
      response: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        user: authenticatedUser,
      },
      refreshToken: {
        id: refreshTokenId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    };
  }

  private async resolveAndLockSession(
    tx: Prisma.TransactionClient,
    payload: JwtPayload & { jti: string },
    tokenHash: string,
  ): Promise<{
    token: {
      id: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
      sessionId: string;
    };
    session: {
      id: string;
      expiresAt: Date;
      revokedAt: Date | null;
    };
    user: UserWithAuthRelations;
  } | null> {
    let token = await tx.refreshToken.findFirst({
      where: { id: payload.jti, userId: payload.sub, tokenHash },
      select: {
        id: true,
        userId: true,
        sessionId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (!token) return null;
    if (!(await lockUserSessionAuthority(tx, payload.sub))) return null;

    if (!token.sessionId) {
      if (payload.sid) return null;
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${'refresh-token-session:' + token.id}, 0)
        )::text AS "lockResult"
      `);
      token = await tx.refreshToken.findFirst({
        where: { id: payload.jti, userId: payload.sub, tokenHash },
        select: {
          id: true,
          userId: true,
          sessionId: true,
          tokenHash: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      if (!token || (token.revokedAt && !token.sessionId)) return null;
      if (!token.sessionId) {
        const sessionId = token.id;
        await tx.refreshSession.create({
          data: {
            id: sessionId,
            userId: token.userId,
            expiresAt: token.expiresAt,
          },
        });
        const associated = await tx.refreshToken.updateMany({
          where: {
            id: token.id,
            userId: token.userId,
            tokenHash,
            sessionId: null,
          },
          data: { sessionId },
        });
        if (associated.count !== 1) {
          throw new UnauthorizedException('Refresh token is invalid or revoked');
        }
        token = { ...token, sessionId };
      }
    }

    if (!token.sessionId) return null;
    if (payload.sid && payload.sid !== token.sessionId) return null;
    const sessionId = token.sessionId;
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "RefreshSession"
      WHERE "id" = ${sessionId}::uuid
        AND "userId" = ${payload.sub}::uuid
      FOR UPDATE
    `);
    if (locked.length !== 1) return null;

    const [durableToken, session, user] = await Promise.all([
      tx.refreshToken.findFirst({
        where: {
          id: payload.jti,
          userId: payload.sub,
          tokenHash,
          sessionId,
        },
        select: {
          id: true,
          tokenHash: true,
          expiresAt: true,
          revokedAt: true,
          sessionId: true,
        },
      }),
      tx.refreshSession.findUnique({
        where: { id: sessionId },
        select: { id: true, expiresAt: true, revokedAt: true },
      }),
      tx.user.findUnique({
        where: { id: payload.sub },
        include: authUserInclude,
      }),
    ]);
    if (!durableToken || !durableToken.sessionId || !session || !user) {
      return null;
    }
    return {
      token: { ...durableToken, sessionId: durableToken.sessionId },
      session,
      user,
    };
  }

  private async revokeSessionFamily(
    tx: Prisma.TransactionClient,
    sessionId: string,
    revokedAt: Date,
  ): Promise<void> {
    await tx.refreshSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });
    await tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt },
    });
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<JwtPayload & { jti: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );

      if (payload.type !== 'refresh' || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload as JwtPayload & { jti: string };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private findUserForAuthentication(
    userId: string,
  ): Promise<UserWithAuthRelations> {
    return this.prisma.user
      .findUniqueOrThrow({
        where: { id: userId },
        include: authUserInclude,
      })
      .catch(() => {
        throw new UnauthorizedException('User account is unavailable');
      });
  }

  private assertUserCanAuthenticate(user: UserWithAuthRelations): void {
    if (user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    if (
      user.company &&
      user.company.status !== CompanyStatus.ACTIVE &&
      user.company.status !== CompanyStatus.TRIAL
    ) {
      throw new UnauthorizedException('Company account is not active');
    }
  }

  private toAuthenticatedUser(
    user: UserWithAuthRelations,
  ): AuthenticatedUser {
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles: user.roles
        .map(({ role }) => role.systemName)
        .filter((role): role is NonNullable<typeof role> => role !== null),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async writeAuditLog(
    db: Pick<Prisma.TransactionClient, 'auditLog'>,
    user: UserWithAuthRelations,
    action: string,
    context: RequestContext,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        companyId: user.companyId,
        actorUserId: user.id,
        action,
        entityType: 'User',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }
}
