import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { getCompanies } from '@/features/organization/services/companies-api';
import { getEntitlementCatalog } from '@/features/plans/plans-api';
import { getCompanySeatUsage } from '@/features/usage-seats/usage-seats-api';
import type { StartTrialPayload } from './trial.types';
import { getTrials, startTrial } from './trials-api';
import { trialError } from './trial-utils';

const DEFAULT_DURATION_HOURS = 168;
const DEFAULT_SEAT_LIMIT = 10;
const MAX_DURATION_HOURS = 8760;

export default function TrialCreatePage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [companyId, setCompanyId] = useState('');
  const [durationHours, setDurationHours] = useState(String(DEFAULT_DURATION_HOURS));
  const [seatLimit, setSeatLimit] = useState(String(DEFAULT_SEAT_LIMIT));
  const [reason, setReason] = useState('');
  const [allowOverLimit, setAllowOverLimit] = useState(false);
  const [error, setError] = useState('');
  const companies = useQuery({ queryKey: ['companies', 'trial-options'], queryFn: () => getCompanies({ page: 1, limit: 100 }) });
  const catalog = useQuery({ queryKey: ['plans', 'entitlement-catalog'], queryFn: getEntitlementCatalog });
  const history = useQuery({ queryKey: ['trials', 'company-history', companyId], queryFn: () => getTrials({ page: 1, limit: 1, companyId }), enabled: Boolean(companyId) });
  const usage = useQuery({ queryKey: ['usage-seats', 'company', companyId, { summary: true }], queryFn: () => getCompanySeatUsage(companyId, { page: 1, limit: 1 }), enabled: Boolean(companyId) });
  const historyTotal = history.data?.data.meta.total ?? 0;
  const priorTrial = history.data?.data.data[0];
  const selectedCompany = companies.data?.data.data.find((company) => company.id === companyId);
  const trialEligible = (catalog.data?.data ?? []).filter((item) => item.trialEligible);
  const unavailable = (catalog.data?.data ?? []).filter((item) => !item.trialEligible);
  const usedSeats = usage.data?.data.seats.used;
  const parsedSeatLimit = Number(seatLimit);
  const needsOverLimitOverride = usedSeats !== undefined && Number.isInteger(parsedSeatLimit) && parsedSeatLimit >= 1 && parsedSeatLimit < usedSeats;
  const mutation = useMutation({
    mutationFn: (payload: StartTrialPayload) => startTrial(payload),
    onSuccess: async ({ data }) => {
      await client.invalidateQueries({ queryKey: ['trials'] });
      await client.invalidateQueries({ queryKey: ['company', data.companyId] });
      navigate(`/saas/trials/${data.id}`, { replace: true });
    },
    onError: (cause) => setError(trialError(cause, 'Trial could not be started.')),
  });

  const submit = () => {
    setError('');
    const hours = Number(durationHours);
    const seats = Number(seatLimit);
    if (!companyId || !Number.isInteger(hours) || hours < 1 || hours > MAX_DURATION_HOURS || !Number.isInteger(seats) || seats < 1) {
      setError('Choose an eligible company and enter positive whole-number duration and seat values.');
      return;
    }
    if (historyTotal > 0 && !reason.trim()) {
      setError('A reason is required because this company has prior Trial history.');
      return;
    }
    if (usage.isLoading || usage.isError || usedSeats === undefined) {
      setError('Current Employee seat usage must be loaded before starting a Trial.');
      return;
    }
    if (seats < usedSeats && (!allowOverLimit || !reason.trim())) {
      setError('Acknowledge the over-limit Trial and provide a reason.');
      return;
    }
    const payload: StartTrialPayload = {
      companyId,
      ...(hours !== DEFAULT_DURATION_HOURS ? { durationHours: hours } : {}),
      ...(seats !== DEFAULT_SEAT_LIMIT ? { seatLimit: seats } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(seats < usedSeats ? { allowOverLimit: true } : {}),
    };
    mutation.mutate(payload);
  };

  return <PageLayout>
    <PageHeader title="Start Trial" description="Grant temporary, backend-controlled Trial access to an eligible company." breadcrumbs={['Admin', 'SaaS Management', 'Trial Management', 'Start Trial']} />
    {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}{usage.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void usage.refetch()}>Retry</Button>}>Current Employee seat usage could not be loaded.</Alert> : null}
    {companies.isLoading ? <LoadingSkeleton rows={3} /> : companies.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void companies.refetch()}>Retry</Button>}>Companies could not be loaded. Trial creation is unavailable.</Alert> : <Card><CardContent><Stack component="form" gap={3} onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <Box sx={formGrid}>
        <TextField select required label="Company" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setReason(''); setAllowOverLimit(false); setError(''); }} helperText={selectedCompany ? `Operational status: ${selectedCompany.status}` : 'Only operationally eligible companies can start a Trial.'}>
          {(companies.data?.data.data ?? []).map((company) => { const eligible = company.status === 'ACTIVE' || company.status === 'TRIAL'; return <MenuItem key={company.id} value={company.id} disabled={!eligible}>{company.name} ({company.slug}){eligible ? '' : ` — ${company.status}`}</MenuItem>; })}
        </TextField>
        <TextField required type="number" label="Trial duration (hours)" value={durationHours} inputProps={{ min: 1, max: MAX_DURATION_HOURS, step: 1 }} onChange={(event) => setDurationHours(event.target.value)} helperText="168 hours equals seven 24-hour periods. The unchanged default is omitted so backend policy remains authoritative." />
        <TextField required type="number" label="Trial seat limit" value={seatLimit} inputProps={{ min: 1, step: 1 }} onChange={(event) => setSeatLimit(event.target.value)} helperText="Temporary Trial allowance only; this is not a contracted Subscription seat quantity." />
        <TextField label={needsOverLimitOverride ? 'Over-limit reason' : historyTotal > 0 ? 'Reason for another Trial' : 'Reason (optional)'} required={historyTotal > 0 || needsOverLimitOverride} value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 500 }} helperText={usage.isLoading || history.isLoading ? 'Checking Trial history and current seat usage…' : needsOverLimitOverride ? 'Required audit reason because the Trial limit is below current usage.' : historyTotal > 0 ? 'Required because this company has prior Trial history.' : 'Optional audit context for the first Trial.'} />
      </Box>
      {needsOverLimitOverride && usedSeats !== undefined ? <Stack gap={1}><Alert severity="warning">The Trial limit of {seatLimit} is below current usage of {usedSeats}. The Company will begin {usedSeats - parsedSeatLimit} seats over limit.</Alert><FormControlLabel control={<Checkbox checked={allowOverLimit} onChange={(_, checked) => setAllowOverLimit(checked)} />} label="Allow Trial capacity below current seat usage" /></Stack> : null}
      {priorTrial?.status === 'ACTIVE' ? <Alert severity="warning">This company already has an ACTIVE Trial. The backend will reject another Trial.</Alert> : null}
      <Alert severity="info">Trial dates, default policy, entitlement snapshot, and limits snapshot are finalized by the backend. Company operational status is not changed.</Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1}><Button onClick={() => navigate('/saas/trials')} disabled={mutation.isPending}>Cancel</Button><Button type="submit" variant="contained" disabled={mutation.isPending || history.isLoading || usage.isLoading || companies.isError}>{mutation.isPending ? 'Starting…' : 'Start Trial'}</Button></Stack>
    </Stack></CardContent></Card>}
    <SectionCard title="Trial Entitlement Preview" description="Read-only policy from the canonical backend catalog. Capabilities cannot be selected or changed here.">
      {catalog.isLoading ? <Stack direction="row" gap={1} alignItems="center"><CircularProgress size={20} /><Typography>Loading entitlement policy…</Typography></Stack> : catalog.isError ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void catalog.refetch()}>Retry</Button>}>Trial entitlement preview could not be loaded. Backend policy remains authoritative.</Alert> : <Stack gap={2}>
        <CatalogGroups items={trialEligible} />
        {unavailable.length ? <Box><Typography fontWeight={800} mb={1}>Unavailable for Trial</Typography><Stack direction="row" flexWrap="wrap" gap={1}>{unavailable.map((item) => <Chip key={item.key} label={`${item.name} — ${item.availability === 'COMING_SOON' ? 'Coming Soon' : 'Not Trial eligible'}`} disabled variant="outlined" />)}</Stack></Box> : null}
      </Stack>}
    </SectionCard>
    <SectionCard title="Trial Limits" description="Trial limits are server-controlled."><Typography color="text.secondary">No trial-specific limits configured.</Typography></SectionCard>
  </PageLayout>;
}

function CatalogGroups({ items }: { items: Array<{ key: string; name: string; group: string; description: string }> }) {
  const groups = [...new Set(items.map((item) => item.group))];
  return <Stack gap={2}>{groups.map((group) => <Box key={group}><Typography fontWeight={800} mb={1}>{group}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>{items.filter((item) => item.group === group).map((item) => <Box key={item.key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}><Typography fontWeight={750}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.description}</Typography></Box>)}</Box></Box>)}</Stack>;
}

const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
