import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlatformDunningFilters, type PlatformDunningFilterDraft } from '../components/PlatformDunningFilters';
import { PlatformDunningList } from '../components/PlatformDunningList';
import { listPlatformDunning, platformDunningKeys } from '../platform-dunning-api';
import type { PlatformDunningListQuery } from '../platform-dunning.types';
import { dunningIsoToLocal, localDateTimeToDunningIso, parsePlatformDunningUrl, serializePlatformDunningUrl } from '../platform-dunning-url';

export default function PlatformDunningPage() {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parsePlatformDunningUrl(params), [params]);
  const applied = parsed.query;
  const [draft, setDraft] = useState(() => toDraft(applied));
  useEffect(() => {
    if (parsed.shouldNormalize) setParams(parsed.normalized, { replace: true });
    setDraft(toDraft(applied));
  }, [applied.companyId, applied.from, applied.limit, applied.page, applied.paymentId, applied.paymentStatus, applied.renewalId, applied.subscriptionId, applied.to, parsed.shouldNormalize, setParams]);
  const query = useQuery({ queryKey: platformDunningKeys.list(applied), queryFn: () => listPlatformDunning(applied), placeholderData: previous => previous, refetchInterval: 60_000 });
  const response = query.data?.data;
  const rows = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const filtered = hasFilters(applied);
  const retained = response !== undefined;
  useEffect(() => {
    const pages = response?.meta.totalPages ?? 0;
    if (pages > 0 && applied.page > pages) setParams(serializePlatformDunningUrl({ ...applied, page: pages }, params), { replace: true });
  }, [applied, params, response?.meta.totalPages, setParams]);
  const apply = () => {
    const next: PlatformDunningListQuery = { page: 1, limit: applied.limit };
    for (const key of ['companyId', 'subscriptionId', 'renewalId', 'paymentId'] as const) if (draft[key].trim()) next[key] = draft[key].trim();
    if (draft.paymentStatus) next.paymentStatus = draft.paymentStatus as PlatformDunningListQuery['paymentStatus'];
    if (draft.from && draft.to) Object.assign(next, { from: localDateTimeToDunningIso(draft.from)!, to: localDateTimeToDunningIso(draft.to)! });
    setParams(serializePlatformDunningUrl(next, params));
  };
  const reset = () => setParams(serializePlatformDunningUrl({ page: 1, limit: applied.limit }, params));
  const paginate = (page: number, limit: number) => setParams(serializePlatformDunningUrl({ ...applied, page: limit === applied.limit ? page : 1, limit }, params));
  return <PageLayout><PageHeader title="Dunning" description="Review due unresolved subscription Renewal payments." breadcrumbs={['Admin', 'Billing', 'Dunning']} />
    <PlatformDunningFilters draft={draft} filtered={filtered} fetching={query.isFetching} summary={total ? `${total} open Dunning record${total === 1 ? '' : 's'}` : filtered ? 'No Dunning records match the applied filters.' : 'No open Dunning records.'} onChange={setDraft} onApply={apply} onClear={reset} onRefresh={() => void query.refetch()} />
    {query.isLoading ? <Box role="status" sx={hidden}>Loading Dunning register</Box> : null}
    {query.isFetching && !query.isLoading ? <LinearProgress aria-label="Updating Dunning register" /> : null}
    {query.isRefetchError && retained ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>We couldn't refresh the Dunning register. Showing the most recent available data.</Alert> : null}
    {query.isError && !retained ? <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>{errorMessage(query.error)}</Alert> : <PlatformDunningList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={query.isLoading} filtered={filtered} onPaginationChange={paginate} />}
  </PageLayout>;
}
function toDraft(q: PlatformDunningListQuery): PlatformDunningFilterDraft { return { companyId: q.companyId ?? '', subscriptionId: q.subscriptionId ?? '', renewalId: q.renewalId ?? '', paymentId: q.paymentId ?? '', paymentStatus: q.paymentStatus ?? '', from: q.from ? dunningIsoToLocal(q.from) : '', to: q.to ? dunningIsoToLocal(q.to) : '' }; }
function hasFilters(q: PlatformDunningListQuery) { return Boolean(q.companyId || q.subscriptionId || q.renewalId || q.paymentId || q.paymentStatus || q.from || q.to); }
function errorMessage(error: unknown) { if (axios.isAxiosError(error) && error.response?.status === 400) return 'The applied Dunning filters are invalid. Reset or adjust them and try again.'; if (axios.isAxiosError(error) && error.response?.status === 403) return 'Access restricted. You do not have permission to view platform Dunning.'; return 'Dunning records could not be loaded. Check connectivity and try again.'; }
const hidden = { position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
