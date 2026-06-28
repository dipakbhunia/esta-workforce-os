import { Alert, Box, Button, Card, CardContent, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, Edit3, MonitorDot, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { getEmployee } from '../services/employees-api';
import { formatDate, formatDateTime, formatEnum, fullName, statusTone } from '../utils/employee-form';

interface LocationState {
  success?: string;
}

export default function EmployeeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const employeeQuery = useQuery({
    queryKey: ['employee', id],
    queryFn: () => getEmployee(id!),
    enabled: Boolean(id),
  });
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (employeeQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (employeeQuery.isError || !employeeQuery.data) return <Alert severity="error">Employee could not be loaded.</Alert>;

  const employee = employeeQuery.data.data;
  const name = fullName(employee);

  return (
    <Stack gap={3}>
      <PageHeader title={name} description="Read-only employee master profile." breadcrumbs={['Admin', 'People', 'Employees', name]} />

      {canManage && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/people/employees/${employee.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Employee</Button>
        </Stack>
      )}

      <Box sx={statGrid}>
        <StatCard label="Employee Code" value={employee.employeeCode} helper={employee.user?.email ?? 'No email'} icon={UserRound} tone="#2563EB" />
        <StatCard label="Employment" value={formatEnum(employee.employmentType)} helper={employee.workMode === 'ONSITE' ? 'Office' : formatEnum(employee.workMode)} icon={BriefcaseBusiness} tone="#16A34A" />
        <StatCard label="Status" value={formatEnum(employee.status)} helper={`Joined ${formatDate(employee.joiningDate)}`} icon={MonitorDot} tone="#F59E0B" />
      </Box>

      <SectionCard title="Personal" description="User-linked identity and employee contact information.">
        <Stack gap={2}>
          <AvatarCell name={name} email={employee.user?.email} />
          <Box sx={detailGrid}>
            <Detail label="First Name" value={employee.user?.firstName ?? '-'} />
            <Detail label="Last Name" value={employee.user?.lastName ?? '-'} />
            <Detail label="Email" value={employee.user?.email ?? '-'} />
            <Detail label="Mobile" value={employee.phone ?? '-'} />
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Organization" description="Organization foundation assignments.">
        <Box sx={detailGrid}>
          <Detail label="Branch" value={employee.branch?.name ?? 'Unassigned'} />
          <Detail label="Department" value={employee.department?.name ?? 'Unassigned'} />
          <Detail label="Designation" value={employee.designation?.name ?? 'Unassigned'} />
          <Detail label="Shift" value={employee.shift?.name ?? 'Unassigned'} />
          <Detail label="Reporting Manager" value={employee.reportingManager?.user ? `${employee.reportingManager.user.firstName} ${employee.reportingManager.user.lastName}` : 'Unassigned'} />
          <Detail label="Direct Reports" value={String(employee._count?.directReports ?? 0)} />
        </Box>
      </SectionCard>

      <SectionCard title="Employment" description="Employment classification and profile lifecycle.">
        <Box sx={detailGrid}>
          <Detail label="Employee Code" value={employee.employeeCode} />
          <Detail label="Employment Type" value={formatEnum(employee.employmentType)} />
          <Detail label="Work Mode" value={employee.workMode === 'ONSITE' ? 'Office' : formatEnum(employee.workMode)} />
          <Detail label="Joining Date" value={formatDate(employee.joiningDate)} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label={formatEnum(employee.status)} tone={statusTone(employee.status)} /></div>
          </Box>
          <Detail label="Updated Date" value={formatDateTime(employee.updatedAt)} />
        </Box>
      </SectionCard>

      <SectionCard title="Future Placeholders" description="These areas will connect in later HRMS phases.">
        <Box sx={detailGrid}>
          {['Attendance', 'Leave', 'Documents', 'Desktop Device'].map((item) => (
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
