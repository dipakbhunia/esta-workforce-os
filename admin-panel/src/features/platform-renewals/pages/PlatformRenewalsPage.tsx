import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlatformRenewalFilters, type PlatformRenewalFilterDraft } from '../components/PlatformRenewalFilters';
import { PlatformRenewalList } from '../components/PlatformRenewalList';
import { listPlatformRenewals, platformRenewalKeys } from '../platform-renewals-api';
import type { PlatformRenewalListQuery } from '../platform-renewals.types';
import { localDateTimeToRenewalIso, parsePlatformRenewalsUrl, renewalIsoToLocal, serializePlatformRenewalsUrl } from '../platform-renewals-url';

export default function PlatformRenewalsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parsePlatformRenewalsUrl(params), [params]);
  const applied = parsed.query;
  const [draft, setDraft] = useState(() => toDraft(applied));
  useEffect(() => { if (parsed.shouldNormalize) setParams(parsed.normalized, { replace: true }); setDraft(toDraft(applied)); }, [applied.billingInterval, applied.companyId, applied.from, applied.limit, applied.page, applied.paymentId, applied.status, applied.subscriptionId, applied.to, parsed.shouldNormalize, setParams]);
  const query = useQuery({ queryKey: platformRenewalKeys.list(applied), queryFn: () => listPlatformRenewals(applied), placeholderData: previous => previous, refetchInterval: 60_000 });
  const response = query.data?.data, rows = response?.data ?? [], total = response?.meta.total ?? 0, filtered = hasFilters(applied), retained = response !== undefined;
  useEffect(() => { const pages = response?.meta.totalPages ?? 0; if (pages > 0 && applied.page > pages) setParams(serializePlatformRenewalsUrl({ ...applied, page: pages }, params), { replace: true }); }, [applied, params, response?.meta.totalPages, setParams]);
  const apply = () => { const next: PlatformRenewalListQuery = { page: 1, limit: applied.limit }; for (const key of ['companyId', 'subscriptionId', 'paymentId'] as const) if (draft[key].trim()) next[key] = draft[key].trim(); if (draft.status) next.status = draft.status as PlatformRenewalListQuery['status']; if (draft.billingInterval) next.billingInterval = draft.billingInterval as PlatformRenewalListQuery['billingInterval']; if (draft.from && draft.to) Object.assign(next, { from: localDateTimeToRenewalIso(draft.from)!, to: localDateTimeToRenewalIso(draft.to)! }); setParams(serializePlatformRenewalsUrl(next, params)); };
  const reset = () => setParams(serializePlatformRenewalsUrl({ page: 1, limit: applied.limit }, params));
  const paginate = (page: number, limit: number) => setParams(serializePlatformRenewalsUrl({ ...applied, page: limit === applied.limit ? page : 1, limit }, params));
  return <PageLayout><PageHeader title="Renewals" description="Review authoritative subscription Renewal records and payment state." breadcrumbs={['Admin', 'Billing', 'Renewals']} />
    <PlatformRenewalFilters draft={draft} filtered={filtered} fetching={query.isFetching} summary={total ? `${total} Renewal${total === 1 ? '' : 's'}` : filtered ? 'No renewals match the applied filters.' : 'No Renewal records available.'} onChange={setDraft} onApply={apply} onClear={reset} onRefresh={() => void query.refetch()} />
    {query.isLoading ? <Box role="status" sx={hidden}>Loading renewals</Box> : null}
    {query.isFetching && !query.isLoading ? <LinearProgress aria-label="Updating Renewal register" /> : null}
    {query.isRefetchError && retained ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>We couldn't refresh the Renewal list. Showing the most recent available data.</Alert> : null}
    {query.isError && !retained ? <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>{errorMessage(query.error)}</Alert> : <PlatformRenewalList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={query.isLoading} filtered={filtered} onPaginationChange={paginate} />}
  </PageLayout>;
}
function toDraft(q: PlatformRenewalListQuery): PlatformRenewalFilterDraft { return { companyId: q.companyId ?? '', subscriptionId: q.subscriptionId ?? '', paymentId: q.paymentId ?? '', status: q.status ?? '', billingInterval: q.billingInterval ?? '', from: q.from ? renewalIsoToLocal(q.from) : '', to: q.to ? renewalIsoToLocal(q.to) : '' }; }
function hasFilters(q: PlatformRenewalListQuery) { return Boolean(q.companyId || q.subscriptionId || q.paymentId || q.status || q.billingInterval || q.from || q.to); }
function errorMessage(error: unknown) { if (axios.isAxiosError(error) && error.response?.status === 400) return 'The applied Renewal filters are invalid. Reset or adjust them and try again.'; if (axios.isAxiosError(error) && error.response?.status === 403) return 'Access restricted. You do not have permission to view platform Renewals.'; return 'Renewals could not be loaded. Check connectivity and try again.'; }
const hidden = { position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
