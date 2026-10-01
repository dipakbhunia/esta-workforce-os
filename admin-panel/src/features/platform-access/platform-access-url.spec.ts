import { describe, expect, it } from 'vitest';
import {
  defaultPlatformRoleQuery,
  defaultPlatformAuditQuery,
  defaultPlatformUserQuery,
  parsePlatformRolesUrl,
  parsePlatformAuditUrl,
  parsePlatformUsersUrl,
  serializePlatformRolesUrl,
  serializePlatformAuditUrl,
  serializePlatformUsersUrl,
} from './platform-access-url';

describe('platform access URL state', () => {
  it('hydrates valid user state without propagating unrelated parameters into the query', () => {
    const parsed = parsePlatformUsersUrl(new URLSearchParams('page=2&search=admin&status=SUSPENDED&keep=yes'));
    expect(parsed.query).toEqual({ page: 2, limit: 20, search: 'admin', status: 'SUSPENDED' });
    expect(parsed.query).not.toHaveProperty('keep');
    expect(parsed.normalized.get('keep')).toBe('yes');
  });

  it('normalizes invalid user state and canonicalizes reset defaults', () => {
    const parsed = parsePlatformUsersUrl(new URLSearchParams('page=0&search=&status=DELETED'));
    expect(parsed.query).toEqual(defaultPlatformUserQuery());
    expect(parsed.normalized.toString()).toBe('page=1');
    expect(serializePlatformUsersUrl(defaultPlatformUserQuery()).toString()).toBe('page=1');
  });

  it('canonicalizes user search whitespace at the public URL boundary', () => {
    expect(parsePlatformUsersUrl(new URLSearchParams('page=1&search=%20%09%0A')).query).toEqual(defaultPlatformUserQuery());
    expect(parsePlatformUsersUrl(new URLSearchParams('page=1&search=%20%20Alice%20Smith%20%20')).query.search).toBe('Alice Smith');
    expect(serializePlatformUsersUrl({ page: 1, limit: 20, search: ' \t ' }).toString()).toBe('page=1');
    expect(serializePlatformUsersUrl({ page: 1, limit: 20, search: '  Alice  ' }).get('search')).toBe('Alice');
  });

  it('hydrates supported role state and rejects unsupported system names', () => {
    expect(parsePlatformRolesUrl(new URLSearchParams('page=4&search=global&systemName=SUPER_ADMIN')).query).toEqual({ page: 4, limit: 20, search: 'global', systemName: 'SUPER_ADMIN' });
    expect(parsePlatformRolesUrl(new URLSearchParams('page=x&systemName=TEAM_LEAD')).query).toEqual(defaultPlatformRoleQuery());
  });

  it('serializes canonical role state while preserving unrelated URL parameters', () => {
    const params = serializePlatformRolesUrl({ page: 2, limit: 20, search: 'role', systemName: 'HR' }, new URLSearchParams('keep=yes&status=ACTIVE'));
    expect(params.toString()).toBe('keep=yes&status=ACTIVE&page=2&search=role&systemName=HR');
    expect(serializePlatformRolesUrl(defaultPlatformRoleQuery()).toString()).toBe('page=1');
  });

  it('canonicalizes role search whitespace and every unsafe page shape', () => {
    expect(parsePlatformRolesUrl(new URLSearchParams('page=1&search=%20%09%0A')).query).toEqual(defaultPlatformRoleQuery());
    expect(parsePlatformRolesUrl(new URLSearchParams('page=1&search=%20%20Global%20Admin%20%20')).query.search).toBe('Global Admin');
    expect(serializePlatformRolesUrl({ page: 1, limit: 20, search: ' \n ' }).toString()).toBe('page=1');
    expect(serializePlatformRolesUrl({ page: 1, limit: 20, search: '  Admin  ' }).get('search')).toBe('Admin');
    for (const page of ['-1', '-200', '1.5']) {
      expect(parsePlatformRolesUrl(new URLSearchParams(`page=${page}`)).query).toEqual(defaultPlatformRoleQuery());
    }
  });

  it('hydrates exact valid audit filters and preserves unrelated parameters', () => {
    const parsed = parsePlatformAuditUrl(new URLSearchParams('page=3&action=PLATFORM_USER_UPDATED&entityType=User&actorUserId=11111111-1111-4111-8111-111111111111&keep=yes'));
    expect(parsed.query).toEqual({ page: 3, limit: 20, action: 'PLATFORM_USER_UPDATED', entityType: 'User', actorUserId: '11111111-1111-4111-8111-111111111111' });
    expect(parsed.normalized.get('keep')).toBe('yes');
    expect(parsed.query).not.toHaveProperty('keep');
  });

  it('removes invalid owned audit values and serializes only canonical authority', () => {
    const parsed = parsePlatformAuditUrl(new URLSearchParams('page=0&action=bad-action&entityType=9User&actorUserId=nope&keep=yes'));
    expect(parsed.query).toEqual(defaultPlatformAuditQuery());
    expect(parsed.normalized.toString()).toBe('keep=yes&page=1');
    expect(serializePlatformAuditUrl({ page: 2, limit: 20, action: 'AUTH_LOGIN', entityType: 'User', actorUserId: '11111111-1111-4111-8111-111111111111' }).toString()).toBe('page=2&action=AUTH_LOGIN&entityType=User&actorUserId=11111111-1111-4111-8111-111111111111');
  });

  it.each([
    { length: 1, value: 'A', accepted: false },
    { length: 2, value: 'AA', accepted: true },
    { length: 100, value: 'A'.repeat(100), accepted: true },
    { length: 101, value: 'A'.repeat(101), accepted: false },
  ])('enforces the exact audit action length boundary at $length characters', ({ value, accepted }) => {
    const parsed = parsePlatformAuditUrl(new URLSearchParams({ action: value }));
    expect(parsed.query.action).toBe(accepted ? value : undefined);
    expect(parsed.normalized.has('action')).toBe(accepted);
  });

  it.each([
    { length: 1, value: 'A', accepted: true },
    { length: 100, value: 'A'.repeat(100), accepted: true },
    { length: 101, value: 'A'.repeat(101), accepted: false },
  ])('enforces the exact audit entity type length boundary at $length characters', ({ value, accepted }) => {
    const parsed = parsePlatformAuditUrl(new URLSearchParams({ entityType: value }));
    expect(parsed.query.entityType).toBe(accepted ? value : undefined);
    expect(parsed.normalized.has('entityType')).toBe(accepted);
  });
});
