import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { acquireExclusiveSmtpAuthorityLock } from './smtp-authority-lock';

export const SMTP_BOOTSTRAP_STARTED = 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_STARTED';
export const SMTP_BOOTSTRAP_COMPLETED = 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_COMPLETED';
export const SMTP_INVITATION_BOOTSTRAP_STARTED = 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_STARTED';
export const SMTP_INVITATION_BOOTSTRAP_COMPLETED = 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_COMPLETED';

export async function requireNoInFlightSmtpBootstrap(
  tx: Prisma.TransactionClient,
  configurationId?: string,
) {
  await acquireExclusiveSmtpAuthorityLock(tx);
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT started."id"
    FROM "AuditLog" AS started
    WHERE started."action" IN (${SMTP_BOOTSTRAP_STARTED}, ${SMTP_INVITATION_BOOTSTRAP_STARTED})
      AND started."entityType" = 'SmtpConfigurationVersion'
      ${configurationId ? Prisma.sql`AND started."entityId" = ${configurationId}` : Prisma.empty}
      AND started."metadata"->>'dispatchId' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "AuditLog" AS completed
        WHERE ((started."action" = ${SMTP_BOOTSTRAP_STARTED} AND completed."action" = ${SMTP_BOOTSTRAP_COMPLETED})
          OR (started."action" = ${SMTP_INVITATION_BOOTSTRAP_STARTED} AND completed."action" = ${SMTP_INVITATION_BOOTSTRAP_COMPLETED}))
          AND completed."entityType" = started."entityType"
          AND completed."entityId" = started."entityId"
          AND completed."metadata"->>'dispatchId' = started."metadata"->>'dispatchId'
      )
    LIMIT 1
  `);
  if (rows.length) {
    throw new ConflictException('SMTP configuration has an unresolved verification delivery');
  }
}
