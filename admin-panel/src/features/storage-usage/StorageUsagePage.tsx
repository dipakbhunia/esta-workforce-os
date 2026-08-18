import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TablePagination, TextField, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { CircleGauge, HardDrive, Image, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { EnterpriseFilterCard, EnterpriseFilterSearch } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getPlans } from '@/features/plans/plans-api';
import { getStorageUsage } from './storage-usage-api';
import type { CommercialStorageSource, CompanyStorageSummary, StorageCapacityState } from './storage-usage.types';
import { exactBytes, formatBytes, formatStorageDate, formatUtilization, storageCapacityLabel, storageCapacityTone } from './storage-usage-utils';

export default function StorageUsagePage() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<CommercialStorageSource | ''>('');
  const [commercialStatus, setCommercialStatus] = useState<'ACTIVE' | 'SUSPENDED' | ''>('');
  const [capacityState, setCapacityState] = useState<StorageCapacityState | ''>('');
  const [planId, setPlanId] = useState('');
  const [limitConfigured, setLimitConfigured] = useState<'' | 'true' | 'false'>('');
  const [overLimit, setOverLimit] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const plans = useQuery({ queryKey: ['plans', 'storage-usage-filters'], queryFn: () => getPlans({ page: 1, limit: 100 }) });
  const query = useQuery({
    queryKey: ['storage-usage', { search, source, commercialStatus, capacityState, planId, limitConfigured, overLimit, page, limit }],
    queryFn: () => getStorageUsage({
      page: page + 1,
      limit,
      search: search.trim() || undefined,
      source: source || undefined,
      commercialStatus: commercialStatus || undefined,
      capacityState: capacityState || undefined,
      planId: planId || undefined,
      limitConfigured: limitConfigured ? limitConfigured === 'true' : undefined,
      overLimit: overLimit ? overLimit === 'true' : undefined,
    }),
  });
  const response = query.data?.data;
  const rows = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const summary = response?.summary;
  const filtered = Boolean(search || source || commercialStatus || capacityState || planId || limitConfigured || overLimit);
  const reset = () => {
    setSearch(''); setSource(''); setCommercialStatus(''); setCapacityState(''); setPlanId(''); setLimitConfigured(''); setOverLimit(''); setPage(0);
  };

  return <PageLayout>
    <PageHeader title="Storage Usage" description="Current tenant screenshot storage reporting from finalized metadata and commercial snapshots." breadcrumbs={['Admin', 'SaaS Management', 'Storage Usage']} />
    <EnterpriseFilterCard title="Storage Filters" description="Commercial, measurement, and capacity filters are applied by the server before pagination." loading={query.isFetching} summary={total ? `${total} compan${total === 1 ? 'y' : 'ies'}` : filtered ? 'No companies match the filters.' : 'No companies are available.'} search={<Stack gap={1.25}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) repeat(2, minmax(150px, 190px))' }, gap: 1 }}>
        <EnterpriseFilterSearch label="Search companies" placeholder="Company name or code" value={search} onChange={(value) => { setSearch(value); setPage(0); }} loading={query.isFetching} />
        <Select label="Commercial source" value={source} values={['TRIAL', 'SUBSCRIPTION', 'NONE']} onChange={(value) => { setSource(value as CommercialStorageSource | ''); setPage(0); }} />
        <Select label="Commercial status" value={commercialStatus} values={['ACTIVE', 'SUSPENDED']} onChange={(value) => { setCommercialStatus(value as typeof commercialStatus); setPage(0); }} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(150px, 1fr)) auto auto' }, gap: 1 }}>
        <Select label="Capacity state" value={capacityState} values={['AVAILABLE', 'AT_LIMIT', 'OVER_LIMIT', 'UNCONFIGURED', 'NO_ACCESS', 'UNMEASURABLE']} onChange={(value) => { setCapacityState(value as StorageCapacityState | ''); setPage(0); }} />
        <TextField select size="small" label="Plan" value={planId} onChange={(event) => { setPlanId(event.target.value); setPage(0); }} disabled={plans.isLoading}><MenuItem value="">All plans</MenuItem>{(plans.data?.data.data ?? []).map((plan) => <MenuItem key={plan.id} value={plan.id}>{plan.name} ({plan.code})</MenuItem>)}</TextField>
        <Select label="Limit configured" value={limitConfigured} values={['true', 'false']} labels={{ true: 'Configured', false: 'Not configured' }} onChange={(value) => { setLimitConfigured(value as typeof limitConfigured); setPage(0); }} />
        <Select label="Over limit" value={overLimit} values={['true', 'false']} labels={{ true: 'Over limit only', false: 'Not over limit' }} onChange={(value) => { setOverLimit(value as typeof overLimit); setPage(0); }} />
        <Button startIcon={<RotateCcw size={17} />} disabled={!filtered} onClick={reset}>Reset</Button>
        <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void query.refetch()}>Refresh</Button>
      </Box>
    </Stack>} />
    {plans.isError ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void plans.refetch()}>Retry</Button>}>Plan filter options could not be loaded. Other filters remain available.</Alert> : null}
    {summary ? <Stack gap={1}>
      <SummaryCardsContainer minCardWidth={175}>
        <StatCard label="Total Measured Storage" value={formatBytes(summary.totalMeasuredStorageBytes)} helper="Known screenshot bytes" icon={HardDrive} tone="#2563EB" />
        <StatCard label="Measured Screenshot Objects" value={String(summary.measuredScreenshotObjects)} helper={`${summary.unmeasuredScreenshotObjects} unmeasured`} icon={Image} tone="#0891B2" />
        <StatCard label="Over Limit" value={String(summary.companiesOverLimit)} helper="Measured above snapshot limit" icon={ShieldAlert} tone="#DC2626" />
        <StatCard label="At Limit" value={String(summary.companiesAtLimit)} helper="Measured equals limit" icon={CircleGauge} tone="#D97706" />
        <StatCard label="No Configured Limit" value={String(summary.companiesWithoutConfiguredLimit)} helper="Commercial access only" icon={HardDrive} tone="#7C3AED" />
        <StatCard label="Incomplete Measurement" value={String(summary.companiesWithUnmeasurableStorage)} helper="Objects missing size" icon={ShieldAlert} tone="#EA580C" />
      </SummaryCardsContainer>
      <Typography variant="caption" color="text.secondary">Scope: {summary.scope === 'FILTERED' ? 'current filters' : 'all non-archived companies'} · Calculated {formatStorageDate(response?.calculatedAt ?? null)}</Typography>
    </Stack> : query.isLoading ? <LoadingSkeleton rows={3} /> : null}
    {query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>Storage usage data could not be loaded.</Alert> : query.isLoading ? <LoadingSkeleton rows={7} /> : rows.length === 0 ? <Card><EmptyState title={filtered ? 'No matching companies' : 'No storage usage found'} description={filtered ? 'Adjust or reset the server-side filters.' : 'Current Company screenshot storage reporting will appear here.'} /></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{rows.map((row) => <StorageCard key={row.company.id} value={row} />)}</Box>}
    <TablePagination component="div" count={total} page={page} rowsPerPage={limit} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 20, 50]} />
  </PageLayout>;
}

