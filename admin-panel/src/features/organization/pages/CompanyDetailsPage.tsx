import { Alert, Box, Button, Link, Snackbar, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Building2, Edit3, Network, Trash2, UserRound, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { deleteCompany, getCompany } from '../services/companies-api';
import type { CompanyStatus } from '../types/company.types';
import { companyErrorMessage, formatDateTime } from '../utils/company-form';
import { getSubscriptions } from '@/features/subscriptions/subscriptions-api';
import { subscriptionMoney } from '@/features/subscriptions/subscription-utils';
import { getTrials } from '@/features/trials/trials-api';
import { isEffectiveTrial, trialDate, trialRemaining } from '@/features/trials/trial-utils';

interface LocationState {
  success?: string;
}

export default function CompanyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const companyQuery = useQuery({ queryKey: ['company', id], queryFn: () => getCompany(id!), enabled: Boolean(id) });
  const trialsQuery = useQuery({ queryKey: ['trials', 'company-active', id], queryFn: () => getTrials({ page: 1, limit: 1, companyId: id!, status: 'ACTIVE' }), enabled: Boolean(id), refetchInterval: 60_000 });
  const subscriptionsQuery = useQuery({ queryKey: ['subscriptions', 'company-live', id], queryFn: async () => { const [active, suspended] = await Promise.all([getSubscriptions({ page: 1, limit: 1, companyId: id!, status: 'ACTIVE' }), getSubscriptions({ page: 1, limit: 1, companyId: id!, status: 'SUSPENDED' })]); return active.data.data[0] ?? suspended.data.data[0] ?? null; }, enabled: Boolean(id) });
  const archiveMutation = useMutation({
    mutationFn: () => deleteCompany(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      navigate('/organization/companies', { replace: true });
    },
    onError: (error) => setToast({ severity: 'error', message: companyErrorMessage(error, 'Company could not be archived.') }),
  });

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast({ severity: 'success', message: success });
  }, [location.state]);

  const company = companyQuery.data?.data;
  const activeTrial = trialsQuery.data?.data.data[0];
  const effectiveTrial = activeTrial && isEffectiveTrial(activeTrial) ? activeTrial : null;
  const liveSubscription = subscriptionsQuery.data;

  return (
    <PageLayout>
      <PageHeader title={company?.name ?? 'Company Details'} description="Tenant identity, regional settings, contacts, and organization footprint." breadcrumbs={['Admin', 'Organization', 'Companies', company?.name ?? 'Details']} />

      {companyQuery.isLoading ? <LoadingSkeleton rows={8} /> : companyQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void companyQuery.refetch()}>Retry</Button>}>Company could not be loaded.</Alert> : !company ? <Alert severity="warning">Company not found.</Alert> : <>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1}>
          <Button component={RouterLink} to={`/organization/companies/${company.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Company</Button>
          <Button color="error" variant="outlined" startIcon={<Trash2 size={18} />} onClick={() => setArchiveOpen(true)}>Archive</Button>
        </Stack>

        <SummaryCardsContainer minCardWidth={180}>
          <StatCard label="Branches" value={String(company.counts.branches)} helper="Active branch records" icon={Building2} tone="#2563EB" />
          <StatCard label="Departments" value={String(company.counts.departments)} helper="Active departments" icon={Network} tone="#16A34A" />
          <StatCard label="Designations" value={String(company.counts.designations)} helper="Active designations" icon={BadgeCheck} tone="#7C3AED" />
          <StatCard label="Employees" value={String(company.counts.employees)} helper="Current employee records" icon={Users} tone="#F59E0B" />
          <StatCard label="Users" value={String(company.counts.users)} helper="Current user accounts" icon={UserRound} tone="#0891B2" />
        </SummaryCardsContainer>

        <SectionCard title="Company Identity" description="Core tenant identity and lifecycle information.">
          <Box sx={detailGrid}>
            <Detail label="Company Name" value={company.name} />
            <Detail label="Company Code" value={company.slug} />
            <Box><Typography variant="caption" color="text.secondary">Status</Typography><div><StatusChip label={company.status} tone={statusTone(company.status)} /></div></Box>
            <Detail label="Timezone" value={company.timezone} />
            <Detail label="Country" value={company.country} />
            <Detail label="Currency" value={company.currency} />
          </Box>
        </SectionCard>

        <SectionCard title="Contact & Address" description="Primary company contact and location information.">
          <Box sx={detailGrid}>
            <Detail label="Primary Email" value={company.primaryEmail} />
            <Detail label="Phone" value={company.phone} />
            <Box><Typography variant="caption" color="text.secondary">Website</Typography>{company.website ? <Typography fontWeight={800}><Link href={company.website} target="_blank" rel="noreferrer">{company.website}</Link></Typography> : <Typography fontWeight={800}>Not provided</Typography>}</Box>
            <Box sx={{ gridColumn: { md: 'span 2' } }}><Detail label="Primary Address" value={company.address} /></Box>
          </Box>
        </SectionCard>

        <SectionCard title="Commercial Access" description="Read-only current access source. Company operational status remains separate from Trial and Subscription access.">
          {trialsQuery.isLoading ? <LoadingSkeleton rows={2} /> : trialsQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void trialsQuery.refetch()}>Retry</Button>}>Current Trial access could not be verified.</Alert> : effectiveTrial ? <Box sx={detailGrid}><Detail label="Source" value="Trial" /><Box><Typography variant="caption" color="text.secondary">Trial Status</Typography><div><StatusChip label={effectiveTrial.status} tone="success" /></div></Box><Detail label="Starts" value={trialDate(effectiveTrial.startsAt)} /><Detail label="Ends" value={trialDate(effectiveTrial.endsAt)} /><Detail label="Remaining" value={trialRemaining(effectiveTrial.endsAt)} /><Detail label="Trial Seat Limit" value={String(effectiveTrial.seatLimit)} /><Detail label="Entitlement Count" value={String(effectiveTrial.entitlementsSnapshot.length)} /><Button component={RouterLink} to={`/saas/trials/${effectiveTrial.id}`} variant="outlined">View Trial</Button></Box> : subscriptionsQuery.isLoading ? <LoadingSkeleton rows={2} /> : subscriptionsQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void subscriptionsQuery.refetch()}>Retry</Button>}>Current Subscription access could not be verified.</Alert> : liveSubscription ? <Box sx={detailGrid}><Detail label="Source" value="Subscription" /><Detail label="Plan" value={`${liveSubscription.planNameSnapshot} (${liveSubscription.planCodeSnapshot})`} /><Box><Typography variant="caption" color="text.secondary">Subscription Status</Typography><div><StatusChip label={liveSubscription.status} tone={liveSubscription.status === 'ACTIVE' ? 'success' : 'danger'} /></div></Box><Detail label="Contracted Seats" value={String(liveSubscription.seatQuantity)} /><Detail label="Effective Price" value={subscriptionMoney(liveSubscription.billingModelSnapshot === 'PER_USER' ? liveSubscription.pricePerSeatMinor : liveSubscription.customRecurringPriceMinor, liveSubscription.currency)} /><Detail label="Billing Interval" value={liveSubscription.billingInterval} /><Detail label="Activation Source" value={liveSubscription.activationSource.replaceAll('_', ' ')} /><Button component={RouterLink} to={`/saas/subscriptions/${liveSubscription.id}`} variant="outlined">View subscription</Button></Box> : <Stack alignItems="flex-start" gap={1}><Typography color="text.secondary">No effective Trial or active/suspended Subscription currently provides commercial access for this company.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button component={RouterLink} to="/saas/trials/new" variant="contained">Start Trial</Button><Button component={RouterLink} to="/saas/subscriptions" variant="outlined">Open Subscription Management</Button></Stack></Stack>}
        </SectionCard>

        <SectionCard title="Record Information" description="Company record creation and last update timestamps.">
          <Box sx={detailGrid}><Detail label="Created" value={formatDateTime(company.createdAt)} /><Detail label="Last Updated" value={formatDateTime(company.updatedAt)} /><Detail label="Company ID" value={company.id} /></Box>
        </SectionCard>

        <ConfirmDialog open={archiveOpen} title="Archive company?" description={`Archive ${company.name} and suspend tenant access? Existing organization and workforce records will be preserved.`} confirmLabel="Archive company" loading={archiveMutation.isPending} onClose={() => { if (!archiveMutation.isPending) setArchiveOpen(false); }} onConfirm={() => archiveMutation.mutate()} />
      </>}

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value || 'Not provided'}</Typography></Box>;
}

function statusTone(status: CompanyStatus) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'info';
  if (status === 'SUSPENDED') return 'danger';
  return 'neutral';
}

const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 };
