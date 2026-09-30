import { describe, expect, it } from 'vitest';
import {
  defaultPlatformRoleQuery,
  defaultPlatformUserQuery,
  parsePlatformRolesUrl,
  parsePlatformUsersUrl,
  serializePlatformRolesUrl,
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
});
