import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlatformPaymentFilters, type PlatformPaymentFilterDraft } from '../components/PlatformPaymentFilters';
import { PlatformPaymentList } from '../components/PlatformPaymentList';
import { listPlatformPayments } from '../platform-payments-api';
import type { PlatformPaymentListQuery } from '../platform-payments.types';
import { canonicalIsoToLocalDateTime, localDateTimeToCanonicalIso, parsePlatformPaymentsUrl, serializePlatformPaymentsUrl } from '../platform-payments-url';

export default function PlatformPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = useMemo(() => parsePlatformPaymentsUrl(searchParams), [searchParams]);
  const applied = parsed.query;
  const [draft, setDraft] = useState<PlatformPaymentFilterDraft>(() => draftFrom(applied));

  useEffect(() => {
    if (parsed.shouldNormalize) setSearchParams(parsed.normalized, { replace: true });
    setDraft(draftFrom(applied));
  }, [applied.companyId, applied.from, applied.limit, applied.mode, applied.page, applied.provider, applied.purpose, applied.status, applied.subscriptionId, applied.to, parsed.shouldNormalize, setSearchParams]);

  const query = useQuery({
    queryKey: ['platform-payments', applied.page, applied.limit, applied.companyId ?? '', applied.status ?? '', applied.provider ?? '', applied.mode ?? '', applied.purpose ?? '', applied.subscriptionId ?? '', applied.from ?? '', applied.to ?? ''],
    queryFn: () => listPlatformPayments(applied),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });
  const response = query.data?.data;
  const rows = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const filtered = hasFilters(applied);

  useEffect(() => {
    const totalPages = response?.meta.totalPages ?? 0;
    if (totalPages > 0 && applied.page > totalPages) setSearchParams(serializePlatformPaymentsUrl({ ...applied, page: totalPages }), { replace: true });
  }, [applied, response?.meta.totalPages, setSearchParams]);

  const apply = () => {
    const next: PlatformPaymentListQuery = { page: 1, limit: applied.limit };
    for (const key of ['companyId', 'status', 'provider', 'mode', 'purpose', 'subscriptionId'] as const) if (draft[key]) Object.assign(next, { [key]: draft[key].trim() });
    if (draft.from && draft.to) Object.assign(next, { from: localDateTimeToCanonicalIso(draft.from)!, to: localDateTimeToCanonicalIso(draft.to)! });
    setSearchParams(serializePlatformPaymentsUrl(next));
  };
  const clear = () => {
    setDraft(draftFrom({ page: 1, limit: applied.limit }));
    setSearchParams(serializePlatformPaymentsUrl({ page: 1, limit: applied.limit }));
  };
  const paginate = (page: number, limit: number) => setSearchParams(serializePlatformPaymentsUrl({ ...applied, page: limit === applied.limit ? page : 1, limit }));
  const summary = total ? `${total} payment${total === 1 ? '' : 's'}` : filtered ? 'No payments match the applied filters.' : 'No payments recorded yet.';

  return <PageLayout>
    <PageHeader title="Payments" description="Read-only operational payment history for the SaaS platform." breadcrumbs={['Admin', 'Billing', 'Payments']} />
    <PlatformPaymentFilters draft={draft} filtered={filtered} fetching={query.isFetching} summary={summary} onChange={setDraft} onApply={apply} onClear={clear} onRefresh={() => void query.refetch()} />
    {query.isFetching && !query.isLoading ? <Box aria-live="polite"><LinearProgress aria-label="Updating payment register" /></Box> : null}
    {query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>{errorMessage(query.error)}</Alert> : <PlatformPaymentList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={query.isLoading} filtered={filtered} onPaginationChange={paginate} />}
  </PageLayout>;
}

function draftFrom(query: PlatformPaymentListQuery): PlatformPaymentFilterDraft { return { status: query.status ?? '', companyId: query.companyId ?? '', provider: query.provider ?? '', mode: query.mode ?? '', purpose: query.purpose ?? '', subscriptionId: query.subscriptionId ?? '', from: query.from ? canonicalIsoToLocalDateTime(query.from) ?? '' : '', to: query.to ? canonicalIsoToLocalDateTime(query.to) ?? '' : '' }; }
function hasFilters(query: PlatformPaymentListQuery) { return Boolean(query.companyId || query.status || query.provider || query.mode || query.purpose || query.subscriptionId || query.from || query.to); }
function errorMessage(error: unknown) { if (axios.isAxiosError(error) && error.response?.status === 400) return 'The applied payment filters are invalid. Clear or adjust them and try again.'; if (axios.isAxiosError(error) && error.response?.status === 403) return 'Access restricted. You do not have permission to view platform payments.'; return 'Payments could not be loaded. Check connectivity and try again.'; }
