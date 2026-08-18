import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Building2, CircleGauge, RefreshCw, RotateCcw, ShieldAlert, TicketCheck, Users } from 'lucide-react';
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
import { capacityStateLabel, capacityTone, formatPercent } from './SeatUsageSummary';
import { getUsageSeats } from './usage-seats-api';
import type { CommercialSeatSource, CompanySeatSummary, SeatCapacityState } from './usage-seats.types';

export default function UsageSeatsPage() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<CommercialSeatSource | ''>('');
  const [commercialStatus, setCommercialStatus] = useState<'ACTIVE' | 'SUSPENDED' | ''>('');
  const [capacityState, setCapacityState] = useState<SeatCapacityState | ''>('');
  const [planId, setPlanId] = useState('');
  const [overLimit, setOverLimit] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const plans = useQuery({ queryKey: ['plans', 'usage-seat-filters'], queryFn: () => getPlans({ page: 1, limit: 100 }) });
  const query = useQuery({
    queryKey: ['usage-seats', { search, source, commercialStatus, capacityState, planId, overLimit, page, limit }],
    queryFn: () => getUsageSeats({
      page: page + 1,
      limit,
      search: search.trim() || undefined,
      source: source || undefined,
      commercialStatus: commercialStatus || undefined,
      capacityState: capacityState || undefined,
      planId: planId || undefined,
      overLimit: overLimit ? overLimit === 'true' : undefined,
    }),
  });
  const response = query.data?.data;
  const rows = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const summary = response?.summary;
  const filtered = Boolean(search || source || commercialStatus || capacityState || planId || overLimit);
  const reset = () => {
    setSearch(''); setSource(''); setCommercialStatus(''); setCapacityState(''); setPlanId(''); setOverLimit(''); setPage(0);
  };

  return <PageLayout>
    <PageHeader title="Usage & Seats" description="Inspect current commercial seat authority and live workforce usage without billing projections." breadcrumbs={['Admin', 'SaaS Management', 'Usage & Seats']} />
    <EnterpriseFilterCard title="Usage Filters" description="Derived commercial and capacity filters are applied by the server before pagination." loading={query.isFetching} summary={total ? `${total} compan${total === 1 ? 'y' : 'ies'}` : filtered ? 'No companies match the filters.' : 'No companies are available.'} search={<Stack gap={1.25}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) repeat(2, minmax(150px, 190px))' }, gap: 1 }}>
        <EnterpriseFilterSearch label="Search companies" placeholder="Company name or code" value={search} onChange={(value) => { setSearch(value); setPage(0); }} loading={query.isFetching} />
        <Select label="Commercial source" value={source} values={['TRIAL', 'SUBSCRIPTION', 'NONE']} onChange={(value) => { setSource(value as CommercialSeatSource | ''); setPage(0); }} />
        <Select label="Commercial status" value={commercialStatus} values={['ACTIVE', 'SUSPENDED']} onChange={(value) => { setCommercialStatus(value as typeof commercialStatus); setPage(0); }} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(160px, 1fr)) auto auto' }, gap: 1 }}>
        <Select label="Capacity state" value={capacityState} values={['AVAILABLE', 'AT_CAPACITY', 'OVER_LIMIT', 'NO_ACCESS']} onChange={(value) => { setCapacityState(value as SeatCapacityState | ''); setPage(0); }} />
        <TextField select size="small" label="Plan" value={planId} onChange={(event) => { setPlanId(event.target.value); setPage(0); }} disabled={plans.isLoading}><MenuItem value="">All plans</MenuItem>{(plans.data?.data.data ?? []).map((plan) => <MenuItem key={plan.id} value={plan.id}>{plan.name} ({plan.code})</MenuItem>)}</TextField>
        <Select label="Over limit" value={overLimit} values={['true', 'false']} labels={{ true: 'Over limit only', false: 'Within allowance' }} onChange={(value) => { setOverLimit(value as typeof overLimit); setPage(0); }} />
        <Button startIcon={<RotateCcw size={17} />} disabled={!filtered} onClick={reset}>Reset</Button>
        <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void query.refetch()}>Refresh</Button>
      </Box>
    </Stack>} />
    {plans.isError ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void plans.refetch()}>Retry</Button>}>Plan filter options could not be loaded. Other filters remain available.</Alert> : null}
    {summary ? <Stack gap={1}>
      <SummaryCardsContainer minCardWidth={175}>
        <StatCard label="Effective Trials" value={String(summary.effectiveTrialCompanies)} helper="Temporary allowances" icon={TicketCheck} tone="#2563EB" />
        <StatCard label="Active Subscriptions" value={String(summary.activeSubscriptionCompanies)} helper="Allocation enabled" icon={Building2} tone="#16A34A" />
        <StatCard label="Suspended" value={String(summary.suspendedSubscriptionCompanies)} helper="Capacity visible" icon={ShieldAlert} tone="#D97706" />
        <StatCard label="No Access" value={String(summary.noCommercialAccessCompanies)} helper="No seat allowance" icon={ShieldAlert} tone="#64748B" />
        <StatCard label="At Capacity" value={String(summary.atCapacityCompanies)} helper="No seats remaining" icon={CircleGauge} tone="#D97706" />
        <StatCard label="Over Limit" value={String(summary.overLimitCompanies)} helper="Positive deltas blocked" icon={ShieldAlert} tone="#DC2626" />
        <StatCard label="Trial Allowance" value={String(summary.totalTrialAllowance)} helper="Effective Trials only" icon={Users} tone="#7C3AED" />
        <StatCard label="Subscription Capacity" value={String(summary.totalSubscriptionCapacity)} helper="Active + suspended" icon={Users} tone="#0891B2" />
        <StatCard label="Used Workforce Seats" value={String(summary.currentUsedWorkforceSeats)} helper="ACTIVE Employees" icon={Users} tone="#0F766E" />
      </SummaryCardsContainer>
      <Typography variant="caption" color="text.secondary">Scope: {summary.scope === 'FILTERED' ? 'current filters' : 'all non-archived companies'} · As of {response ? new Date(response.asOf).toLocaleString() : '—'}</Typography>
    </Stack> : query.isLoading ? <LoadingSkeleton rows={3} /> : null}
    {query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>Usage and seat data could not be loaded.</Alert> : query.isLoading ? <LoadingSkeleton rows={7} /> : rows.length === 0 ? <Card><EmptyState title={filtered ? 'No matching companies' : 'No company usage found'} description={filtered ? 'Adjust or reset the server-side filters.' : 'Current company seat usage will appear here.'} /></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{rows.map((row) => <UsageCard key={row.company.id} value={row} />)}</Box>}
    <TablePagination component="div" count={total} page={page} rowsPerPage={limit} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 20, 50]} />
  </PageLayout>;
}

