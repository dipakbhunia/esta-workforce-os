import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getEntitlementCatalog } from '@/features/plans/plans-api';
import type { EntitlementCatalogItem } from '@/features/plans/plan.types';
import { SeatUsageSummary } from '@/features/usage-seats/SeatUsageSummary';
import { getCompanySeatUsage } from '@/features/usage-seats/usage-seats-api';
import { getCompanyStorageUsage } from '@/features/storage-usage/storage-usage-api';
import { StorageUsageSummary } from '@/features/storage-usage/StorageUsageSummary';
import { cancelTrial, extendTrial, getTrial } from './trials-api';
import { isEffectiveTrial, trialDate, trialError, trialRemaining, trialTone } from './trial-utils';

const MAX_DURATION_HOURS = 8760;

export default function TrialDetailsPage() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [extensionHours, setExtensionHours] = useState('24');
  const [extensionReason, setExtensionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['trial', id], queryFn: () => getTrial(id), enabled: Boolean(id), refetchInterval: 60_000 });
  const catalog = useQuery({ queryKey: ['plans', 'entitlement-catalog'], queryFn: getEntitlementCatalog });
  const trial = query.data?.data;
  const effective = trial ? isEffectiveTrial(trial) : false;
  const usageQuery = useQuery({ queryKey: ['usage-seats', 'company', trial?.companyId, { summary: true }], queryFn: () => getCompanySeatUsage(trial!.companyId, { page: 1, limit: 1 }), enabled: Boolean(trial?.companyId), refetchInterval: 60_000 });
  const storageQuery = useQuery({ queryKey: ['storage-usage', 'company', trial?.companyId], queryFn: () => getCompanyStorageUsage(trial!.companyId), enabled: Boolean(trial?.companyId && effective), refetchInterval: 60_000 });
  const refreshCommercialQueries = async (companyId: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['trial', id] }),
      client.invalidateQueries({ queryKey: ['trials'] }),
      client.invalidateQueries({ queryKey: ['company', companyId] }),
      client.invalidateQueries({ queryKey: ['subscriptions', 'company-live', companyId] }),
      client.invalidateQueries({ queryKey: ['usage-seats'] }),
      client.invalidateQueries({ queryKey: ['storage-usage'] }),
    ]);
  };
  const extendMutation = useMutation({
    mutationFn: (payload: { durationHours: number; reason: string }) => extendTrial(id, payload),
    onSuccess: async ({ data }) => { setExtendOpen(false); setExtensionHours('24'); setExtensionReason(''); await refreshCommercialQueries(data.companyId); },
    onError: (cause) => setError(trialError(cause, 'Trial could not be extended.')),
  });
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelTrial(id, { reason }),
    onSuccess: async ({ data }) => { setCancelOpen(false); setCancelReason(''); await refreshCommercialQueries(data.companyId); },
    onError: (cause) => setError(trialError(cause, 'Trial could not be cancelled.')),
  });
  const usage = usageQuery.data?.data;
  const showsCurrentUsage = Boolean(effective && usage?.commercial.source === 'TRIAL' && usage.commercial.referenceId === trial?.id);
  const storageUsage = storageQuery.data?.data;
  const showsCurrentStorageUsage = Boolean(effective && storageUsage?.commercial.source === 'TRIAL' && storageUsage.commercial.referenceId === trial?.id);
  const extension = Number(extensionHours);
  const validExtension = Number.isInteger(extension) && extension >= 1 && extension <= MAX_DURATION_HOURS && Boolean(extensionReason.trim());
  const projectedEnd = trial && Number.isInteger(extension) && extension > 0 ? new Date(new Date(trial.endsAt).getTime() + extension * 3_600_000).toISOString() : null;

  return <PageLayout>
    <PageHeader title={trial ? `${trial.company.name} Trial` : 'Trial Details'} description="Trial access snapshot, lifecycle, and conversion lineage." breadcrumbs={['Admin', 'SaaS Management', 'Trial Management', trial?.company.name ?? 'Details']} />
    {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}
    {query.isLoading ? <LoadingSkeleton rows={8} /> : query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>Trial could not be loaded.</Alert> : !trial ? <Alert severity="warning">Trial not found.</Alert> : <Stack gap={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1}>
        <StatusChip label={trial.status} tone={trialTone(trial.status)} />
        {effective ? <Stack direction={{ xs: 'column', sm: 'row' }} width={{ xs: '100%', sm: 'auto' }} flexWrap="wrap" gap={1}><Button variant="outlined" onClick={() => { setError(''); setExtendOpen(true); }}>Extend Trial</Button><Button variant="outlined" color="error" onClick={() => { setError(''); setCancelOpen(true); }}>Cancel Trial</Button><Button component={Link} to={`/saas/trials/${trial.id}/convert`} variant="contained">Convert to Subscription</Button></Stack> : null}
      </Stack>
      {trial.status === 'ACTIVE' && !effective ? <Alert severity="info">This Trial is not currently effective. Refresh to reconcile a passed end time with backend lifecycle state.</Alert> : null}
      <SectionCard title="Trial Access" description="Current Trial window and temporary access allowance."><Box sx={detailGrid}><Fact label="Company" value={trial.company.name} /><Fact label="Company code" value={trial.company.slug} /><Box><Typography variant="caption" color="text.secondary">Status</Typography><div><StatusChip label={trial.status} tone={trialTone(trial.status)} /></div></Box><Fact label="Starts" value={trialDate(trial.startsAt)} /><Fact label="Ends" value={trialDate(trial.endsAt)} /><Fact label="Remaining" value={effective ? trialRemaining(trial.endsAt) : 'Not applicable'} /><Fact label="Trial seat limit" value={String(trial.seatLimit)} /><Fact label="Entitlement count" value={String(trial.entitlementsSnapshot.length)} /></Box></SectionCard>
      {effective && usageQuery.isLoading ? <LoadingSkeleton rows={3} /> : effective && usageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void usageQuery.refetch()}>Retry</Button>}>Current Company seat usage could not be loaded.</Alert> : showsCurrentUsage && usage ? <SeatUsageSummary value={usage} title="Current Company Seat Usage" description="Today's canonical Company usage for this effective Trial. This is not a historical Trial snapshot." /> : null}
      {effective && storageQuery.isLoading ? <LoadingSkeleton rows={3} /> : effective && storageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void storageQuery.refetch()}>Retry</Button>}>Current Company storage usage could not be loaded.</Alert> : showsCurrentStorageUsage && storageUsage ? <StorageUsageSummary value={storageUsage} title="Current Company Storage Usage" description="Today's canonical screenshot storage for this effective Trial. This is not a historical Trial measurement." /> : null}
      <SectionCard title="Entitlement Snapshot" description="Immutable Trial access resolved from backend policy when the Trial started."><EntitlementSnapshot keys={trial.entitlementsSnapshot} catalog={catalog.data?.data} loading={catalog.isLoading} error={catalog.isError} retry={() => void catalog.refetch()} /></SectionCard>
      <SectionCard title="Limits Snapshot" description="Immutable Trial-specific limit policy.">{Object.keys(trial.limitsSnapshot).length ? <Stack divider={<Divider flexItem />}>{Object.entries(trial.limitsSnapshot).map(([key, value]) => <Fact key={key} label={key} value={formatValue(value)} />)}</Stack> : <Typography color="text.secondary">No trial-specific limits configured.</Typography>}</SectionCard>
      <SectionCard title="Lifecycle & Lineage" description="Terminal timestamps and converted Subscription reference are retained permanently."><Box sx={detailGrid}><Fact label="Cancelled" value={trialDate(trial.cancelledAt)} /><Fact label="Expired" value={trialDate(trial.expiredAt)} /><Fact label="Converted" value={trialDate(trial.convertedAt)} /><Fact label="Created" value={trialDate(trial.createdAt)} /><Fact label="Updated" value={trialDate(trial.updatedAt)} /><Fact label="Trial ID" value={trial.id} /><Fact label="Converted Subscription" value={trial.convertedSubscription ? `${trial.convertedSubscription.planNameSnapshot} (${trial.convertedSubscription.status})` : 'Not applicable'} /></Box>{trial.convertedSubscription ? <Button component={Link} to={`/saas/subscriptions/${trial.convertedSubscription.id}`} variant="outlined" sx={{ mt: 2 }}>View converted Subscription</Button> : null}</SectionCard>
      <Button component={Link} to={`/organization/companies/${trial.company.id}`} variant="outlined" sx={{ alignSelf: 'flex-start' }}>View company</Button>
      <Dialog open={extendOpen} onClose={extendMutation.isPending ? undefined : () => setExtendOpen(false)} fullWidth maxWidth="sm" aria-describedby="extend-trial-description">
        <DialogTitle>Extend Trial</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>{error ? <Alert severity="error">{error}</Alert> : null}<Typography id="extend-trial-description" color="text.secondary">Add time to the current Trial end. The seat limit, entitlements, and limits remain unchanged.</Typography><TextField label="Current end" value={trialDate(trial.endsAt)} disabled /><TextField autoFocus required type="number" label="Extension duration (hours)" value={extensionHours} onChange={(event) => setExtensionHours(event.target.value)} inputProps={{ min: 1, max: MAX_DURATION_HOURS, step: 1 }} helperText={projectedEnd ? `Projected new end: ${trialDate(projectedEnd)}` : `Enter 1–${MAX_DURATION_HOURS} whole hours.`} /><TextField required label="Reason" value={extensionReason} onChange={(event) => setExtensionReason(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 500 }} helperText="Required audit reason, up to 500 characters." /></Stack></DialogContent><DialogActions><Button onClick={() => setExtendOpen(false)} disabled={extendMutation.isPending}>Cancel</Button><Button variant="contained" disabled={!validExtension || extendMutation.isPending} onClick={() => { setError(''); extendMutation.mutate({ durationHours: extension, reason: extensionReason.trim() }); }}>{extendMutation.isPending ? 'Extending…' : 'Extend Trial'}</Button></DialogActions>
      </Dialog>
      <Dialog open={cancelOpen} onClose={cancelMutation.isPending ? undefined : () => setCancelOpen(false)} fullWidth maxWidth="sm" aria-describedby="cancel-trial-description">
        <DialogTitle>Cancel Trial?</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>{error ? <Alert severity="error">{error}</Alert> : null}<Typography id="cancel-trial-description" color="text.secondary">Cancelling ends Trial access early and cannot be undone. Trial history will be preserved.</Typography><TextField autoFocus required label="Reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 500 }} helperText="Required audit reason, up to 500 characters." /></Stack></DialogContent><DialogActions><Button onClick={() => setCancelOpen(false)} disabled={cancelMutation.isPending}>Keep Trial</Button><Button color="error" variant="contained" disabled={!cancelReason.trim() || cancelMutation.isPending} onClick={() => { setError(''); cancelMutation.mutate(cancelReason.trim()); }}>{cancelMutation.isPending ? 'Cancelling…' : 'Cancel Trial'}</Button></DialogActions>
      </Dialog>
    </Stack>}
  </PageLayout>;
}

