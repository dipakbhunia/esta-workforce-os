import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountActionTokenPurpose, NotificationChannel, NotificationStatus, NotificationType, Prisma, RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PlatformInvitationBootstrapEligibilityResponseDto, PlatformInvitationEligibilityReason } from './dto/platform-invitation-bootstrap-eligibility.dto';
import { SMTP_INVITATION_BOOTSTRAP_STARTED, hasInFlightSmtpBootstrap } from './smtp-bootstrap-dispatch-fence';
import { selectEligibleSmtpPlatformInvitationConfiguration } from './smtp-platform-invitation-configuration';

const RATE_WINDOW_MILLISECONDS = 15 * 60_000;
const RATE_LIMIT = 3;
const MAX_ATTEMPTS = 5;

const userSelect = {
  id: true, email: true, firstName: true, lastName: true, companyId: true, status: true, deletedAt: true,
  roles: { select: { role: { select: { companyId: true, systemName: true, deletedAt: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class SmtpPlatformInvitationEligibilityService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async get(targetUserId: string, authenticated: AuthenticatedUser): Promise<PlatformInvitationBootstrapEligibilityResponseDto> {
    const gateEnabled = this.config.get<boolean>('SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED') === true;
    const notificationsEnabled = this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED') === true;
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: authenticated.id }, select: userSelect });
      if (!this.isActor(actor)) throw new ForbiddenException('Current platform administrator authority is required');
      if (!actor) throw new ForbiddenException('Current platform administrator authority is required');

      const target = await tx.user.findUnique({ where: { id: targetUserId }, select: userSelect });
      if (!target || target.companyId !== null || target.deletedAt) throw new NotFoundException('Platform user not found');
      const targetDto = { userId: target.id, firstName: target.firstName, lastName: target.lastName,
        email: target.email.trim().toLowerCase(), status: target.status };
      if (target.status !== UserStatus.INACTIVE || !this.hasSuperAdmin(target)) {
        return this.result(false, 'TARGET_INELIGIBLE', gateEnabled, targetDto);
      }

      const now = new Date();
      const invitationRows = await tx.notificationDelivery.findMany({
        where: {
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.PENDING,
          attemptCount: { lt: MAX_ATTEMPTS },
          recipient: targetDto.email,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          AND: [{ OR: [{ claimToken: null }, { claimExpiresAt: { lte: now } }] }],
          notification: { userId: target.id, companyId: null, type: NotificationType.ACCOUNT_INVITATION,
            accountActionToken: { is: { purpose: AccountActionTokenPurpose.INVITATION, userId: target.id,
              companyId: null, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } } } },
        },
        select: { id: true, notificationId: true, recipient: true, status: true, attemptCount: true,
          claimToken: true, claimExpiresAt: true, nextRetryAt: true, errorCode: true,
          notification: { select: { accountActionToken: { select: { expiresAt: true, consumedAt: true, invalidatedAt: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 2,
      });
      if (!invitationRows.length) {
        const historicalCount = await tx.notificationDelivery.count({ where: {
          channel: NotificationChannel.EMAIL,
          notification: { userId: target.id, companyId: null, type: NotificationType.ACCOUNT_INVITATION,
            accountActionToken: { is: { purpose: AccountActionTokenPurpose.INVITATION, userId: target.id, companyId: null } } },
        } });
        return this.result(false, historicalCount ? 'DELIVERY_INELIGIBLE' : 'INVITATION_MISSING', gateEnabled, targetDto);
      }
      if (invitationRows.length > 1) return this.result(false, 'INVITATION_AMBIGUOUS', gateEnabled, targetDto);
      const row = invitationRows[0];
      const token = row.notification.accountActionToken;
      if (!token) return this.result(false, 'DELIVERY_INELIGIBLE', gateEnabled, targetDto);
      const delivery = { deliveryId: row.id, notificationId: row.notificationId, status: row.status,
        attemptCount: row.attemptCount, isClaimed: Boolean(row.claimToken && row.claimExpiresAt && row.claimExpiresAt > now),
        invitationExpiresAt: token.expiresAt };

      const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
      if (settings?.databaseAuthorityEstablishedAt || settings?.activeConfigurationVersionId || settings?.enabled) {
        return this.result(false, 'DATABASE_AUTHORITY_ESTABLISHED', gateEnabled, targetDto, delivery);
      }
      const selection = await selectEligibleSmtpPlatformInvitationConfiguration(tx);
      if (selection.kind === 'UNAVAILABLE') return this.result(false, 'SMTP_CONFIGURATION_UNAVAILABLE', gateEnabled, targetDto, delivery);
      if (selection.kind === 'AMBIGUOUS') return this.result(false, 'SMTP_CONFIGURATION_AMBIGUOUS', gateEnabled, targetDto, delivery);
      const config = selection.configuration;
      const smtp = { configurationId: config.id, version: config.version, revision: config.revision, lifecycle: config.lifecycle };
      if (await hasInFlightSmtpBootstrap(tx, config.id)) {
        return this.result(false, 'DISPATCH_UNRESOLVED', gateEnabled, targetDto, delivery, smtp);
      }
      const attempts = await tx.auditLog.count({ where: { actorUserId: actor.id, action: SMTP_INVITATION_BOOTSTRAP_STARTED,
        createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MILLISECONDS) } } });
      if (attempts >= RATE_LIMIT) return this.result(false, 'RATE_LIMITED', gateEnabled, targetDto, delivery, smtp);
      if (!gateEnabled) return this.result(false, 'GATE_DISABLED', gateEnabled, targetDto, delivery, smtp);
      if (notificationsEnabled) return this.result(false, 'GENERAL_DELIVERY_ENABLED', gateEnabled, targetDto, delivery, smtp);
      return this.result(true, 'ELIGIBLE', gateEnabled, targetDto, delivery, smtp);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private hasSuperAdmin(user: { roles: Array<{ role: { companyId: string | null; systemName: RoleName | null; deletedAt: Date | null } }> }) {
    return user.roles.some(({ role }) => role.systemName === RoleName.SUPER_ADMIN && role.companyId === null && !role.deletedAt);
  }
  private isActor(user: ({ companyId: string | null; status: UserStatus; deletedAt: Date | null;
    roles: Array<{ role: { companyId: string | null; systemName: RoleName | null; deletedAt: Date | null } }> }) | null) {
    return Boolean(user && user.companyId === null && user.status === UserStatus.ACTIVE && !user.deletedAt && this.hasSuperAdmin(user));
  }
  private result(available: boolean, reasonCode: PlatformInvitationEligibilityReason, gateEnabled: boolean,
    target: PlatformInvitationBootstrapEligibilityResponseDto['target'],
    delivery: PlatformInvitationBootstrapEligibilityResponseDto['delivery'] = null,
    smtp: PlatformInvitationBootstrapEligibilityResponseDto['smtp'] = null): PlatformInvitationBootstrapEligibilityResponseDto {
    return { available, reasonCode, gateEnabled, target, delivery, smtp };
  }
}
