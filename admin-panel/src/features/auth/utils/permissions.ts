import type { Permission, RoleName } from '../types/auth.types';

const rolePermissions: Record<RoleName, Permission[]> = {
  SUPER_ADMIN: ['dashboard:view', 'organization:manage', 'people:manage', 'attendance:view', 'attendance:manage', 'leave:view', 'leave:manage', 'monitoring:view', 'reports:view', 'settings:view'],
  COMPANY_ADMIN: ['dashboard:view', 'organization:manage', 'people:manage', 'attendance:view', 'attendance:manage', 'leave:view', 'leave:manage', 'monitoring:view', 'reports:view', 'settings:view'],
  HR: ['dashboard:view', 'organization:manage', 'people:manage', 'attendance:view', 'attendance:manage', 'leave:view', 'leave:manage', 'monitoring:view', 'reports:view', 'settings:view'],
  MANAGER: ['dashboard:view', 'attendance:view', 'leave:view', 'monitoring:view', 'reports:view', 'settings:view'],
  EMPLOYEE: ['dashboard:view', 'attendance:view', 'leave:view', 'monitoring:view', 'settings:view'],
};

export function permissionsForRoles(roles: RoleName[]): Permission[] {
  return Array.from(new Set(roles.flatMap((role) => rolePermissions[role] ?? [])));
}

export function hasAnyRole(userRoles: RoleName[], allowedRoles?: RoleName[]) {
  return !allowedRoles?.length || userRoles.some((role) => allowedRoles.includes(role));
}

export function hasPermission(permissions: Permission[], permission?: Permission) {
  return !permission || permissions.includes(permission);
}
