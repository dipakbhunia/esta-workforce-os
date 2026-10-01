import { normalizePlatformAccessSearch } from './platform-access.types';
import type { PlatformAuditListQuery, PlatformRoleListQuery, PlatformRoleSystemName, PlatformUserListQuery, PlatformUserStatus } from './platform-access.types';

export const PLATFORM_ACCESS_DEFAULT_PAGE = 1;
export const PLATFORM_ACCESS_DEFAULT_LIMIT = 20;

const USER_OWNED = ['page', 'search', 'status'] as const;
const ROLE_OWNED = ['page', 'search', 'systemName'] as const;
const AUDIT_OWNED = ['page', 'action', 'entityType', 'actorUserId'] as const;
const USER_STATUSES = new Set<PlatformUserStatus>(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
const ROLE_SYSTEM_NAMES = new Set<PlatformRoleSystemName>(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']);
const AUDIT_ACTION = /^[A-Z][A-Z0-9_]{1,99}$/;
const AUDIT_ENTITY = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function parsePlatformAuditUrl(input: URLSearchParams) {
  const query: PlatformAuditListQuery = { page: positive(input.get('page')) ?? PLATFORM_ACCESS_DEFAULT_PAGE, limit: PLATFORM_ACCESS_DEFAULT_LIMIT };
  const action = input.get('action')?.trim();
  const entityType = input.get('entityType')?.trim();
  const actorUserId = input.get('actorUserId')?.trim();
  if (action && AUDIT_ACTION.test(action)) query.action = action;
  if (entityType && AUDIT_ENTITY.test(entityType)) query.entityType = entityType;
  if (actorUserId && UUID.test(actorUserId)) query.actorUserId = actorUserId;
  const normalized = serializePlatformAuditUrl(query, input);
  return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}

export function serializePlatformAuditUrl(query: PlatformAuditListQuery, current = new URLSearchParams()) {
  const params = withoutOwned(current, AUDIT_OWNED);
  params.set('page', String(validPage(query.page)));
  if (query.action && AUDIT_ACTION.test(query.action)) params.set('action', query.action);
  if (query.entityType && AUDIT_ENTITY.test(query.entityType)) params.set('entityType', query.entityType);
  if (query.actorUserId && UUID.test(query.actorUserId)) params.set('actorUserId', query.actorUserId);
  return params;
}

export function defaultPlatformAuditQuery(): PlatformAuditListQuery {
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
