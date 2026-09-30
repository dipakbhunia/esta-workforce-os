import { normalizePlatformAccessSearch } from './platform-access.types';
import type { PlatformRoleListQuery, PlatformRoleSystemName, PlatformUserListQuery, PlatformUserStatus } from './platform-access.types';

export const PLATFORM_ACCESS_DEFAULT_PAGE = 1;
export const PLATFORM_ACCESS_DEFAULT_LIMIT = 20;

const USER_OWNED = ['page', 'search', 'status'] as const;
const ROLE_OWNED = ['page', 'search', 'systemName'] as const;
const USER_STATUSES = new Set<PlatformUserStatus>(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
const ROLE_SYSTEM_NAMES = new Set<PlatformRoleSystemName>(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']);

export function parsePlatformUsersUrl(input: URLSearchParams) {
  const query: PlatformUserListQuery = { page: positive(input.get('page')) ?? PLATFORM_ACCESS_DEFAULT_PAGE, limit: PLATFORM_ACCESS_DEFAULT_LIMIT };
  const search = normalizePlatformAccessSearch(input.get('search'));
  if (search) query.search = search;
  const status = input.get('status') as PlatformUserStatus;
  if (USER_STATUSES.has(status)) query.status = status;
  const normalized = serializePlatformUsersUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}

export function serializePlatformUsersUrl(query: PlatformUserListQuery, current = new URLSearchParams()) {
  const params = withoutOwned(current, USER_OWNED);
  params.set('page', String(validPage(query.page)));
  const search = normalizePlatformAccessSearch(query.search);
  if (search) params.set('search', search);
  if (query.status && USER_STATUSES.has(query.status)) params.set('status', query.status);
  return params;
}

export function parsePlatformRolesUrl(input: URLSearchParams) {
  const query: PlatformRoleListQuery = { page: positive(input.get('page')) ?? PLATFORM_ACCESS_DEFAULT_PAGE, limit: PLATFORM_ACCESS_DEFAULT_LIMIT };
  const search = normalizePlatformAccessSearch(input.get('search'));
  if (search) query.search = search;
  const systemName = input.get('systemName') as PlatformRoleSystemName;
  if (ROLE_SYSTEM_NAMES.has(systemName)) query.systemName = systemName;
  const normalized = serializePlatformRolesUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}

export function serializePlatformRolesUrl(query: PlatformRoleListQuery, current = new URLSearchParams()) {
  const params = withoutOwned(current, ROLE_OWNED);
  params.set('page', String(validPage(query.page)));
  const search = normalizePlatformAccessSearch(query.search);
  if (search) params.set('search', search);
  if (query.systemName && ROLE_SYSTEM_NAMES.has(query.systemName)) params.set('systemName', query.systemName);
  return params;
}

export function defaultPlatformUserQuery(): PlatformUserListQuery {
  return { page: PLATFORM_ACCESS_DEFAULT_PAGE, limit: PLATFORM_ACCESS_DEFAULT_LIMIT };
}

export function defaultPlatformRoleQuery(): PlatformRoleListQuery {
  return { page: PLATFORM_ACCESS_DEFAULT_PAGE, limit: PLATFORM_ACCESS_DEFAULT_LIMIT };
}

function withoutOwned(current: URLSearchParams, owned: readonly string[]) {
  const params = new URLSearchParams(current);
  for (const key of owned) params.delete(key);
  return params;
}

function validPage(page: number) {
  return Number.isSafeInteger(page) && page > 0 ? page : PLATFORM_ACCESS_DEFAULT_PAGE;
}

function positive(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
