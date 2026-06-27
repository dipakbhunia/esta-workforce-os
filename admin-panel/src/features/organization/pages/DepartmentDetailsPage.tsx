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
import { getDepartment } from '../services/departments-api';
import { formatDateTime } from '../utils/department-form';

interface LocationState {
  success?: string;
}

export default function DepartmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const departmentQuery = useQuery({
    queryKey: ['department', id],
    queryFn: () => getDepartment(id!),
    enabled: Boolean(id),
  });
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (departmentQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (departmentQuery.isError || !departmentQuery.data) return <Alert severity="error">Department could not be loaded.</Alert>;

  const department = departmentQuery.data.data;

  return (
    <Stack gap={3}>
      <PageHeader title={department.name} description="Read-only department foundation profile." breadcrumbs={['Admin', 'Organization', 'Departments', department.name]} />

      {canManage && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/organization/departments/${department.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Department</Button>
        </Stack>
      )}

      <Box sx={statGrid}>
        <StatCard label="Assigned Branch" value={department.branch?.name ?? 'Unassigned'} helper={department.branch?.code ?? 'No branch selected'} icon={Building2} tone="#2563EB" />
        <StatCard label="Employees" value={String(department._count?.employees ?? 'Future')} helper="Employee count when exposed" icon={Users} tone="#F59E0B" />
        <StatCard label="Status" value="ACTIVE" helper="Deleted departments are excluded" icon={Network} tone="#16A34A" />
      </Box>

      <SectionCard title="General Info" description="Core department fields currently persisted by the backend.">
        <Box sx={detailGrid}>
          <Detail label="Department Name" value={department.name} />
          <Detail label="Department Code" value={department.code} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label="ACTIVE" tone="success" /></div>
          </Box>
          <Detail label="Created Date" value={formatDateTime(department.createdAt)} />
          <Detail label="Updated Date" value={formatDateTime(department.updatedAt)} />
        </Box>
      </SectionCard>

      <SectionCard title="Assigned Branch" description="Branch relation returned by the backend when assigned.">
        <Box sx={detailGrid}>
          <Detail label="Branch" value={department.branch?.name ?? 'Unassigned'} />
          <Detail label="Branch Code" value={department.branch?.code ?? '-'} />
          <Detail label="Branch Address" value={department.branch?.address ?? '-'} />
        </Box>
      </SectionCard>

      <SectionCard title="Future Placeholders" description="These areas will connect as related modules expand.">
        <Box sx={detailGrid}>
          {['Employees'].map((item) => (
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
