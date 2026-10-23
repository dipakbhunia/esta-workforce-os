import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const PLATFORM_INVITATION_BOOTSTRAP_STARTED = 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_STARTED';
export const PLATFORM_INVITATION_BOOTSTRAP_COMPLETED = 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_COMPLETED';

const invitationAuthorityLockName = (targetUserId: string) =>
  `identity-action-invitation-authority:${targetUserId}`;

export class InvitationDispatchAuthorityConflictError extends ConflictException {
  constructor() {
    super('Invitation authority is temporarily unavailable while delivery is unresolved');
  }
}

export function acquireInvitationAuthorityLock(
  tx: Prisma.TransactionClient,
  targetUserId: string,
) {
  return tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${invitationAuthorityLockName(targetUserId)}, 0)
    )::text AS "lock"
  `);
}

export async function hasUnresolvedPlatformInvitationDispatch(
  tx: Prisma.TransactionClient,
  targetUserId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT started."id"
    FROM "AuditLog" AS started
    WHERE started."action" = ${PLATFORM_INVITATION_BOOTSTRAP_STARTED}
      AND started."entityType" = 'SmtpConfigurationVersion'
      AND (
        jsonb_typeof(started."metadata") IS DISTINCT FROM 'object'
        OR NULLIF(started."metadata"->>'dispatchId', '') IS NULL
        OR NULLIF(started."metadata"->>'targetUserId', '') IS NULL
        OR (
          started."metadata"->>'targetUserId' = ${targetUserId}
          AND (
            SELECT COUNT(*)
            FROM "AuditLog" AS completed
            WHERE completed."action" = ${PLATFORM_INVITATION_BOOTSTRAP_COMPLETED}
              AND completed."entityType" = started."entityType"
              AND completed."entityId" IS NOT DISTINCT FROM started."entityId"
              AND completed."metadata"->>'dispatchId' = started."metadata"->>'dispatchId'
              AND completed."metadata"->>'targetUserId' = started."metadata"->>'targetUserId'
          ) <> 1
        )
      )
    LIMIT 1
  `);
  return rows.length > 0;
}

export async function requireNoUnresolvedPlatformInvitationDispatch(
  tx: Prisma.TransactionClient,
  targetUserId: string,
) {
  if (await hasUnresolvedPlatformInvitationDispatch(tx, targetUserId)) {
    throw new InvitationDispatchAuthorityConflictError();
  }
}
