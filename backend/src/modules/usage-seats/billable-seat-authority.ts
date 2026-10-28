import { Prisma, UserStatus } from '@prisma/client';

export const BILLABLE_TENANT_USER_STATUS = UserStatus.ACTIVE;

export function billableTenantUserWhere(
  companyId: string,
): Prisma.UserWhereInput {
  return {
    companyId,
    status: BILLABLE_TENANT_USER_STATUS,
    deletedAt: null,
  };
}

export const billableTenantUserSql = Prisma.sql`
  "companyId" IS NOT NULL
  AND "status" = ${BILLABLE_TENANT_USER_STATUS}::"UserStatus"
  AND "deletedAt" IS NULL
`;