function StorageCard({ value }: { value: CompanyStorageSummary }) {
  const commercialPath = value.commercial.referenceId ? value.commercial.source === 'TRIAL' ? `/saas/trials/${value.commercial.referenceId}` : `/saas/subscriptions/${value.commercial.referenceId}` : null;
  const storage = value.storage;
  return <Card variant="outlined"><CardContent><Stack gap={1.5}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Box minWidth={0}><Typography component={Link} to={`/organization/companies/${value.company.id}`} variant="h6" color="text.primary" fontWeight={850} sx={{ textDecoration: 'none', overflowWrap: 'anywhere' }}>{value.company.name}</Typography><Typography variant="body2" color="text.secondary">{value.company.slug} · {value.company.status}</Typography></Box><StatusChip label={storageCapacityLabel(storage.capacityState)} tone={storageCapacityTone(storage.capacityState)} /></Stack>
    {storage.measurementState === 'UNMEASURABLE' ? <Alert severity="warning">Measurement incomplete: {storage.unmeasuredObjectCount} object{storage.unmeasuredObjectCount === 1 ? '' : 's'} lack size metadata.</Alert> : null}
    {storage.capacityState === 'OVER_LIMIT' ? <Alert severity="error">Measured storage is {formatBytes(storage.overByBytes)} over the configured limit.</Alert> : null}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
      <Fact label="Source" value={value.commercial.source} />
      <Fact label="Plan / Trial" value={value.commercial.source === 'TRIAL' ? 'Trial snapshot' : value.commercial.plan?.name ?? 'No commercial access'} />
      <ByteFact label={storage.measurementState === 'UNMEASURABLE' ? 'Measured (known)' : 'Measured'} value={storage.measuredStorageBytes} />
      <ByteFact label="Configured limit" value={storage.configuredLimitBytes} fallback={value.commercial.source === 'NONE' ? 'N/A' : 'Not configured'} />
      <ByteFact label="Remaining" value={storage.remainingBytes} />
      <Fact label="Utilization" value={formatUtilization(storage.utilizationPercent)} />
      <Fact label="Measured objects" value={String(storage.measuredObjectCount)} />
      <Fact label="Unmeasured objects" value={String(storage.unmeasuredObjectCount)} />
      <Fact label="Calculated" value={formatStorageDate(storage.calculatedAt)} />
    </Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" gap={1}><Button component={Link} to={`/saas/storage/${value.company.id}`}>View Storage Details</Button><Button component={Link} to={`/organization/companies/${value.company.id}`} variant="outlined">View Company</Button>{commercialPath ? <Button component={Link} to={commercialPath}>View {value.commercial.source === 'TRIAL' ? 'Trial' : 'Subscription'}</Button> : null}</Stack>
  </Stack></CardContent></Card>;
}

function Select({ label, value, values, labels, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <TextField select size="small" label={label} value={value} onChange={(event) => onChange(event.target.value)}><MenuItem value="">All</MenuItem>{values.map((item) => <MenuItem key={item} value={item}>{labels?.[item] ?? item.replaceAll('_', ' ')}</MenuItem>)}</TextField>;
}

function ByteFact({ label, value, fallback = 'N/A' }: { label: string; value: string | null; fallback?: string }) {
  const exact = exactBytes(value);
  const rendered = value === null ? fallback : formatBytes(value);
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography>{exact ? <Tooltip title={exact}><Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere', width: 'fit-content' }}>{rendered}</Typography></Tooltip> : <Typography variant="body2" fontWeight={750}>{rendered}</Typography>}</Box>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}
