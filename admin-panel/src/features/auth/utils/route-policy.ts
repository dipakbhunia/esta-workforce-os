import type { RoleName } from '../types/auth.types';

export const PLATFORM_ROLES = ['SUPER_ADMIN'] as const satisfies readonly RoleName[];

export const TENANT_ROLES = ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as const satisfies readonly RoleName[];

export const SHARED_ROLES = ['SUPER_ADMIN', ...TENANT_ROLES] as const satisfies readonly RoleName[];

export const TENANT_ADMIN_ROLES = ['COMPANY_ADMIN', 'HR'] as const satisfies readonly RoleName[];

export const TENANT_MANAGER_ROLES = ['COMPANY_ADMIN', 'HR', 'MANAGER'] as const satisfies readonly RoleName[];

export const TENANT_WORKFORCE_ROLES = TENANT_ROLES;

export const TENANT_ATTENDANCE_ROLES = TENANT_ROLES;

export function mutableRoles(roles: readonly RoleName[]): RoleName[] {
  return [...roles];
}