function EntitlementSnapshot({ keys, catalog, loading, error, retry }: { keys: string[]; catalog?: EntitlementCatalogItem[]; loading: boolean; error: boolean; retry: () => void }) {
  if (loading) return <LoadingSkeleton rows={3} />;
  if (error || !catalog) return <Alert severity="warning" action={<Button color="inherit" onClick={retry}>Retry</Button>}>Catalog labels could not be loaded. Snapshot keys remain preserved.</Alert>;
  if (!keys.length) return <Typography color="text.secondary">No Trial entitlements were snapshotted.</Typography>;
  const known = catalog.filter((item) => keys.includes(item.key));
  const unknown = keys.filter((key) => !catalog.some((item) => item.key === key));
  const groups = [...new Set(known.map((item) => item.group))];
  return <Stack gap={2}>{groups.map((group) => <Box key={group}><Typography fontWeight={800} mb={1}>{group}</Typography><Stack direction="row" flexWrap="wrap" gap={1}>{known.filter((item) => item.group === group).map((item) => <Chip key={item.key} label={item.name} variant="outlined" />)}</Stack></Box>)}{unknown.length ? <Box><Typography fontWeight={800} mb={1}>Historical / Unknown</Typography><Stack direction="row" flexWrap="wrap" gap={1}>{unknown.map((key) => <Chip key={key} label={key} color="warning" variant="outlined" />)}</Stack></Box> : null}</Stack>;
}

function formatValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 };
