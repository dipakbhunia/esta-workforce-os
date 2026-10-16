import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const SMTP_AUTHORITY_LOCK_NAME = 'esta:platform-smtp-authority:v1';
const SMTP_AUTHORITY_LOCK_TIMEOUT_MILLISECONDS = 2_000;

async function acquireBoundedSmtpAuthorityLock(tx: Prisma.TransactionClient, shared: boolean) {
  try {
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${SMTP_AUTHORITY_LOCK_TIMEOUT_MILLISECONDS}ms'`);
    return shared
      ? await tx.$queryRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock_shared(hashtextextended(${SMTP_AUTHORITY_LOCK_NAME}, 0))::text AS "lock"
        `)
      : await tx.$queryRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${SMTP_AUTHORITY_LOCK_NAME}, 0))::text AS "lock"
        `);
  } catch {
    throw new ServiceUnavailableException('SMTP authority is temporarily busy');
  }
}

export function acquireExclusiveSmtpAuthorityLock(tx: Prisma.TransactionClient) {
  return acquireBoundedSmtpAuthorityLock(tx, false);
}

export function acquireSharedSmtpAuthorityLock(tx: Prisma.TransactionClient) {
  return acquireBoundedSmtpAuthorityLock(tx, true);
}
