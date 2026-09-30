import { beforeEach, describe, expect, it, vi } from 'vitest';
const { listRoles } = vi.hoisted(() => ({ listRoles: vi.fn() }));
vi.mock('./platform-access-api', async (original) => ({ ...(await original<typeof import('./platform-access-api')>()), listPlatformRoles: listRoles }));
import { listAllPlatformRoles } from './platform-role-catalog';
import type { PlatformRole } from './platform-access.types';

describe('complete platform role catalog', () => {
  beforeEach(() => { listRoles.mockReset(); });
  it('loads every authoritative page, preserves order, and deduplicates role IDs', async () => {
    const first = Array.from({ length: 100 }, (_, index) => role(`role-${index}`));
    const second = [role('role-99'), ...Array.from({ length: 21 }, (_, index) => role(`role-${100 + index}`))];
    listRoles.mockResolvedValueOnce(response(first, 1, 2, 121)).mockResolvedValueOnce(response(second, 2, 2, 121));
    const result = await listAllPlatformRoles();
    expect(listRoles.mock.calls.map((call) => call[0])).toEqual([{ page: 1, limit: 100 }, { page: 2, limit: 100 }]);
    expect(result).toHaveLength(121);
    expect(result.map((item) => item.id)).toEqual(Array.from({ length: 121 }, (_, index) => `role-${index}`));
  });
  it.each([
    { data: [role('one')], meta: { page: 1, limit: 100, total: 2, totalPages: Number.NaN } },
    { data: [role('one')], meta: { page: 2, limit: 100, total: 2, totalPages: 2 } },
  ])('rejects malformed pagination metadata without looping', async (payload) => {
    listRoles.mockResolvedValue({ data: payload });
    await expect(listAllPlatformRoles()).rejects.toThrow(/pagination metadata is invalid/);
    expect(listRoles).toHaveBeenCalledTimes(1);
  });
  it('rejects a non-progressing page', async () => {
    listRoles.mockResolvedValue(response([], 1, 2, 101));
    await expect(listAllPlatformRoles()).rejects.toThrow(/did not make progress/);
    expect(listRoles).toHaveBeenCalledTimes(1);
  });
});
function role(id: string): PlatformRole { return { id, companyId: null, key: id, name: id, description: null, systemName: null, createdAt: '', updatedAt: '', permissions: [], _count: { users: 0 } }; }
function response(data: PlatformRole[], page: number, totalPages: number, total: number) { return { data: { data, meta: { page, limit: 100, total, totalPages } } }; }
