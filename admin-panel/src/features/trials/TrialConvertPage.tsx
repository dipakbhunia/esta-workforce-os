import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { getEntitlementCatalog, getPlans } from '@/features/plans/plans-api';
import type { Plan } from '@/features/plans/plan.types';
import { money } from '@/features/plans/plan-utils';
import type { BillingInterval } from '@/features/subscriptions/subscription.types';
import { getCompanySeatUsage } from '@/features/usage-seats/usage-seats-api';
import type { ConvertTrialPayload } from './trial.types';
import { convertTrial, getTrial } from './trials-api';
import { isEffectiveTrial, trialDate, trialError, trialRemaining } from './trial-utils';

export default function TrialConvertPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const trialQuery = useQuery({ queryKey: ['trial', id], queryFn: () => getTrial(id), enabled: Boolean(id) });
  const plansQuery = useQuery({ queryKey: ['plans', 'trial-conversion-options'], queryFn: () => getPlans({ page: 1, limit: 100, status: 'ACTIVE' }) });
  const catalogQuery = useQuery({ queryKey: ['plans', 'entitlement-catalog'], queryFn: getEntitlementCatalog });
  const [planId, setPlanId] = useState('');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('MONTHLY');
  const [seats, setSeats] = useState('');
  const [price, setPrice] = useState('');
  const [entitlements, setEntitlements] = useState<string[]>([]);
  const [maxStorageBytes, setMaxStorageBytes] = useState('');
  const [screenshotRetentionDays, setScreenshotRetentionDays] = useState('');
  const [allowOverLimit, setAllowOverLimit] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');
  const plans = plansQuery.data?.data.data ?? [];
  const trial = trialQuery.data?.data;
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const usageQuery = useQuery({ queryKey: ['usage-seats', 'company', trial?.companyId, { summary: true }], queryFn: () => getCompanySeatUsage(trial!.companyId, { page: 1, limit: 1 }), enabled: Boolean(trial?.companyId) });
  const usedSeats = usageQuery.data?.data.seats.used;
  const parsedSeats = Number(seats);
  const needsOverLimitOverride = usedSeats !== undefined && Number.isInteger(parsedSeats) && parsedSeats >= 1 && parsedSeats < usedSeats;
  const custom = selectedPlan?.billingModel === 'CUSTOM';
  const catalog = useMemo(() => catalogQuery.data?.data ?? [], [catalogQuery.data]);
  const mutation = useMutation({
    mutationFn: (payload: ConvertTrialPayload) => convertTrial(id, payload),
    onSuccess: async ({ data }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['trials'] }),
        client.invalidateQueries({ queryKey: ['trial', id] }),
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
        client.invalidateQueries({ queryKey: ['company', data.companyId] }),
        client.invalidateQueries({ queryKey: ['usage-seats'] }),
      ]);
      if (data.convertedSubscription?.id) navigate(`/saas/subscriptions/${data.convertedSubscription.id}`, { replace: true });
      else navigate(`/saas/trials/${data.id}`, { replace: true, state: { success: 'Trial converted successfully.' } });
    },
    onError: (cause) => setError(trialError(cause, 'Trial conversion failed. No commercial changes were applied.')),
  });

  const changePlan = (nextId: string) => {
    setPlanId(nextId);
    setAllowOverLimit(false);
    setOverrideReason('');
    setError('');
    const plan = plans.find((value) => value.id === nextId);
    if (!plan || !trial) return;
    const minimum = plan.minSeats ?? 1;
    const maximum = plan.maxSeats ?? Number.MAX_SAFE_INTEGER;
    setSeats(String(Math.min(maximum, Math.max(minimum, trial.seatLimit))));
    setPrice(plan.monthlyPricePerSeatMinor === null ? '' : String(plan.monthlyPricePerSeatMinor / 100));
    setEntitlements([...plan.entitlements]);
    setMaxStorageBytes(plan.limits.maxStorageBytes?.toString() ?? '');
    setScreenshotRetentionDays(plan.limits.screenshotRetentionDays?.toString() ?? '');
  };

  const submit = () => {
    setError('');
    const seatQuantity = Number(seats);
    if (!selectedPlan || !Number.isInteger(seatQuantity) || seatQuantity < (selectedPlan.minSeats ?? 1) || (selectedPlan.maxSeats !== null && seatQuantity > selectedPlan.maxSeats)) {
      setError('Choose an active Plan and enter a whole-number seat quantity within its bounds.');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(price)) {
      setError('Enter a non-negative price with no more than two decimal places.');
      return;
    }
    const priceMinor = Math.round(Number(price) * 100);
    const limitValues = [maxStorageBytes, screenshotRetentionDays].filter(Boolean);
    if (custom && (catalogQuery.isError || limitValues.some((value) => !Number.isInteger(Number(value)) || Number(value) < 0))) {
      setError(catalogQuery.isError ? 'Reload the entitlement catalog before converting a CUSTOM Plan.' : 'CUSTOM limits must be non-negative whole numbers.');
      return;
    }
    if (usageQuery.isLoading || usageQuery.isError || usedSeats === undefined) {
      setError('Current Employee seat usage must be loaded before conversion.');
      return;
    }
    if (seatQuantity < usedSeats && (!allowOverLimit || !overrideReason.trim())) {
      setError('Acknowledge the over-limit conversion and provide a reason.');
      return;
    }
    const limits: Record<string, number> = {};
    if (maxStorageBytes) limits.maxStorageBytes = Number(maxStorageBytes);
    if (screenshotRetentionDays) limits.screenshotRetentionDays = Number(screenshotRetentionDays);
    const payload: ConvertTrialPayload = {
      planId: selectedPlan.id,
      billingInterval,
      seatQuantity,
      ...(custom ? { customRecurringPriceMinor: priceMinor, entitlements, limits } : priceMinor !== selectedPlan.monthlyPricePerSeatMinor ? { pricePerSeatMinor: priceMinor } : {}),
      ...(seatQuantity < usedSeats ? { allowOverLimit: true, reason: overrideReason.trim() } : {}),
    };
    mutation.mutate(payload);
  };

  const loading = trialQuery.isLoading || plansQuery.isLoading;
  const effective = trial ? isEffectiveTrial(trial) : false;
  return <PageLayout>
    <PageHeader title="Convert Trial to Subscription" description="Create an ACTIVE Subscription from current Plan terms and permitted negotiated overrides." breadcrumbs={['Admin', 'SaaS Management', 'Trial Management', trial?.company.name ?? 'Trial', 'Convert']} />
    {loading ? <LoadingSkeleton rows={8} /> : trialQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void trialQuery.refetch()}>Retry</Button>}>Trial could not be loaded.</Alert> : plansQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void plansQuery.refetch()}>Retry</Button>}>Active Plans could not be loaded.</Alert> : !trial ? <Alert severity="warning">Trial not found.</Alert> : !effective ? <Alert severity="warning" action={<Button component={Link} color="inherit" to={`/saas/trials/${trial.id}`}>View Trial</Button>}>Only an effective ACTIVE Trial can be converted.</Alert> : <Stack gap={2}>
      {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}{usageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void usageQuery.refetch()}>Retry</Button>}>Current Employee seat usage could not be loaded.</Alert> : null}
      <SectionCard title="Trial Being Converted" description="Trial access is not copied into Subscription commercial terms."><Box sx={detailGrid}><Fact label="Company" value={trial.company.name} /><Fact label="Trial ends" value={trialDate(trial.endsAt)} /><Fact label="Remaining" value={trialRemaining(trial.endsAt)} /><Fact label="Trial seat allowance" value={String(trial.seatLimit)} /><Fact label="Trial entitlements" value={String(trial.entitlementsSnapshot.length)} /></Box></SectionCard>
      <Card><CardContent><Stack component="form" gap={3} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <Box sx={formGrid}>
          <TextField label="Company" value={trial.company.name} disabled helperText="Company is fixed by the Trial." />
          <TextField select required label="Target Plan" value={planId} onChange={(event) => changePlan(event.target.value)} helperText="Only ACTIVE Plans are available."><MenuItem value="" disabled>Select a Plan</MenuItem>{plans.map((plan) => <MenuItem key={plan.id} value={plan.id}>{plan.name} ({plan.code})</MenuItem>)}</TextField>
          <TextField select label="Billing interval" value={billingInterval} onChange={(event) => setBillingInterval(event.target.value as BillingInterval)}>{(['MONTHLY', 'YEARLY', 'CUSTOM'] as BillingInterval[]).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          <TextField required type="number" label="Contracted seats" value={seats} disabled={!selectedPlan} inputProps={{ min: selectedPlan?.minSeats ?? 1, max: selectedPlan?.maxSeats ?? undefined, step: 1 }} onChange={(event) => setSeats(event.target.value)} helperText={selectedPlan ? `Plan bounds: ${selectedPlan.minSeats ?? 1}–${selectedPlan.maxSeats ?? 'unlimited'}. This replaces the temporary Trial allowance.` : 'Choose a Plan to set contracted seats.'} />
          <TextField required type="number" label={custom ? 'Negotiated recurring price' : 'Agreed per-seat price'} value={price} disabled={!selectedPlan} inputProps={{ min: 0, step: '0.01' }} onChange={(event) => setPrice(event.target.value)} helperText={selectedPlan ? `Amount in ${selectedPlan.currency}. ${custom ? 'Required for CUSTOM conversion.' : 'Defaults to the selected Plan price; changes are negotiated overrides.'}` : 'Choose a Plan to resolve pricing.'} />
          <TextField label="Activation source" value="TRIAL CONVERSION" disabled helperText="Set by the backend and cannot be changed." />
        </Box>
        {selectedPlan ? <PlanPreview plan={selectedPlan} /> : <Alert severity="info">Choose a target Plan to preview the Subscription commercial snapshot.</Alert>}
        {custom ? <CustomTerms catalogLoading={catalogQuery.isLoading} catalogError={catalogQuery.isError} retryCatalog={() => void catalogQuery.refetch()} catalog={catalog} entitlements={entitlements} setEntitlements={setEntitlements} maxStorageBytes={maxStorageBytes} setMaxStorageBytes={setMaxStorageBytes} screenshotRetentionDays={screenshotRetentionDays} setScreenshotRetentionDays={setScreenshotRetentionDays} /> : selectedPlan ? <Alert severity="info">Entitlements and limits will be snapshotted from the selected current Plan. Trial snapshot values are not submitted.</Alert> : null}
        {needsOverLimitOverride && usedSeats !== undefined ? <Stack gap={1.5}><Alert severity="warning">The selected capacity of {seats} is below current usage of {usedSeats}. Conversion will leave the Company {usedSeats - parsedSeats} seats over limit.</Alert><FormControlLabel control={<Checkbox checked={allowOverLimit} onChange={(_, checked) => setAllowOverLimit(checked)} />} label="Allow Subscription capacity below current seat usage" /><TextField required label="Override reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 500 }} helperText="Required audit reason for the intentional over-limit conversion." /></Stack> : null}
        <Alert severity="warning">Conversion is atomic and terminal: the Trial becomes CONVERTED and the new Subscription becomes ACTIVE with activation source TRIAL_CONVERSION.</Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1}><Button onClick={() => navigate(`/saas/trials/${trial.id}`)} disabled={mutation.isPending}>Cancel</Button><Button type="submit" variant="contained" disabled={mutation.isPending || usageQuery.isLoading || !selectedPlan || (custom && catalogQuery.isLoading)}>{mutation.isPending ? 'Converting…' : 'Convert and activate Subscription'}</Button></Stack>
      </Stack></CardContent></Card>
    </Stack>}
  </PageLayout>;
}

