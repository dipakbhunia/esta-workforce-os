import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { SeatUsageSummary } from '@/features/usage-seats/SeatUsageSummary';
import { getCompanySeatUsage } from '@/features/usage-seats/usage-seats-api';
import { getCompanyStorageUsage } from '@/features/storage-usage/storage-usage-api';
import { StorageUsageSummary } from '@/features/storage-usage/StorageUsageSummary';
import { getSubscription, runSubscriptionAction } from './subscriptions-api';
import type { OverLimitOverride, SubscriptionStatus } from './subscription.types';
import { recurringMoney, subscriptionDate, subscriptionTone } from './subscription-utils';

type Action = 'activate' | 'suspend' | 'resume' | 'cancel' | 'expire';
const actions: Record<SubscriptionStatus, Action[]> = {
  PENDING: ['activate', 'cancel'],
  ACTIVE: ['suspend', 'cancel', 'expire'],
  SUSPENDED: ['resume', 'cancel', 'expire'],
  SUPERSEDED: [],
  CANCELLED: [],
  EXPIRED: [],
};
const actionLabel = (action: Action) => action === 'cancel' ? 'Cancel subscription' : action === 'expire' ? 'Expire subscription' : action.charAt(0).toUpperCase() + action.slice(1);

export default function SubscriptionDetailsPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [allowOverLimit, setAllowOverLimit] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['subscription', id], queryFn: () => getSubscription(id!), enabled: Boolean(id) });
  const value = query.data?.data;
  const usageQuery = useQuery({
    queryKey: ['usage-seats', 'company', value?.company.id, { summary: true }],
    queryFn: () => getCompanySeatUsage(value!.company.id, { page: 1, limit: 1 }),
    enabled: Boolean(value?.company.id),
    refetchInterval: 60_000,
  });
  const usage = usageQuery.data?.data;
  const storageQuery = useQuery({
    queryKey: ['storage-usage', 'company', value?.company.id],
    queryFn: () => getCompanyStorageUsage(value!.company.id),
    enabled: Boolean(value?.company.id && (value.status === 'ACTIVE' || value.status === 'SUSPENDED')),
    refetchInterval: 60_000,
  });
  const storageUsage = storageQuery.data?.data;
  const mutation = useMutation({
    mutationFn: ({ next, payload }: { next: Action; payload?: OverLimitOverride }) => runSubscriptionAction(id!, next, payload),
    onSuccess: async ({ data }) => {
      closeAction();
      await Promise.all([
        client.invalidateQueries({ queryKey: ['subscription', id] }),
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
        client.invalidateQueries({ queryKey: ['usage-seats', 'company', data.companyId] }),
        client.invalidateQueries({ queryKey: ['usage-seats'] }),
        client.invalidateQueries({ queryKey: ['storage-usage'] }),
      ]);
    },
    onError: (cause: unknown) => {
      const candidate = cause as { response?: { data?: { message?: string | string[] } } };
      const message = candidate.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message ?? 'Subscription action failed.');
      closeAction();
    },
  });
  const availableActions = value ? actions[value.status].filter((next) => (next !== 'activate' || value.activationSource !== 'PAYMENT') && (next !== 'expire' || Boolean(value.currentPeriodEnd && new Date(value.currentPeriodEnd) <= new Date()))) : [];
  const mayShowCurrentUsage = value?.status === 'ACTIVE' || value?.status === 'SUSPENDED';
  const isCurrentAgreement = Boolean(value && usage && (value.status === 'ACTIVE' || value.status === 'SUSPENDED') && usage.commercial.source === 'SUBSCRIPTION' && usage.commercial.referenceId === value.id);
  const isCurrentStorageAgreement = Boolean(value && storageUsage && (value.status === 'ACTIVE' || value.status === 'SUSPENDED') && storageUsage.commercial.source === 'SUBSCRIPTION' && storageUsage.commercial.referenceId === value.id);
  const activationNeedsOverride = Boolean(action === 'activate' && value && usage && value.seatQuantity < usage.seats.used);
  const activationReady = action !== 'activate' || (!usageQuery.isLoading && !usageQuery.isError && (!activationNeedsOverride || (allowOverLimit && Boolean(overrideReason.trim()))));

  function closeAction() {
    setAction(null);
    setAllowOverLimit(false);
    setOverrideReason('');
  }

  return <PageLayout>
    <PageHeader title={value ? `${value.company.name} Subscription` : 'Subscription Details'} description="Effective commercial snapshot and lifecycle." breadcrumbs={['Admin', 'SaaS Management', 'Subscriptions', value?.company.name ?? 'Details']} />
    {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}
    {query.isLoading ? <LoadingSkeleton rows={8} /> : query.isError ? <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>Subscription could not be loaded.</Alert> : value ? <Stack gap={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
        <StatusChip label={value.status} tone={subscriptionTone(value.status)} />
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {value.status === 'ACTIVE' || value.status === 'SUSPENDED' ? <Button component={Link} to={`/saas/subscriptions/${value.id}/amend`} variant="outlined">Amend</Button> : null}
          {availableActions.map((next) => <Button key={next} variant={next === 'cancel' || next === 'expire' ? 'outlined' : 'contained'} color={next === 'cancel' || next === 'expire' ? 'error' : 'primary'} onClick={() => { setError(''); closeAction(); setAction(next); }}>{actionLabel(next)}</Button>)}
        </Stack>
      </Stack>
      {value.status === 'PENDING' && value.activationSource === 'PAYMENT' ? <Alert severity="info"><strong>Subscription: Pending.</strong> This agreement requires payment-owned activation and cannot be manually activated from this screen. Payment processing details are not available on this screen yet.</Alert> : null}
      <SectionCard title="Agreement" description="Plan lineage and immutable effective terms."><Box sx={grid}><Fact label="Company" value={value.company.name} /><Fact label="Plan snapshot" value={value.planNameSnapshot} /><Fact label="Plan code snapshot" value={value.planCodeSnapshot} /><Fact label="Billing model" value={value.billingModelSnapshot === 'PER_USER' ? 'Per user' : 'Custom'} /><Fact label="Pricing interval" value={value.pricingInterval ? value.pricingInterval.charAt(0) + value.pricingInterval.slice(1).toLowerCase() : 'Unresolved'} /><Fact label="Recurring price basis" value={value.recurringPriceBasis === 'PER_USER_UNIT' ? 'Per-user unit price' : value.recurringPriceBasis === 'FIXED_TOTAL' ? 'Fixed recurring total' : 'Unresolved'} /><Fact label="Recurring unit price" value={value.recurringPriceBasis === 'PER_USER_UNIT' ? recurringMoney(value.recurringUnitPriceMinor, value.recurringCurrency) : 'Not applicable — fixed total'} /><Fact label="Contracted seats" value={String(value.seatQuantity)} /><Fact label="Authoritative recurring total" value={recurringMoney(value.recurringTotalPriceMinor, value.recurringCurrency)} /><Fact label="Recurring currency" value={value.recurringCurrency ?? 'Unresolved'} /><Fact label="Pricing resolution" value={value.pricingResolvedAt ? `Resolved ${subscriptionDate(value.pricingResolvedAt)}` : 'Unresolved'} /><Fact label="Activation source" value={value.activationSource.replaceAll('_', ' ')} /></Box>{value.recurringPriceBasis === 'PER_USER_UNIT' ? <Alert severity="info" sx={{ mt: 2 }}>Stored unit price × {value.seatQuantity} contracted seats → stored recurring total. Displayed values come from the immutable server snapshot.</Alert> : value.recurringPriceBasis === 'FIXED_TOTAL' ? <Alert severity="info" sx={{ mt: 2 }}>The stored amount is a fixed recurring total and is not multiplied by contracted seats.</Alert> : null}</SectionCard>
      {mayShowCurrentUsage && usageQuery.isLoading ? <LoadingSkeleton rows={3} /> : mayShowCurrentUsage && usageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void usageQuery.refetch()}>Retry</Button>}>Current Company seat usage could not be loaded.</Alert> : isCurrentAgreement && usage ? <SeatUsageSummary value={usage} title="Current Company Seat Usage" description="Today's canonical Company usage for this current Subscription. This is not a historical agreement snapshot." /> : null}
      {mayShowCurrentUsage && storageQuery.isLoading ? <LoadingSkeleton rows={3} /> : mayShowCurrentUsage && storageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void storageQuery.refetch()}>Retry</Button>}>Current Company storage usage could not be loaded.</Alert> : isCurrentStorageAgreement && storageUsage ? <StorageUsageSummary value={storageUsage} title="Current Company Storage Usage" description="Today's canonical screenshot storage for this current Subscription. This is not a historical agreement measurement." /> : null}
      <SectionCard title="Entitlements & Limits" description="These snapshots do not change when the catalog plan changes."><Typography variant="caption" color="text.secondary">Entitlements</Typography><Stack direction="row" flexWrap="wrap" gap={1} my={1}>{value.entitlementsSnapshot.length ? value.entitlementsSnapshot.map((key) => <Chip key={key} label={key} />) : <Typography>None</Typography>}</Stack><Typography variant="caption" color="text.secondary">Limits</Typography><Box sx={grid}>{Object.entries(value.limitsSnapshot).length ? Object.entries(value.limitsSnapshot).map(([key, amount]) => <Fact key={key} label={key} value={String(amount)} />) : <Typography>No limits configured</Typography>}</Box></SectionCard>
      <SectionCard title="Dates & Lineage" description="Lifecycle dates and retained amendment references."><Box sx={grid}><Fact label="Starts" value={subscriptionDate(value.startsAt)} /><Fact label="Period start" value={subscriptionDate(value.currentPeriodStart)} /><Fact label="Period end" value={subscriptionDate(value.currentPeriodEnd)} /><Fact label="Suspended" value={subscriptionDate(value.suspendedAt)} /><Fact label="Cancelled" value={subscriptionDate(value.cancelledAt)} /><Fact label="Ended" value={subscriptionDate(value.endedAt)} /><Fact label="Created" value={subscriptionDate(value.createdAt)} /><Fact label="Updated" value={subscriptionDate(value.updatedAt)} /><Fact label="Supersedes" value={value.supersedes ? `${value.supersedes.planNameSnapshot} (${value.supersedes.status})` : 'None'} /><Fact label="Successor" value={value.successors[0] ? `${value.successors[0].planNameSnapshot} (${value.successors[0].status})` : 'None'} /></Box>{value.successors[0] ? <Button component={Link} to={`/saas/subscriptions/${value.successors[0].id}`} sx={{ mt: 2 }}>View successor</Button> : null}</SectionCard>
      <Button component={Link} to={`/organization/companies/${value.company.id}`} variant="outlined">View company</Button>
      <ConfirmDialog open={Boolean(action)} title={action ? `${actionLabel(action)}?` : 'Confirm subscription action'} description={action === 'cancel' || action === 'expire' ? 'This is a terminal lifecycle action and cannot be reversed.' : `Confirm the ${action ?? ''} lifecycle transition.`} confirmLabel={action ? actionLabel(action) : 'Confirm'} loading={mutation.isPending} confirmDisabled={!activationReady} onClose={() => { if (!mutation.isPending) closeAction(); }} onConfirm={() => { if (!action) return; mutation.mutate({ next: action, payload: action === 'activate' && activationNeedsOverride ? { allowOverLimit: true, reason: overrideReason.trim() } : undefined }); }}>
        {action === 'activate' ? <Stack gap={1.5} sx={{ mt: 2 }}>
          {usageQuery.isLoading ? <LoadingSkeleton rows={2} /> : usageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void usageQuery.refetch()}>Retry</Button>}>Current Employee usage must be loaded before activation.</Alert> : activationNeedsOverride && usage ? <>
            <Alert severity="warning">This Subscription provides {value.seatQuantity} seats while {usage.seats.used} are currently used. Activation will place the Company {usage.seats.used - value.seatQuantity} seats over limit.</Alert>
            <FormControlLabel control={<Checkbox checked={allowOverLimit} onChange={(_, checked) => setAllowOverLimit(checked)} />} label="Allow activation below current seat usage" />
            <TextField required label="Override reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 500 }} helperText="Required audit reason for an intentional over-limit activation." />
          </> : usage ? <Alert severity="success">Capacity {value.seatQuantity}; current usage {usage.seats.used}. No over-limit override is required.</Alert> : null}
        </Stack> : null}
      </ConfirmDialog>
    </Stack> : <Alert severity="warning">Subscription not found.</Alert>}
  </PageLayout>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 };