function UsageCard({ value }: { value: CompanySeatSummary }) {
  const commercialPath = value.commercial.referenceId ? value.commercial.source === 'TRIAL' ? `/saas/trials/${value.commercial.referenceId}` : `/saas/subscriptions/${value.commercial.referenceId}` : null;
  return <Card variant="outlined"><CardContent><Stack gap={1.5}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Box minWidth={0}><Typography component={Link} to={`/organization/companies/${value.company.id}`} variant="h6" color="text.primary" fontWeight={850} sx={{ textDecoration: 'none', overflowWrap: 'anywhere' }}>{value.company.name}</Typography><Typography variant="body2" color="text.secondary">{value.company.slug} · {value.company.status}</Typography></Box><StatusChip label={capacityStateLabel(value.seats.capacityState)} tone={capacityTone(value.seats.capacityState)} /></Stack>
    {value.seats.capacityState === 'OVER_LIMIT' ? <Alert severity="error">Over by {value.seats.overBy} seat{value.seats.overBy === 1 ? '' : 's'}.</Alert> : null}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
      <Fact label="Source" value={value.commercial.source} />
      <Fact label="Status" value={value.commercial.commercialStatus ?? 'N/A'} />
      <Fact label="Plan / Trial" value={value.commercial.source === 'TRIAL' ? 'Trial allowance' : value.commercial.plan?.name ?? 'No allowance'} />
      <Fact label="Capacity" value={value.commercial.capacity === null ? 'N/A' : String(value.commercial.capacity)} />
      <Fact label="Used" value={String(value.seats.used)} />
      <Fact label="Remaining" value={value.seats.remaining === null ? 'N/A' : String(value.seats.remaining)} />
      <Fact label="Utilization" value={value.seats.utilizationPercent === null ? 'N/A' : `${formatPercent(value.seats.utilizationPercent)}%`} />
    </Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" gap={1}><Button component={Link} to={`/organization/companies/${value.company.id}`} variant="outlined">View Company</Button>{commercialPath ? <Button component={Link} to={commercialPath}>View {value.commercial.source === 'TRIAL' ? 'Trial' : 'Subscription'}</Button> : null}<Button component={Link} to={`/saas/usage-seats/${value.company.id}`}>View seat details</Button></Stack>
  </Stack></CardContent></Card>;
}

function Select({ label, value, values, labels, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <TextField select size="small" label={label} value={value} onChange={(event) => onChange(event.target.value)}><MenuItem value="">All</MenuItem>{values.map((item) => <MenuItem key={item} value={item}>{labels?.[item] ?? item.replaceAll('_', ' ')}</MenuItem>)}</TextField>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}
