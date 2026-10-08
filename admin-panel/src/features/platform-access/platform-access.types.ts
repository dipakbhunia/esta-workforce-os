export type PlatformUserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type PlatformRoleSystemName = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export function normalizePlatformAccessSearch(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export interface PlatformUserAssignedRole {
  assignedAt: string;
  role: {
    id: string;
    companyId: null;
    key: string;
    name: string;
    systemName: PlatformRoleSystemName | null;
    description: string | null;
  };
}

export interface PlatformUser {
  id: string;
  companyId: null;
  email: string;
  firstName: string;
  lastName: string;
  status: PlatformUserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  roles: PlatformUserAssignedRole[];
}

export interface PlatformUserMutationResult {
  id: string;
  companyId: null;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  shiftId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: PlatformUserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  invitationQueued?: boolean;
  company: null;
  branch: { id: string; name: string; code: string } | null;
  department: { id: string; name: string; code: string } | null;
  designation: { id: string; name: string; code: string } | null;
  shift: { id: string; name: string; code: string; startTime: string; endTime: string; timezone: string } | null;
  roles: PlatformUserMutationRole[];
}

export interface PlatformUserMutationRole {
  userId: string;
  roleId: string;
  assignedAt: string;
  role: {
    id: string;
    companyId: null;
    key: string;
    name: string;
    systemName: PlatformRoleSystemName | null;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    permissions: Array<{
      roleId: string;
      permissionId: string;
      assignedAt: string;
      permission: PlatformPermission & { createdAt: string; updatedAt: string };
    }>;
  };
}

export interface PlatformPermission {
  id: string;
  key: string;
  description: string | null;
}

export interface PlatformRolePermissionAssignment {
  assignedAt: string;
  permission: PlatformPermission;
}

export interface PlatformRole {
  id: string;
  companyId: null;
  key: string;
  name: string;
  description: string | null;
  systemName: PlatformRoleSystemName | null;
  createdAt: string;
  updatedAt: string;
  permissions: PlatformRolePermissionAssignment[];
  _count: { users: number };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PlatformUserListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: PlatformUserStatus;
}

export interface PlatformRoleListQuery {
  page: number;
  limit: number;
  search?: string;
  systemName?: PlatformRoleSystemName;
}

export interface PlatformAuditActor {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: PlatformUserStatus;
}

export interface PlatformAuditRecord {
  id: string;
  companyId: null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: PlatformAuditActor | null;
}

export interface PlatformAuditListQuery {
  page: number;
  limit: number;
  action?: string;
  entityType?: string;
  actorUserId?: string;
}

export interface CreatePlatformUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
}

export interface UpdatePlatformUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdatePlatformUserStatusRequest {
  status: PlatformUserStatus;
}

export interface AssignPlatformUserRoleRequest {
  roleId: string;
}

export type PlatformUserListResponse = PaginatedResponse<PlatformUser>;
export type PlatformRoleListResponse = PaginatedResponse<PlatformRole>;
export type PlatformAuditListResponse = PaginatedResponse<PlatformAuditRecord>;
