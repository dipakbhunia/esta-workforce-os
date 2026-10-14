import { Prisma } from '@prisma/client';

export async function lockUserSessionAuthority(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
  `);
  return rows.length === 1;
}

export async function revokeAllUserSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  revokedAt: Date,
): Promise<void> {
  if (!(await lockUserSessionAuthority(tx, userId))) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "RefreshSession"
    WHERE "userId" = ${userId}::uuid
    ORDER BY "id"
    FOR UPDATE
  `);
  await tx.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt },
  });
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt },
  });
}
