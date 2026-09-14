import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlatformInvoiceFilters, type PlatformInvoiceFilterDraft } from '../components/PlatformInvoiceFilters';
import { PlatformInvoiceList } from '../components/PlatformInvoiceList';
import { listPlatformInvoices, platformInvoiceKeys } from '../platform-invoices-api';
import type { PlatformInvoiceListQuery } from '../platform-invoices.types';
import { localDateTimeToPlatformInvoiceIso, parsePlatformInvoicesUrl, platformInvoiceIsoToLocalDateTime, serializePlatformInvoicesUrl } from '../platform-invoices-url';

export default function PlatformInvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = useMemo(() => parsePlatformInvoicesUrl(searchParams), [searchParams]);
  const applied = parsed.query;
  const [draft, setDraft] = useState<PlatformInvoiceFilterDraft>(() => draftFrom(applied));
  useEffect(() => {
    if (parsed.shouldNormalize) setSearchParams(parsed.normalized, { replace: true });
    setDraft(draftFrom(applied));
  }, [applied.companyId, applied.from, applied.invoiceNumber, applied.limit, applied.page, applied.sourcePaymentId, applied.subscriptionId, applied.to, parsed.shouldNormalize, setSearchParams]);
  const query = useQuery({ queryKey: platformInvoiceKeys.list(applied), queryFn: () => listPlatformInvoices(applied), placeholderData: (previous) => previous, refetchInterval: 60_000 });
  const response = query.data?.data; const rows = response?.data ?? []; const total = response?.meta.total ?? 0; const filtered = hasFilters(applied);
  const hasRetainedData = response !== undefined;
  useEffect(() => { const totalPages = response?.meta.totalPages ?? 0; if (totalPages > 0 && applied.page > totalPages) setSearchParams(serializePlatformInvoicesUrl({ ...applied, page: totalPages }, searchParams), { replace: true }); }, [applied, response?.meta.totalPages, searchParams, setSearchParams]);
  const apply = () => {
    const next: PlatformInvoiceListQuery = { page: 1, limit: applied.limit };
    for (const key of ['companyId', 'subscriptionId', 'sourcePaymentId', 'invoiceNumber'] as const) if (draft[key].trim()) next[key] = draft[key].trim();
    if (draft.from && draft.to) Object.assign(next, { from: localDateTimeToPlatformInvoiceIso(draft.from)!, to: localDateTimeToPlatformInvoiceIso(draft.to)! });
    setSearchParams(serializePlatformInvoicesUrl(next, searchParams));
  };
  const clear = () => { const next = { page: 1, limit: applied.limit }; setDraft(draftFrom(next)); setSearchParams(serializePlatformInvoicesUrl(next, searchParams)); };
  const paginate = (page: number, limit: number) => setSearchParams(serializePlatformInvoicesUrl({ ...applied, page: limit === applied.limit ? page : 1, limit }, searchParams));
  const summary = total ? `${total} Invoice${total === 1 ? '' : 's'}` : filtered ? 'No invoices match the applied filters.' : 'No Invoice records available.';
  return <PageLayout>
    <PageHeader title="Invoices" description="Review authoritative subscription Invoice records." breadcrumbs={['Admin', 'Billing', 'Invoices']} />
    <PlatformInvoiceFilters draft={draft} filtered={filtered} fetching={query.isFetching} summary={summary} onChange={setDraft} onApply={apply} onClear={clear} onRefresh={() => void query.refetch()} />
    {query.isLoading ? <Box role="status" sx={visuallyHidden}>Loading invoices</Box> : null}
    {query.isFetching && !query.isLoading ? <Box aria-live="polite"><LinearProgress aria-label="Updating Invoice register" /></Box> : null}
    {query.isRefetchError && hasRetainedData ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>We couldn't refresh the Invoice list. Showing the most recent available data.</Alert> : null}
    {query.isError && !hasRetainedData ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>{errorMessage(query.error)}</Alert> : <PlatformInvoiceList rows={rows} total={total} page={applied.page} limit={applied.limit} loading={query.isLoading} filtered={filtered} onPaginationChange={paginate} />}
  </PageLayout>;
}

function draftFrom(query: PlatformInvoiceListQuery): PlatformInvoiceFilterDraft { return { companyId: query.companyId ?? '', subscriptionId: query.subscriptionId ?? '', sourcePaymentId: query.sourcePaymentId ?? '', invoiceNumber: query.invoiceNumber ?? '', from: query.from ? platformInvoiceIsoToLocalDateTime(query.from) ?? '' : '', to: query.to ? platformInvoiceIsoToLocalDateTime(query.to) ?? '' : '' }; }
function hasFilters(query: PlatformInvoiceListQuery) { return Boolean(query.companyId || query.subscriptionId || query.sourcePaymentId || query.invoiceNumber || query.from || query.to); }
function errorMessage(error: unknown) { if (axios.isAxiosError(error) && error.response?.status === 400) return 'The applied Invoice filters are invalid. Clear or adjust them and try again.'; if (axios.isAxiosError(error) && error.response?.status === 403) return 'Access restricted. You do not have permission to view platform Invoices.'; return 'Invoices could not be loaded. Check connectivity and try again.'; }
const visuallyHidden = { position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
