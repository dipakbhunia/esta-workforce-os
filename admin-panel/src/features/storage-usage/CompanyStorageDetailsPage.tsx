import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getCompanyStorageUsage } from './storage-usage-api';
import { StorageUsageSummary } from './StorageUsageSummary';
import { formatStorageDate } from './storage-usage-utils';

export default function CompanyStorageDetailsPage() {
  const { companyId = '' } = useParams();
  const query = useQuery({
    queryKey: ['storage-usage', 'company', companyId],
    queryFn: () => getCompanyStorageUsage(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });
  const value = query.data?.data;

  return <PageLayout>
    <PageHeader title={value ? `${value.company.name} Storage Details` : 'Company Storage Details'} description="Current screenshot metadata measurement and commercial snapshot capacity." breadcrumbs={['Admin', 'SaaS Management', 'Storage Usage', value?.company.name ?? 'Details']} />
    {query.isLoading ? <LoadingSkeleton rows={8} /> : query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>Company storage details could not be loaded.</Alert> : value ? <Stack gap={2}>
      <SectionCard title="Company" description="Tenant identity and operational status remain separate from commercial access.">
        <Box sx={grid}><Fact label="Company" value={value.company.name} /><Fact label="Company code" value={value.company.slug} /><Box><Typography variant="caption" color="text.secondary">Operational status</Typography><div><StatusChip label={value.company.status} tone={value.company.status === 'ACTIVE' ? 'success' : value.company.status === 'SUSPENDED' ? 'danger' : 'neutral'} /></div></Box><Fact label="Company ID" value={value.company.id} /></Box>
      </SectionCard>
      <StorageUsageSummary value={value} title="Storage Capacity" description="Measured screenshot bytes compared with the authoritative Trial or Subscription limit snapshot." showDetailsLink={false} />
      <SectionCard title="Screenshot Storage" description="Aggregate metadata only; individual screenshots and sensitive monitoring details are not exposed.">
        <Box sx={grid}><Fact label="Measured screenshot objects" value={String(value.storage.measuredObjectCount)} /><Fact label="Unmeasured screenshot objects" value={String(value.storage.unmeasuredObjectCount)} /><Fact label="Earliest active screenshot" value={formatStorageDate(value.storage.earliestScreenshotAt)} /><Fact label="Latest active screenshot" value={formatStorageDate(value.storage.latestScreenshotAt)} /></Box>
      </SectionCard>
      <SectionCard title="Measurement" description="SA6.1 reporting is metadata-backed and read-only.">
        <Stack gap={1}><Fact label="Calculated" value={formatStorageDate(value.storage.calculatedAt)} /><Typography color="text.secondary">Usage is derived from finalized, non-deleted Screenshot rows with known size metadata. Objects with missing size remain explicitly unmeasured. No request-time MinIO listing, object verification, reconciliation, retention, billing, or quota enforcement is performed.</Typography></Stack>
      </SectionCard>
      <Button component={Link} to={`/organization/companies/${value.company.id}`} variant="outlined" sx={{ alignSelf: 'flex-start' }}>View Company</Button>
    </Stack> : <Alert severity="warning">Company not found.</Alert>}
  </PageLayout>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 };
