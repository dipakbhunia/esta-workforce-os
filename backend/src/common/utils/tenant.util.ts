import { ForbiddenException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthenticatedUser } from '../../modules/auth/interfaces/authenticated-user.interface';

export function isSuperAdmin(user: AuthenticatedUser): boolean {
  return user.roles.includes(RoleName.SUPER_ADMIN);
}

export function requireTenantId(user: AuthenticatedUser): string {
  if (!user.companyId || isSuperAdmin(user)) {
    throw new ForbiddenException('A tenant company is required');
  }

  return user.companyId;
}
