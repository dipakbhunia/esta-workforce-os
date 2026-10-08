import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, patch, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get, post, patch, delete: remove } }));

import * as platformAccessApi from './platform-access-api';
import {
  assignPlatformUserRole,
  createPlatformUser,
  deletePlatformUser,
  getPlatformRole,
  getPlatformAuditLog,
  getPlatformUser,
  listPlatformPermissions,
  listPlatformAuditLogs,
  listPlatformRoles,
  listPlatformUsers,
  platformAccessKeys,
  removePlatformUserRole,
  updatePlatformUser,
  updatePlatformUserStatus,
} from './platform-access-api';

describe('platform access API', () => {
  beforeEach(() => { for (const mock of [get, post, patch, remove]) mock.mockReset().mockResolvedValue({ data: {} }); });

  it('serializes only supported user list parameters and omits empty filters', async () => {
    await listPlatformUsers({ page: 2, limit: 20, search: 'admin', status: 'ACTIVE' });
    expect(get).toHaveBeenLastCalledWith('/platform/access/users', { params: { page: 2, limit: 20, search: 'admin', status: 'ACTIVE' } });
    await listPlatformUsers({ page: 1, limit: 20, search: '' });
    expect(get).toHaveBeenLastCalledWith('/platform/access/users', { params: { page: 1, limit: 20 } });
    await listPlatformUsers({ page: 1, limit: 20, search: ' \t\n ' });
    expect(get).toHaveBeenLastCalledWith('/platform/access/users', { params: { page: 1, limit: 20 } });
    await listPlatformUsers({ page: 1, limit: 20, search: '  Alice Smith  ' });
    expect(get).toHaveBeenLastCalledWith('/platform/access/users', { params: { page: 1, limit: 20, search: 'Alice Smith' } });
  });

  it('uses exact encoded user detail and mutation routes with bounded payloads', async () => {
    await getPlatformUser('user/id');
    expect(get).toHaveBeenCalledWith('/platform/access/users/user%2Fid');
    const create = { email: 'admin@example.invalid', firstName: 'Platform', lastName: 'Admin', roleIds: ['role-1'] };
    await createPlatformUser({ ...create, companyId: 'forbidden' } as typeof create);
    expect(post).toHaveBeenCalledWith('/platform/access/users', create);
    await updatePlatformUser('user/id', { email: 'next@example.invalid', firstName: undefined });
    expect(patch).toHaveBeenCalledWith('/platform/access/users/user%2Fid', { email: 'next@example.invalid' });
    await updatePlatformUserStatus('user/id', { status: 'SUSPENDED' });
    expect(patch).toHaveBeenCalledWith('/platform/access/users/user%2Fid/status', { status: 'SUSPENDED' });
    await deletePlatformUser('user/id');
    expect(remove).toHaveBeenCalledWith('/platform/access/users/user%2Fid');
    await assignPlatformUserRole('user/id', { roleId: 'role-1' });
    expect(post).toHaveBeenCalledWith('/platform/access/users/user%2Fid/roles', { roleId: 'role-1' });
    await removePlatformUserRole('user/id', 'role/id');
    expect(remove).toHaveBeenCalledWith('/platform/access/users/user%2Fid/roles/role%2Fid');
  });

  it('implements the exact read-only role contract', async () => {
    await listPlatformRoles({ page: 3, limit: 20, search: 'admin', systemName: 'SUPER_ADMIN' });
    expect(get).toHaveBeenCalledWith('/platform/access/roles', { params: { page: 3, limit: 20, search: 'admin', systemName: 'SUPER_ADMIN' } });
    await getPlatformRole('role/id');
    expect(get).toHaveBeenCalledWith('/platform/access/roles/role%2Fid');
    await listPlatformPermissions();
    expect(get).toHaveBeenCalledWith('/platform/access/roles/permissions');
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining('/platform/access/roles'), expect.anything());
    expect(patch).not.toHaveBeenCalledWith(expect.stringContaining('/platform/access/roles'), expect.anything());
    await listPlatformRoles({ page: 1, limit: 20, search: '   ' });
    expect(get).toHaveBeenLastCalledWith('/platform/access/roles', { params: { page: 1, limit: 20 } });
    await listPlatformRoles({ page: 1, limit: 20, search: '  Global Admin  ' });
    expect(get).toHaveBeenLastCalledWith('/platform/access/roles', { params: { page: 1, limit: 20, search: 'Global Admin' } });
    for (const unsupported of ['createPlatformRole', 'updatePlatformRole', 'deletePlatformRole', 'replacePlatformRolePermissions']) {
      expect(platformAccessApi).not.toHaveProperty(unsupported);
    }
  });

  it('creates stable normalized query keys containing every supported filter', () => {
    expect(platformAccessKeys.userList({ page: 1, limit: 20, search: '' })).toEqual(platformAccessKeys.userList({ page: 1, limit: 20 }));
    expect(platformAccessKeys.userList({ page: 1, limit: 20, search: ' \t\n' })).toEqual(platformAccessKeys.userList({ page: 1, limit: 20 }));
    expect(platformAccessKeys.userList({ page: 1, limit: 20, search: ' Alice ' })).toEqual(platformAccessKeys.userList({ page: 1, limit: 20, search: 'Alice' }));
    expect(platformAccessKeys.userList({ page: 1, limit: 20, status: 'ACTIVE' })).not.toEqual(platformAccessKeys.userList({ page: 1, limit: 20, status: 'INACTIVE' }));
    expect(platformAccessKeys.roleList({ page: 1, limit: 20, systemName: 'SUPER_ADMIN' })).not.toEqual(platformAccessKeys.roleList({ page: 1, limit: 20, systemName: 'HR' }));
    expect(platformAccessKeys.roleList({ page: 1, limit: 20, search: '   ' })).toEqual(platformAccessKeys.roleList({ page: 1, limit: 20 }));
    expect(platformAccessKeys.roleList({ page: 1, limit: 20, search: ' Admin ' })).toEqual(platformAccessKeys.roleList({ page: 1, limit: 20, search: 'Admin' }));
    expect(platformAccessKeys.auditList({ page: 1, limit: 20, action: 'ONE' })).not.toEqual(platformAccessKeys.auditList({ page: 1, limit: 20, action: 'TWO' }));
    expect(platformAccessKeys.audit('one')).not.toEqual(platformAccessKeys.audit('two'));
  });

  it('uses exact read-only audit endpoints and only supported list parameters', async () => {
    await listPlatformAuditLogs({ page: 2, limit: 20, action: 'PLATFORM_USER_UPDATED', entityType: 'User', actorUserId: '11111111-1111-4111-8111-111111111111', search: 'forbidden' } as never);
    expect(get).toHaveBeenLastCalledWith('/platform/access/audit-logs', { params: { page: 2, limit: 20, action: 'PLATFORM_USER_UPDATED', entityType: 'User', actorUserId: '11111111-1111-4111-8111-111111111111' } });
    await getPlatformAuditLog('audit/id');
    expect(get).toHaveBeenLastCalledWith('/platform/access/audit-logs/audit%2Fid');
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining('/audit-logs'), expect.anything());
    expect(patch).not.toHaveBeenCalledWith(expect.stringContaining('/audit-logs'), expect.anything());
    expect(remove).not.toHaveBeenCalledWith(expect.stringContaining('/audit-logs'));
  });
});
