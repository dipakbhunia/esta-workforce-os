import { Prisma } from '@prisma/client';

export const SMTP_AUTHORITY_LOCK_NAME = 'esta:platform-smtp-authority:v1';

export function acquireExclusiveSmtpAuthorityLock(tx: Prisma.TransactionClient) {
  return tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${SMTP_AUTHORITY_LOCK_NAME}, 0))::text AS "lock"
  `);
}

export function acquireSharedSmtpAuthorityLock(tx: Prisma.TransactionClient) {
  return tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock_shared(hashtextextended(${SMTP_AUTHORITY_LOCK_NAME}, 0))::text AS "lock"
  `);
}