function PlanPreview({ plan }: { plan: Plan }) {
  return <SectionCard title="Target Plan Commercial Preview" description="Current Plan terms will become the Subscription snapshot at conversion."><Box sx={detailGrid}><Fact label="Plan" value={`${plan.name} (${plan.code})`} /><Fact label="Billing model" value={plan.billingModel.replace('_', ' ')} /><Fact label="Catalog price" value={money(plan.monthlyPricePerSeatMinor, plan.currency)} /><Fact label="Currency" value={plan.currency} /><Fact label="Seat bounds" value={`${plan.minSeats ?? 1}–${plan.maxSeats ?? 'Unlimited'}`} /><Fact label="Plan entitlements" value={String(plan.entitlements.length)} /><Fact label="Plan limits" value={String(Object.keys(plan.limits).length)} /></Box></SectionCard>;
}

function CustomTerms({ catalogLoading, catalogError, retryCatalog, catalog, entitlements, setEntitlements, maxStorageBytes, setMaxStorageBytes, screenshotRetentionDays, setScreenshotRetentionDays }: { catalogLoading: boolean; catalogError: boolean; retryCatalog: () => void; catalog: Array<{ key: string; name: string; availability: string; assignable: boolean }>; entitlements: string[]; setEntitlements: React.Dispatch<React.SetStateAction<string[]>>; maxStorageBytes: string; setMaxStorageBytes: (value: string) => void; screenshotRetentionDays: string; setScreenshotRetentionDays: (value: string) => void }) {
  return <Stack gap={2}><SectionCard title="CUSTOM Entitlements" description="Only backend-catalogued, currently available capabilities can be negotiated.">
    {catalogLoading ? <LoadingSkeleton rows={3} /> : catalogError ? <Alert severity="error" action={<Button color="inherit" onClick={retryCatalog}>Retry</Button>}>Entitlement catalog is required for a safe CUSTOM conversion.</Alert> : <Stack direction="row" flexWrap="wrap" gap={1}>{catalog.map((item) => { const disabled = !item.assignable || item.availability !== 'AVAILABLE'; return <FormControlLabel key={item.key} disabled={disabled} control={<Checkbox checked={entitlements.includes(item.key)} onChange={(_, checked) => setEntitlements((current) => checked ? [...current, item.key] : current.filter((key) => key !== item.key))} />} label={<Stack direction="row" gap={0.5} alignItems="center"><span>{item.name}</span>{disabled ? <Chip size="small" label="Coming Soon" /> : null}</Stack>} />; })}</Stack>}
  </SectionCard><SectionCard title="CUSTOM Limits" description="Only controlled Subscription limit keys are accepted; blank means unspecified."><Box sx={formGrid}><TextField type="number" label="Maximum storage (bytes)" value={maxStorageBytes} onChange={(event) => setMaxStorageBytes(event.target.value)} inputProps={{ min: 0, step: 1 }} /><TextField type="number" label="Screenshot retention (days)" value={screenshotRetentionDays} onChange={(event) => setScreenshotRetentionDays(event.target.value)} inputProps={{ min: 0, step: 1 }} /></Box></SectionCard></Stack>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 };
