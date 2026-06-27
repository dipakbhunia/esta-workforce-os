import { Alert, Box, Button, Card, CardContent, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Building2, Edit3, Network, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { getCompany } from '../services/companies-api';
import type { CompanyStatus } from '../types/company.types';
import { formatDateTime } from '../utils/company-form';

interface LocationState {
  success?: string;
}

export default function CompanyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const companyQuery = useQuery({
    queryKey: ['company', id],
    queryFn: () => getCompany(id!),
    enabled: Boolean(id),
  });
  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('COMPANY_ADMIN');

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (companyQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (companyQuery.isError || !companyQuery.data) return <Alert severity="error">Company could not be loaded.</Alert>;

  const company = companyQuery.data.data;

  return (
    <Stack gap={3}>
      <PageHeader
        title={company.name}
        description="Read-only company foundation profile."
        breadcrumbs={['Admin', 'Organization', 'Companies', company.name]}
      />

      {canEdit && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/organization/companies/${company.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Company</Button>
        </Stack>
      )}

      <Box sx={statGrid}>
        <StatCard label="Branches" value="Future" helper="Branch module next" icon={Building2} tone="#2563EB" />
        <StatCard label="Departments" value="Future" helper="Department module next" icon={Network} tone="#16A34A" />
        <StatCard label="Employees" value={String(company._count?.employees ?? 'Future')} helper="Employee count when exposed" icon={Users} tone="#F59E0B" />
        <StatCard label="Status" value={company.status} helper="Company tenant status" icon={Building2} tone={company.status === 'ACTIVE' ? '#16A34A' : '#6B7280'} />
      </Box>

      <SectionCard title="General Info" description="Core company fields currently persisted by the backend.">
        <Box sx={detailGrid}>
          <Detail label="Company Name" value={company.name} />
          <Detail label="Company Code" value={company.slug} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label={company.status} tone={statusTone(company.status)} /></div>
          </Box>
          <Detail label="Created Date" value={formatDateTime(company.createdAt)} />
          <Detail label="Updated Date" value={formatDateTime(company.updatedAt)} />
        </Box>
      </SectionCard>

      <SectionCard title="Future Placeholders" description="These company profile areas will connect as backend fields expand.">
        <Box sx={detailGrid}>
          {['Branches', 'Departments', 'Employees', 'Country', 'Timezone', 'Currency'].map((item) => (
            <Card variant="outlined" key={item}>
              <CardContent>
                <Typography fontWeight={800}>{item}</Typography>
                <Typography variant="body2" color="text.secondary">Reserved for upcoming module integration.</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </SectionCard>

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}
      </Snackbar>
    </Stack>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  );
}

function statusTone(status: CompanyStatus) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'info';
  if (status === 'SUSPENDED') return 'danger';
  return 'neutral';
}

const statGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
};

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
