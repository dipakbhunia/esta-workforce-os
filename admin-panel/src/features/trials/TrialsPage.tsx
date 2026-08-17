import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { EnterpriseFilterCard, EnterpriseFilterSearch } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusChip } from '@/components/status-chip';
import { getCompanies } from '@/features/organization/services/companies-api';
import type { Trial, TrialStatus } from './trial.types';
import { getTrials } from './trials-api';
import { isEffectiveTrial, localInstant, trialDate, trialRemaining, trialTone } from './trial-utils';

export default function TrialsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TrialStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [expiringWithinDays, setExpiringWithinDays] = useState('');
  const [startsFrom, setStartsFrom] = useState('');
  const [startsTo, setStartsTo] = useState('');
  const [endsFrom, setEndsFrom] = useState('');
  const [endsTo, setEndsTo] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const expiringDays = expiringWithinDays ? Number(expiringWithinDays) : undefined;
  const filterError = expiringDays !== undefined && (!Number.isInteger(expiringDays) || expiringDays < 1 || expiringDays > 365)
    ? 'Expiring within days must be a whole number from 1 to 365.'
    : startsFrom && startsTo && startsFrom > startsTo
      ? 'Trial start range is invalid.'
      : endsFrom && endsTo && endsFrom > endsTo
        ? 'Trial end range is invalid.'
        : '';
  const companies = useQuery({ queryKey: ['companies', 'trial-filters'], queryFn: () => getCompanies({ page: 1, limit: 100 }) });
  const query = useQuery({
    queryKey: ['trials', { search, status, companyId, expiringWithinDays, startsFrom, startsTo, endsFrom, endsTo, page, limit }],
    queryFn: () => getTrials({
      page: page + 1,
      limit,
      search: search.trim() || undefined,
      status: status || undefined,
      companyId: companyId || undefined,
      expiringWithinDays: expiringDays,
      startsFrom: localInstant(startsFrom),
      startsTo: localInstant(startsTo),
      endsFrom: localInstant(endsFrom),
      endsTo: localInstant(endsTo),
    }),
    enabled: !filterError,
    refetchInterval: 60_000,
  });
  const rows = query.data?.data.data ?? [];
  const total = query.data?.data.meta.total ?? 0;
  const filtered = Boolean(search || status || companyId || expiringWithinDays || startsFrom || startsTo || endsFrom || endsTo);
  const reset = () => {
    setSearch(''); setStatus(''); setCompanyId(''); setExpiringWithinDays('');
    setStartsFrom(''); setStartsTo(''); setEndsFrom(''); setEndsTo(''); setPage(0);
  };

  return <PageLayout>
    <PageHeader title="Trial Management" description="Manage time-limited company access, lifecycle, and subscription conversion." breadcrumbs={['Admin', 'SaaS Management', 'Trial Management']} primaryActionLabel="Start Trial" primaryActionTo="/saas/trials/new" />
    <EnterpriseFilterCard
      title="Trial Filters"
      description="All filters are applied by the server before pagination. Date/time values represent exact instants."
      loading={query.isFetching}
      summary={total ? `${total} trial${total === 1 ? '' : 's'}` : filtered ? 'No trials match the filters.' : 'No trials have been started.'}
      search={<Stack gap={1.5}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 180px 220px 170px' }, gap: 1 }}>
          <EnterpriseFilterSearch label="Search trials" placeholder="Company name" value={search} onChange={(value) => { setSearch(value); setPage(0); }} loading={query.isFetching} />
          <TextField select size="small" label="Status" value={status} disabled={Boolean(expiringWithinDays)} helperText={expiringWithinDays ? 'Expiring filter is ACTIVE-only.' : undefined} onChange={(event) => { setStatus(event.target.value as TrialStatus | ''); setPage(0); }}><MenuItem value="">All statuses</MenuItem>{(['ACTIVE', 'EXPIRED', 'CANCELLED', 'CONVERTED'] as TrialStatus[]).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          <TextField select size="small" label="Company" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPage(0); }} disabled={companies.isLoading}><MenuItem value="">All companies</MenuItem>{(companies.data?.data.data ?? []).map((company) => <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Expiring within days" value={expiringWithinDays} error={Boolean(filterError.startsWith('Expiring'))} onChange={(event) => { const value = event.target.value; setExpiringWithinDays(value); if (value) setStatus('ACTIVE'); setPage(0); }} inputProps={{ min: 1, max: 365, step: 1 }} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(170px, 1fr)) auto auto' }, gap: 1 }}>
          <InstantFilter label="Starts from" value={startsFrom} onChange={(value) => { setStartsFrom(value); setPage(0); }} />
          <InstantFilter label="Starts to" value={startsTo} onChange={(value) => { setStartsTo(value); setPage(0); }} />
          <InstantFilter label="Ends from" value={endsFrom} onChange={(value) => { setEndsFrom(value); setPage(0); }} />
          <InstantFilter label="Ends to" value={endsTo} onChange={(value) => { setEndsTo(value); setPage(0); }} />
          <Button startIcon={<RotateCcw size={17} />} disabled={!filtered} onClick={reset}>Reset</Button>
          <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void query.refetch()}>Refresh</Button>
        </Box>
      </Stack>}
    />
    {companies.isError ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void companies.refetch()}>Retry</Button>}>Company filter options could not be loaded. Other Trial filters remain available.</Alert> : null}
    {filterError ? <Alert severity="warning">{filterError}</Alert> : query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>Trials could not be loaded.</Alert> : query.isLoading ? <LoadingSkeleton rows={6} /> : rows.length === 0 ? <Card><Stack alignItems="center" pb={5}><EmptyState title={filtered ? 'No matching trials' : 'No trials found'} description={filtered ? 'Adjust or clear the current filters.' : 'No company Trial has been started. Start one through the real Trial workflow.'} /><Button component={Link} to="/saas/trials/new" variant="contained">Start Trial</Button></Stack></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{rows.map((trial) => <TrialCard key={trial.id} trial={trial} />)}</Box>}
    <TablePagination component="div" count={total} page={page} rowsPerPage={limit} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 20, 50]} />
  </PageLayout>;
}

function InstantFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField size="small" type="datetime-local" label={label} value={value} InputLabelProps={{ shrink: true }} onChange={(event) => onChange(event.target.value)} />;
}

function TrialCard({ trial }: { trial: Trial }) {
  const effective = isEffectiveTrial(trial);
  return <Card variant="outlined"><CardContent><Stack gap={1.5}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Box minWidth={0}><Typography component={Link} to={`/saas/trials/${trial.id}`} variant="h6" color="text.primary" fontWeight={850} sx={{ textDecoration: 'none', overflowWrap: 'anywhere' }}>{trial.company.name}</Typography><Typography variant="body2" color="text.secondary">{trial.company.slug}</Typography></Box><StatusChip label={trial.status} tone={trialTone(trial.status)} /></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}><Fact label="Starts" value={trialDate(trial.startsAt)} /><Fact label="Ends" value={trialDate(trial.endsAt)} /><Fact label="Remaining" value={effective ? trialRemaining(trial.endsAt) : 'Not applicable'} /><Fact label="Seat limit" value={String(trial.seatLimit)} /><Fact label="Entitlements" value={String(trial.entitlementsSnapshot.length)} /><Fact label="Converted subscription" value={trial.convertedSubscription?.planNameSnapshot ?? 'Not applicable'} /></Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button component={Link} to={`/saas/trials/${trial.id}`} variant="outlined">View details</Button>{trial.convertedSubscription ? <Button component={Link} to={`/saas/subscriptions/${trial.convertedSubscription.id}`}>View subscription</Button> : null}</Stack>
  </Stack></CardContent></Card>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}
