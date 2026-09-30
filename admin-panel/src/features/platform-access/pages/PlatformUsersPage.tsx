import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { CreatePlatformUserDialog } from '../components/CreatePlatformUserDialog';
import { PlatformUserDetailsDialog } from '../components/PlatformUserDetailsDialog';
import { PlatformUserFilters, type PlatformUserFilterDraft } from '../components/PlatformUserFilters';
import { PlatformUserList } from '../components/PlatformUserList';
import { platformAccessError } from '../components/platform-access-errors';
import { listPlatformUsers, platformAccessKeys } from '../platform-access-api';
import { listAllPlatformRoles } from '../platform-role-catalog';
import type { PlatformUserListQuery } from '../platform-access.types';
import { defaultPlatformUserQuery, parsePlatformUsersUrl, serializePlatformUsersUrl } from '../platform-access-url';

export default function PlatformUsersPage() {
  const [params, setParams] = useSearchParams(); const parsed = useMemo(() => parsePlatformUsersUrl(params), [params]); const applied = parsed.query;
  const [draft, setDraft] = useState<PlatformUserFilterDraft>(() => toDraft(applied)); const [createOpen, setCreateOpen] = useState(false); const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (parsed.shouldNormalize) setParams(parsed.normalized, { replace: true }); setDraft(toDraft(applied)); }, [applied.page, applied.search, applied.status, parsed.shouldNormalize, parsed.normalized, setParams]);
  const users = useQuery({ queryKey: platformAccessKeys.userList(applied), queryFn: () => listPlatformUsers(applied), placeholderData: (previous) => previous });
  const roles = useQuery({ queryKey: platformAccessKeys.roleCatalog(), queryFn: listAllPlatformRoles, staleTime: 60_000 });
  const response = users.data?.data; const rows = response?.data ?? []; const total = response?.meta.total ?? 0; const retained = Boolean(response); const filtered = Boolean(applied.search || applied.status);
  useEffect(() => { const pages = response?.meta.totalPages ?? 0; if (pages > 0 && applied.page > pages) setParams(serializePlatformUsersUrl({ ...applied, page: pages }, params), { replace: true }); }, [applied, params, response?.meta.totalPages, setParams]);
  const apply = () => { const next: PlatformUserListQuery = { ...defaultPlatformUserQuery(), search: draft.search.trim() || undefined, status: draft.status as PlatformUserListQuery['status'] || undefined }; setParams(serializePlatformUsersUrl(next, params)); };
  const reset = () => setParams(serializePlatformUsersUrl(defaultPlatformUserQuery(), params));
  return <PageLayout>
    <PageHeader title="Platform Users" description="Manage platform identities and their global roles through the dedicated platform-access authority." breadcrumbs={['Admin', 'Platform Access', 'Users']} primaryAction={<Button variant="contained" onClick={() => setCreateOpen(true)} sx={{ width: { xs: '100%', sm: 'auto' } }}>Create Platform User</Button>} />
    <PlatformUserFilters draft={draft} filtered={filtered} fetching={users.isFetching} summary={total ? `${total} platform user${total === 1 ? '' : 's'}` : filtered ? 'No users match the applied filters.' : 'No platform users available.'} onChange={setDraft} onApply={apply} onReset={reset} onRefresh={() => void users.refetch()} />
    {roles.isError ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void roles.refetch()}>Retry</Button>}>Global roles could not be loaded. User role actions are temporarily unavailable.</Alert> : null}
    {users.isFetching && !users.isLoading ? <LinearProgress aria-label="Updating platform users" /> : null}
    {users.isRefetchError && retained ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void users.refetch()}>Retry</Button>}>We couldn't refresh platform users. Showing the most recent available data.</Alert> : null}
    {users.isError && !retained ? <Alert severity="error" action={<Button onClick={() => void users.refetch()}>Retry</Button>}>{platformAccessError(users.error, 'Platform users could not be loaded.')}</Alert> : <PlatformUserList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={users.isLoading} filtered={filtered} onManage={setSelectedId} onPaginationChange={(page) => setParams(serializePlatformUsersUrl({ ...applied, page }, params))} />}
    <CreatePlatformUserDialog open={createOpen} roles={roles.data ?? []} onClose={() => setCreateOpen(false)} />
    <PlatformUserDetailsDialog open={Boolean(selectedId)} userId={selectedId} roles={roles.data ?? []} onClose={() => setSelectedId(null)} />
  </PageLayout>;
}

function toDraft(query: PlatformUserListQuery): PlatformUserFilterDraft { return { search: query.search ?? '', status: query.status ?? '' }; }
