import { Alert, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlatformAuditDetailsDialog } from '../components/PlatformAuditDetailsDialog';
import { PlatformAuditFilters, type PlatformAuditFilterDraft } from '../components/PlatformAuditFilters';
import { PlatformAuditList } from '../components/PlatformAuditList';
import { platformAuditError } from '../components/platform-access-errors';
import { listPlatformAuditLogs, platformAccessKeys } from '../platform-access-api';
import type { PlatformAuditListQuery } from '../platform-access.types';
import { defaultPlatformAuditQuery, parsePlatformAuditUrl, serializePlatformAuditUrl } from '../platform-access-url';

export default function PlatformAuditLogsPage() {
  const [params, setParams] = useSearchParams(); const parsed = useMemo(() => parsePlatformAuditUrl(params), [params]); const applied = parsed.query; const [draft, setDraft] = useState<PlatformAuditFilterDraft>(() => toDraft(applied)); const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (parsed.shouldNormalize) setParams(parsed.normalized, { replace: true }); setDraft(toDraft(applied)); }, [applied.page, applied.action, applied.entityType, applied.actorUserId, parsed.shouldNormalize, parsed.normalized, setParams]);
  const audits = useQuery({ queryKey: platformAccessKeys.auditList(applied), queryFn: () => listPlatformAuditLogs(applied), placeholderData: (previous) => previous }); const response = audits.data?.data; const rows = response?.data ?? []; const total = response?.meta.total ?? 0; const retained = Boolean(response); const filtered = Boolean(applied.action || applied.entityType || applied.actorUserId);
  useEffect(() => { if (!response) return; const pages = response.meta.totalPages; const canonical = pages === 0 ? 1 : Math.min(applied.page, pages); if (applied.page !== canonical) setParams(serializePlatformAuditUrl({ ...applied, page: canonical }, params), { replace: true }); }, [applied, params, response, setParams]);
  const apply = () => { const next: PlatformAuditListQuery = { ...defaultPlatformAuditQuery(), ...(draft.action.trim() ? { action: draft.action.trim() } : {}), ...(draft.entityType.trim() ? { entityType: draft.entityType.trim() } : {}), ...(draft.actorUserId.trim() ? { actorUserId: draft.actorUserId.trim() } : {}) }; setParams(serializePlatformAuditUrl(next, params)); };
  const reset = () => setParams(serializePlatformAuditUrl(defaultPlatformAuditQuery(), params));
  return <PageLayout><PageHeader title="Audit Logs" description="Review immutable platform administration evidence from the dedicated platform-access authority." breadcrumbs={['Admin', 'Platform Access', 'Audit Logs']} />
    <Alert severity="info">Read-only platform audit evidence. Logs cannot be created, edited, deleted, exported, or cleared from this page.</Alert>
    <PlatformAuditFilters draft={draft} filtered={filtered} fetching={audits.isFetching} summary={total ? `${total} audit record${total === 1 ? '' : 's'}` : filtered ? 'No audit records match the applied filters.' : 'No platform audit records available.'} onChange={setDraft} onApply={apply} onReset={reset} onRefresh={() => void audits.refetch()} />
    {audits.isFetching && !audits.isLoading ? <LinearProgress aria-label="Updating platform audit logs" /> : null}
    {audits.isRefetchError && retained ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void audits.refetch()}>Retry</Button>}>We couldn't refresh platform audit logs. Showing the most recent available data.</Alert> : null}
    {audits.isError && !retained ? <Alert severity="error" action={<Button color="inherit" onClick={() => void audits.refetch()}>Retry</Button>}>{platformAuditError(audits.error, 'Platform audit logs could not be loaded.')}</Alert> : <PlatformAuditList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={audits.isLoading} filtered={filtered} onView={setSelectedId} onPaginationChange={(page) => setParams(serializePlatformAuditUrl({ ...applied, page }, params))} />}
    <PlatformAuditDetailsDialog open={Boolean(selectedId)} auditId={selectedId} onClose={() => setSelectedId(null)} />
  </PageLayout>;
}
function toDraft(query: PlatformAuditListQuery): PlatformAuditFilterDraft { return { action: query.action ?? '', entityType: query.entityType ?? '', actorUserId: query.actorUserId ?? '' }; }
