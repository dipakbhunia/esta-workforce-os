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
import { SeatUsageSummary } from '@/features/usage-seats/SeatUsageSummary';
import { getCompanySeatUsage } from '@/features/usage-seats/usage-seats-api';
import { getCompanyStorageUsage } from '@/features/storage-usage/storage-usage-api';
import { StorageUsageSummary } from '@/features/storage-usage/StorageUsageSummary';

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
  const usageQuery = useQuery({ queryKey: ['usage-seats', 'company', id, { summary: true }], queryFn: () => getCompanySeatUsage(id!, { page: 1, limit: 1 }), enabled: Boolean(id), refetchInterval: 60_000 });
  const storageQuery = useQuery({ queryKey: ['storage-usage', 'company', id], queryFn: () => getCompanyStorageUsage(id!), enabled: Boolean(id), refetchInterval: 60_000 });
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
  const seatUsage = usageQuery.data?.data;
  const storageUsage = storageQuery.data?.data;

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

        {usageQuery.isLoading ? <LoadingSkeleton rows={3} /> : usageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void usageQuery.refetch()}>Retry</Button>}>Current commercial seat usage could not be loaded.</Alert> : seatUsage ? <SeatUsageSummary value={seatUsage} title="Seat Usage" description="Canonical current commercial source and workforce-seat usage. Company operational status remains separate." /> : null}

        {storageQuery.isLoading ? <LoadingSkeleton rows={3} /> : storageQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void storageQuery.refetch()}>Retry</Button>}>Current screenshot storage usage could not be loaded.</Alert> : storageUsage ? <StorageUsageSummary value={storageUsage} title="Storage Usage" description="Canonical screenshot metadata measurement and commercial snapshot capacity. Company operational status remains separate." /> : null}

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
