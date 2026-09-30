import { listPlatformRoles } from './platform-access-api';
import type { PlatformRole } from './platform-access.types';

const PAGE_LIMIT = 100;
const MAX_PAGES = 1_000;

export async function listAllPlatformRoles(): Promise<PlatformRole[]> {
  const roles: PlatformRole[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await listPlatformRoles({ page, limit: PAGE_LIMIT });
    const { data, meta } = response.data;
    if (!Array.isArray(data) || !validMeta(meta.page, meta.totalPages) || meta.page !== page) throw new Error('Platform role pagination metadata is invalid.');
    for (const role of data) if (!seen.has(role.id)) { seen.add(role.id); roles.push(role); }
    if (page >= meta.totalPages) return roles;
    if (data.length === 0) throw new Error('Platform role pagination did not make progress.');
  }

  throw new Error('Platform role catalog exceeded the safe pagination limit.');
}

function validMeta(page: number, totalPages: number) {
  return Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(totalPages) && totalPages >= 0;
}
