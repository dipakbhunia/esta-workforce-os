import { http } from '@/services/http';
import type {
  AssignPlatformUserRoleRequest,
  CreatePlatformUserRequest,
  PlatformPermission,
  PlatformRole,
  PlatformRoleListQuery,
  PlatformRoleListResponse,
  PlatformUser,
  PlatformUserListQuery,
  PlatformUserListResponse,
  PlatformUserMutationResult,
  UpdatePlatformUserRequest,
  UpdatePlatformUserStatusRequest,
} from './platform-access.types';
import { normalizePlatformAccessSearch } from './platform-access.types';

const USER_LIST_PARAMETERS = ['page', 'limit', 'search', 'status'] as const;
const ROLE_LIST_PARAMETERS = ['page', 'limit', 'search', 'systemName'] as const;

export const platformAccessKeys = {
  all: ['platform-access'] as const,
  users: () => [...platformAccessKeys.all, 'users'] as const,
  userList: (query: PlatformUserListQuery) => [...platformAccessKeys.users(), 'list', normalizeUserQuery(query)] as const,
  user: (id: string) => [...platformAccessKeys.users(), 'details', id] as const,
  roles: () => [...platformAccessKeys.all, 'roles'] as const,
  roleCatalog: () => [...platformAccessKeys.roles(), 'catalog'] as const,
  roleList: (query: PlatformRoleListQuery) => [...platformAccessKeys.roles(), 'list', normalizeRoleQuery(query)] as const,
  role: (id: string) => [...platformAccessKeys.roles(), 'details', id] as const,
  permissions: () => [...platformAccessKeys.roles(), 'permissions'] as const,
};

export function listPlatformUsers(query: PlatformUserListQuery) {
  return http.get<PlatformUserListResponse>('/platform/access/users', { params: parameters(normalizeUserQuery(query), USER_LIST_PARAMETERS) });
}

export function getPlatformUser(id: string) {
  return http.get<PlatformUser>(`/platform/access/users/${encodeURIComponent(id)}`);
}

export function createPlatformUser(request: CreatePlatformUserRequest) {
  const { email, password, firstName, lastName, status, roleIds } = request;
  return http.post<PlatformUserMutationResult>('/platform/access/users', { email, password, firstName, lastName, ...(status ? { status } : {}), roleIds });
}

export function updatePlatformUser(id: string, request: UpdatePlatformUserRequest) {
  const { email, firstName, lastName } = request;
  return http.patch<PlatformUserMutationResult>(`/platform/access/users/${encodeURIComponent(id)}`, compact({ email, firstName, lastName }));
}

export function updatePlatformUserStatus(id: string, request: UpdatePlatformUserStatusRequest) {
  return http.patch<PlatformUserMutationResult>(`/platform/access/users/${encodeURIComponent(id)}/status`, { status: request.status });
}

export function deletePlatformUser(id: string) {
  return http.delete<PlatformUserMutationResult>(`/platform/access/users/${encodeURIComponent(id)}`);
}

export function assignPlatformUserRole(id: string, request: AssignPlatformUserRoleRequest) {
  return http.post<PlatformUserMutationResult>(`/platform/access/users/${encodeURIComponent(id)}/roles`, { roleId: request.roleId });
}

export function removePlatformUserRole(id: string, roleId: string) {
  return http.delete<PlatformUserMutationResult>(`/platform/access/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`);
}

export function listPlatformRoles(query: PlatformRoleListQuery) {
  return http.get<PlatformRoleListResponse>('/platform/access/roles', { params: parameters(normalizeRoleQuery(query), ROLE_LIST_PARAMETERS) });
}

export function getPlatformRole(id: string) {
  return http.get<PlatformRole>(`/platform/access/roles/${encodeURIComponent(id)}`);
}

export function listPlatformPermissions() {
  return http.get<PlatformPermission[]>('/platform/access/roles/permissions');
}

function normalizeUserQuery(query: PlatformUserListQuery): PlatformUserListQuery {
  return compact({ page: query.page, limit: query.limit, search: normalizePlatformAccessSearch(query.search), status: query.status });
}

function normalizeRoleQuery(query: PlatformRoleListQuery): PlatformRoleListQuery {
  return compact({ page: query.page, limit: query.limit, search: normalizePlatformAccessSearch(query.search), systemName: query.systemName });
}

function parameters<T extends object, K extends readonly (keyof T)[]>(query: T, keys: K) {
  return compact(Object.fromEntries(keys.map((key) => [key, query[key]])) as Partial<T>);
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as T;
}
