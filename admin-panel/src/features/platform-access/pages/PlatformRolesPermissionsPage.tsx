import { Alert, Button, LinearProgress, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlatformPermissionCatalog } from '../components/PlatformPermissionCatalog';
import { PlatformRoleDetailsDialog } from '../components/PlatformRoleDetailsDialog';
import { PlatformRoleFilters, type PlatformRoleFilterDraft } from '../components/PlatformRoleFilters';
import { PlatformRoleList } from '../components/PlatformRoleList';
import { platformAccessError } from '../components/platform-access-errors';
import { listPlatformPermissions, listPlatformRoles, platformAccessKeys } from '../platform-access-api';
import type { PlatformRoleListQuery } from '../platform-access.types';
import { defaultPlatformRoleQuery, parsePlatformRolesUrl, serializePlatformRolesUrl } from '../platform-access-url';

export default function PlatformRolesPermissionsPage() {
  const [params, setParams] = useSearchParams(); const parsed = useMemo(() => parsePlatformRolesUrl(params), [params]); const applied = parsed.query;
  const [draft, setDraft] = useState<PlatformRoleFilterDraft>(() => toDraft(applied)); const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (parsed.shouldNormalize) setParams(parsed.normalized, { replace: true }); setDraft(toDraft(applied)); }, [applied.page, applied.search, applied.systemName, parsed.shouldNormalize, parsed.normalized, setParams]);
  const roles = useQuery({ queryKey: platformAccessKeys.roleList(applied), queryFn: () => listPlatformRoles(applied), placeholderData: (previous) => previous });
  const permissions = useQuery({ queryKey: platformAccessKeys.permissions(), queryFn: listPlatformPermissions, placeholderData: (previous) => previous });
  const response = roles.data?.data; const rows = response?.data ?? []; const total = response?.meta.total ?? 0; const retainedRoles = Boolean(response); const filtered = Boolean(applied.search || applied.systemName); const permissionData = permissions.data?.data ?? []; const retainedPermissions = Boolean(permissions.data);
  useEffect(() => { if (!response) return; const pages = response.meta.totalPages; const canonicalPage = pages === 0 ? 1 : Math.min(applied.page, pages); if (applied.page !== canonicalPage) setParams(serializePlatformRolesUrl({ ...applied, page: canonicalPage }, params), { replace: true }); }, [applied, params, response, setParams]);
  const apply = () => { const next: PlatformRoleListQuery = { ...defaultPlatformRoleQuery(), search: draft.search.trim() || undefined, systemName: draft.systemName as PlatformRoleListQuery['systemName'] || undefined }; setParams(serializePlatformRolesUrl(next, params)); };
  const reset = () => setParams(serializePlatformRolesUrl(defaultPlatformRoleQuery(), params));
  return <PageLayout><PageHeader title="Roles & Permissions" description="Review global platform roles and descriptive permission metadata." breadcrumbs={['Admin', 'Platform Access', 'Roles & Permissions']} />
    <Alert severity="info">Read-only reference. Permission assignments shown here are configuration metadata. Runtime access remains enforced by the application's established authorization rules; access cannot be changed from this page.</Alert>
    <PlatformRoleFilters draft={draft} filtered={filtered} fetching={roles.isFetching} summary={total ? `${total} global role${total === 1 ? '' : 's'}` : filtered ? 'No roles match the applied filters.' : 'No platform roles available.'} onChange={setDraft} onApply={apply} onReset={reset} onRefresh={() => void roles.refetch()} />
    {roles.isFetching && !roles.isLoading ? <LinearProgress aria-label="Updating platform roles" /> : null}
    {roles.isRefetchError && retainedRoles ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void roles.refetch()}>Retry</Button>}>We couldn't refresh platform roles. Showing the most recent available data.</Alert> : null}
    {roles.isError && !retainedRoles ? <Alert severity="error" action={<Button color="inherit" onClick={() => void roles.refetch()}>Retry</Button>}>{platformAccessError(roles.error, 'Platform roles could not be loaded.')}</Alert> : <PlatformRoleList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={roles.isLoading} filtered={filtered} onView={setSelectedId} onPaginationChange={(page) => setParams(serializePlatformRolesUrl({ ...applied, page }, params))} />}
    <PlatformPermissionCatalog permissions={permissionData} loading={permissions.isLoading} fetching={permissions.isFetching} retained={retainedPermissions} error={permissions.isError ? platformAccessError(permissions.error, 'The permission catalog could not be loaded.') : null} onRetry={() => void permissions.refetch()} />
    <PlatformRoleDetailsDialog open={Boolean(selectedId)} roleId={selectedId} onClose={() => setSelectedId(null)} />
  </PageLayout>;
}

function toDraft(query: PlatformRoleListQuery): PlatformRoleFilterDraft { return { search: query.search ?? '', systemName: query.systemName ?? '' }; }
