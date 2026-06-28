import { Alert, Box, Button, Card, CardContent, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Edit3, Network, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { getDesignation } from '../services/designations-api';
import { formatDateTime } from '../utils/designation-form';

interface LocationState {
  success?: string;
}

export default function DesignationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const designationQuery = useQuery({
    queryKey: ['designation', id],
    queryFn: () => getDesignation(id!),
    enabled: Boolean(id),
  });
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (designationQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (designationQuery.isError || !designationQuery.data) return <Alert severity="error">Designation could not be loaded.</Alert>;

  const designation = designationQuery.data.data;

  return (
    <Stack gap={3}>
      <PageHeader title={designation.name} description="Read-only designation foundation profile." breadcrumbs={['Admin', 'Organization', 'Designations', designation.name]} />

      {canManage && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/organization/designations/${designation.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Designation</Button>
        </Stack>
      )}

      <Box sx={statGrid}>
        <StatCard label="Assigned Department" value={designation.department?.name ?? 'Unassigned'} helper={designation.department?.code ?? 'No department selected'} icon={BadgeCheck} tone="#2563EB" />
        <StatCard label="Employees" value={String(designation._count?.employees ?? 'Future')} helper="Employee count when exposed" icon={Users} tone="#F59E0B" />
        <StatCard label="Status" value="ACTIVE" helper="Deleted designations are excluded" icon={Network} tone="#16A34A" />
      </Box>

      <SectionCard title="General Info" description="Core designation fields currently persisted by the backend.">
        <Box sx={detailGrid}>
          <Detail label="Designation Name" value={designation.name} />
          <Detail label="Designation Code" value={designation.code} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label="ACTIVE" tone="success" /></div>
          </Box>
          <Detail label="Created Date" value={formatDateTime(designation.createdAt)} />
          <Detail label="Updated Date" value={formatDateTime(designation.updatedAt)} />
        </Box>
      </SectionCard>

      <SectionCard title="Assigned Department" description="Department relation returned by the backend when assigned.">
        <Box sx={detailGrid}>
          <Detail label="Department" value={designation.department?.name ?? 'Unassigned'} />
          <Detail label="Department Code" value={designation.department?.code ?? '-'} />
        </Box>
      </SectionCard>

      <SectionCard title="Future Placeholder" description="This area will connect as related modules expand.">
        <Card variant="outlined">
          <CardContent>
            <Typography fontWeight={800}>Employees</Typography>
            <Typography variant="body2" color="text.secondary">Reserved for upcoming Employee module integration in the admin panel.</Typography>
          </CardContent>
        </Card>
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
