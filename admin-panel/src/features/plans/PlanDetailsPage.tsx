import { Alert, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getEntitlementCatalog, getPlan, updatePlanStatus } from './plans-api';
import type { EntitlementCatalogItem, PlanStatus } from './plan.types';
import { moneyMinorString } from './plan-utils';

export default function PlanDetailsPage() {
  const { id = '' } = useParams(); const client = useQueryClient(); const query = useQuery({ queryKey: ['plans', id], queryFn: () => getPlan(id) });
  const catalogQuery = useQuery({ queryKey: ['plans', 'entitlement-catalog'], queryFn: getEntitlementCatalog });
  const lifecycle = useMutation({ mutationFn: (status: PlanStatus) => updatePlanStatus(id, status), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['plans'] }); } });
  if (query.isLoading) return <LoadingSkeleton rows={8} />;
  if (query.isError || !query.data) return <PageLayout><Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>Plan could not be loaded.</Alert></PageLayout>;
  const plan = query.data.data; const actions: PlanStatus[] = plan.status === 'DRAFT' ? ['ACTIVE', 'ARCHIVED'] : plan.status === 'ACTIVE' ? ['INACTIVE', 'ARCHIVED'] : plan.status === 'INACTIVE' ? ['ACTIVE', 'ARCHIVED'] : [];
  return <PageLayout><PageHeader title={plan.name} description={plan.description ?? 'No description provided.'} breadcrumbs={['Admin', 'SaaS Management', 'Plans & Pricing', plan.name]} />
    {lifecycle.isError ? <Alert severity="error">Lifecycle change could not be completed.</Alert> : null}
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mb={3}><Button component={Link} to={`/saas/plans/${plan.id}/edit`} variant="contained" disabled={plan.status === 'ARCHIVED'}>Edit plan</Button>{actions.map((status) => <Button key={status} variant="outlined" color={status === 'ARCHIVED' ? 'error' : 'primary'} disabled={lifecycle.isPending} onClick={() => lifecycle.mutate(status)}>{status === 'ACTIVE' ? 'Activate' : status === 'INACTIVE' ? 'Deactivate' : 'Archive'}</Button>)}</Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      <SectionCard title="Commercial Identity"><Stack gap={1.5}><Fact label="Code" value={plan.code} /><Box><Typography variant="caption" color="text.secondary">Status</Typography><Box><StatusChip label={plan.status} tone={plan.status === 'ACTIVE' ? 'success' : plan.status === 'ARCHIVED' ? 'danger' : 'neutral'} /></Box></Box><Fact label="Billing model" value={plan.billingModel.replace('_', ' ')} /><Fact label="MONTHLY price" value={priceLabel(plan, 'MONTHLY')} /><Fact label="YEARLY price" value={priceLabel(plan, 'YEARLY')} /><Fact label="Currency" value={plan.currency} /></Stack></SectionCard>
      <SectionCard title="Catalog Policy"><Stack gap={1.5}><Fact label="Minimum seats" value={plan.minSeats?.toString() ?? 'Unspecified'} /><Fact label="Maximum seats" value={plan.maxSeats?.toString() ?? 'Unspecified'} /><Fact label="Visibility" value={plan.isPublic ? 'Public' : 'Private'} /><Fact label="Recommended" value={plan.isRecommended ? 'Yes' : 'No'} /><Fact label="Sort order" value={String(plan.sortOrder)} /></Stack></SectionCard>
      <SectionCard title="Entitlements" description="Each capability is explicitly assigned."><EntitlementDetails keys={plan.entitlements} catalog={catalogQuery.data?.data} loading={catalogQuery.isLoading} error={catalogQuery.isError} retry={() => void catalogQuery.refetch()} /></SectionCard>
      <SectionCard title="Limits" description="Commercial allowances, distinct from platform defaults and measured usage.">{Object.keys(plan.limits).length ? <Stack divider={<Divider flexItem />}>{Object.entries(plan.limits).map(([key, value]) => <Fact key={key} label={key} value={String(value)} />)}</Stack> : <Typography color="text.secondary">No plan limits specified.</Typography>}</SectionCard>
      <SectionCard title="Metadata"><Stack gap={1.5}><Fact label="Created" value={new Date(plan.createdAt).toLocaleString()} /><Fact label="Updated" value={new Date(plan.updatedAt).toLocaleString()} /><Fact label="Archived" value={plan.archivedAt ? new Date(plan.archivedAt).toLocaleString() : 'No'} /></Stack></SectionCard>
    </Box>
  </PageLayout>;
}
function Fact({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box>; }
function priceLabel(plan: import('./plan.types').Plan, interval: 'MONTHLY' | 'YEARLY') { const value = plan.recurringPrices.find((price) => price.billingInterval === interval); if (!value) return 'Not configured'; return `${moneyMinorString(value.amountMinor, value.currency)}${plan.billingModel === 'PER_USER' ? ' / user' : ' total'}`; }
function EntitlementDetails({ keys, catalog, loading, error, retry }: { keys: string[]; catalog?: EntitlementCatalogItem[]; loading: boolean; error: boolean; retry: () => void }) { if (loading) return <LoadingSkeleton rows={3} />; if (error || !catalog) return <Alert severity="warning" action={<Button onClick={retry}>Retry</Button>}>Catalog labels could not be loaded. Assigned keys remain preserved.</Alert>; if (!keys.length) return <Typography color="text.secondary">No entitlements assigned.</Typography>; const known = catalog.filter((item) => keys.includes(item.key)); const unknown = keys.filter((key) => !catalog.some((item) => item.key === key)); const groups = [...new Set(known.map((item) => item.group))]; return <Stack gap={2}>{groups.map((group) => <Box key={group}><Typography fontWeight={800} mb={1}>{group}</Typography><Stack direction="row" gap={1} flexWrap="wrap">{known.filter((item) => item.group === group).map((item) => <Chip key={item.key} label={item.name} variant="outlined" />)}</Stack></Box>)}{unknown.length ? <Box><Typography fontWeight={800} mb={1}>Historical / Unknown</Typography><Stack direction="row" gap={1} flexWrap="wrap">{unknown.map((key) => <Chip key={key} label={key} color="warning" variant="outlined" />)}</Stack></Box> : null}</Stack>; }
