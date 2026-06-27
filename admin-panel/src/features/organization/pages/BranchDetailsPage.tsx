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
import { getBranch } from '../services/branches-api';
import { formatDateTime } from '../utils/branch-form';

interface LocationState {
  success?: string;
}

export default function BranchDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const branchQuery = useQuery({
    queryKey: ['branch', id],
    queryFn: () => getBranch(id!),
    enabled: Boolean(id),
  });
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (branchQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (branchQuery.isError || !branchQuery.data) return <Alert severity="error">Branch could not be loaded.</Alert>;

  const branch = branchQuery.data.data;

  return (
    <Stack gap={3}>
      <PageHeader title={branch.name} description="Read-only branch foundation profile." breadcrumbs={['Admin', 'Organization', 'Branches', branch.name]} />

      {canManage && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/organization/branches/${branch.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Branch</Button>
        </Stack>
      )}

      <Box sx={statGrid}>
        <StatCard label="Departments" value={String(branch._count?.departments ?? 'Future')} helper="Department count when exposed" icon={Network} tone="#2563EB" />
        <StatCard label="Employees" value={String(branch._count?.employees ?? 'Future')} helper="Employee count when exposed" icon={Users} tone="#F59E0B" />
        <StatCard label="Status" value="ACTIVE" helper="Deleted branches are excluded" icon={Building2} tone="#16A34A" />
      </Box>

      <SectionCard title="General Info" description="Core branch fields currently persisted by the backend.">
        <Box sx={detailGrid}>
          <Detail label="Branch Name" value={branch.name} />
          <Detail label="Branch Code" value={branch.code} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label="ACTIVE" tone="success" /></div>
          </Box>
          <Detail label="Created Date" value={formatDateTime(branch.createdAt)} />
          <Detail label="Updated Date" value={formatDateTime(branch.updatedAt)} />
        </Box>
      </SectionCard>

      <SectionCard title="Location" description="Persisted address plus placeholders for richer location metadata.">
        <Box sx={detailGrid}>
          <Detail label="Address" value={branch.address ?? '-'} />
          <Detail label="City" value="Future" />
          <Detail label="State" value="Future" />
          <Detail label="Country" value="Future" />
          <Detail label="Postal Code" value="Future" />
        </Box>
      </SectionCard>

      <SectionCard title="Future Placeholders" description="These areas will connect as related modules expand.">
        <Box sx={detailGrid}>
          {['Departments', 'Employees'].map((item) => (
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

const statGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
