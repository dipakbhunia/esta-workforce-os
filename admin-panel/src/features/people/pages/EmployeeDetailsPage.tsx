import { Alert, Avatar, Box, Button, Card, CardContent, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarCheck, Clock3, Edit3, FileText, HeartPulse, Home, MapPin, Phone, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { getEmployee } from '../services/employees-api';
import type { Employee } from '../types/employee.types';
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
      <PageHeader title={name} description="Complete enterprise employee profile." breadcrumbs={['Admin', 'People', 'Employees', name]} />

      {canManage && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/people/employees/${employee.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Employee</Button>
        </Stack>
      )}

      <ProfileHeader employee={employee} />

      <SectionCard title="Personal Information" description="User-linked identity and core employee contact details.">
        <Box sx={detailGrid}>
          <Detail label="First Name" value={employee.user?.firstName ?? '-'} />
          <Detail label="Last Name" value={employee.user?.lastName ?? '-'} />
          <Detail label="Email" value={employee.user?.email ?? '-'} />
          <Detail label="Mobile" value={employee.phone ?? '-'} />
          <PlaceholderDetail label="Gender" />
          <PlaceholderDetail label="Date of Birth" />
          <PlaceholderDetail label="Blood Group" />
          <PlaceholderDetail label="Marital Status" />
        </Box>
      </SectionCard>

      <SectionCard title="Organization" description="Company and reporting structure.">
        <Box sx={detailGrid}>
          <Detail label="Company" value={employee.companyId ? `Company ${employee.companyId.slice(0, 8)}` : 'Not configured'} />
          <Detail label="Branch" value={employee.branch?.name ?? 'Not configured'} />
          <Detail label="Department" value={employee.department?.name ?? 'Not configured'} />
          <Detail label="Designation" value={employee.designation?.name ?? 'Not configured'} />
          <Detail label="Shift" value={employee.shift?.name ?? 'Not configured'} />
          <Detail label="Manager" value={managerName(employee)} />
        </Box>
      </SectionCard>

      <SectionCard title="Employment" description="Employment classification and profile lifecycle.">
        <Box sx={detailGrid}>
          <Detail label="Employment Type" value={formatEnum(employee.employmentType)} />
          <Detail label="Work Mode" value={employee.workMode === 'ONSITE' ? 'Office' : formatEnum(employee.workMode)} />
          <Detail label="Joining Date" value={formatDate(employee.joiningDate)} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label={formatEnum(employee.status)} tone={statusTone(employee.status)} /></div>
          </Box>
        </Box>
      </SectionCard>

      <SectionCard title="Contact" description="Emergency and alternate contact details.">
        <Box sx={cardGrid}>
          <InfoCard title="Alternate Mobile" value={employee.alternatePhone ?? 'Not configured'} icon={Phone} />
          <InfoCard title="Emergency Contact Name" value={employee.emergencyContactName ?? 'Not configured'} icon={UserRound} />
          <InfoCard title="Emergency Contact Number" value={employee.emergencyContactPhone ?? 'Not configured'} icon={Phone} />
          <InfoCard title="Emergency Relationship" value={employee.emergencyContactRelationship ?? 'Not configured'} icon={HeartPulse} />
        </Box>
      </SectionCard>

      <SectionCard title="Address" description="Current and permanent address placeholders.">
        <Box sx={cardGrid}>
          <InfoCard title="Current Address" value={addressText(employee)} helper="Employee address fields from backend." icon={Home} />
          <InfoCard title="Permanent Address" value="Not configured" helper="Dedicated permanent address fields are planned." icon={MapPin} />
        </Box>
      </SectionCard>

      <SectionCard title="Documents" description="Document status placeholders. Uploads are not enabled in this phase.">
        <Box sx={cardGrid}>
          {['Aadhaar', 'PAN', 'Passport', 'Resume', 'Offer Letter', 'Other Documents'].map((document) => (
            <InfoCard key={document} title={document} value="Not uploaded" icon={FileText} />
          ))}
        </Box>
      </SectionCard>

      <SectionCard title="Desktop Device" description="Device assignment placeholder for future monitoring integration.">
        <Box sx={detailGrid}>
          <Detail label="Device" value="Not assigned" />
          <Detail label="Status" value="Not assigned" />
          <Detail label="Version" value="Not assigned" />
          <Detail label="Last Heartbeat" value="Not assigned" />
        </Box>
      </SectionCard>

      <SectionCard title="Attendance Summary" description="Attendance analytics will be connected in a later phase.">
        <Box sx={cardGrid}>
          <InfoCard title="Present Days" value="Coming Soon" icon={CalendarCheck} />
          <InfoCard title="Late Days" value="Coming Soon" icon={Clock3} />
          <InfoCard title="Total Working Hours" value="Coming Soon" icon={BriefcaseBusiness} />
        </Box>
      </SectionCard>

      <SectionCard title="Leave Summary" description="Leave balance analytics will be connected in a later phase.">
        <Box sx={cardGrid}>
          <InfoCard title="Annual Leave" value="Coming Soon" icon={CalendarCheck} />
          <InfoCard title="Used" value="Coming Soon" icon={FileText} />
          <InfoCard title="Remaining" value="Coming Soon" icon={Clock3} />
        </Box>
      </SectionCard>

      <SectionCard title="Activity Timeline" description="Profile lifecycle events and future activity history.">
        <Stack gap={1.5}>
          <TimelineItem title="Employee Created" description={formatDateTime(employee.createdAt)} />
          <TimelineItem title="Profile Updated" description={formatDateTime(employee.updatedAt)} />
          <TimelineItem title="Future Activity" description="Attendance, leave, device, and document activity will appear here later." />
        </Stack>
      </SectionCard>

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}
      </Snackbar>
    </Stack>
  );
}

function ProfileHeader({ employee }: { employee: Employee }) {
  const name = fullName(employee);
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2.5} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Avatar sx={{ width: 88, height: 88, bgcolor: '#E0ECFF', color: '#1D4ED8', fontSize: 28, fontWeight: 900 }}>
            {initials || 'EW'}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" gap={1.25} alignItems="center" flexWrap="wrap">
              <Typography variant="h4" fontWeight={900}>{name}</Typography>
              <StatusChip label={formatEnum(employee.status)} tone={statusTone(employee.status)} />
            </Stack>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>{employee.employeeCode}</Typography>
            <Box sx={headerGrid}>
              <HeaderMetric label="Employment Type" value={formatEnum(employee.employmentType)} />
              <HeaderMetric label="Work Mode" value={employee.workMode === 'ONSITE' ? 'Office' : formatEnum(employee.workMode)} />
              <HeaderMetric label="Joining Date" value={formatDate(employee.joiningDate)} />
              <HeaderMetric label="Branch" value={employee.branch?.name ?? 'Not configured'} />
              <HeaderMetric label="Department" value={employee.department?.name ?? 'Not configured'} />
              <HeaderMetric label="Designation" value={employee.designation?.name ?? 'Not configured'} />
              <HeaderMetric label="Shift" value={employee.shift?.name ?? 'Not configured'} />
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
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

function PlaceholderDetail({ label }: { label: string }) {
  return <Detail label={label} value="Not configured" />;
}

function InfoCard({ title, value, helper, icon: Icon }: { title: string; value: string; helper?: string; icon: typeof UserRound }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" gap={1.25} alignItems="flex-start">
          <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#EFF6FF', color: 'primary.main', flexShrink: 0 }}>
            <Icon size={18} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">{title}</Typography>
            <Typography fontWeight={800}>{value || 'Not configured'}</Typography>
            {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ title, description }: { title: string; description: string }) {
  return (
    <Stack direction="row" gap={1.5}>
      <Box sx={{ mt: 0.5, width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
      <Box>
        <Typography fontWeight={850}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{description}</Typography>
      </Box>
    </Stack>
  );
}

function managerName(employee: Employee) {
  const manager = employee.reportingManager?.user;
  if (!manager) return 'Not configured';
  return [manager.firstName, manager.lastName].filter(Boolean).join(' ') || manager.email || 'Not configured';
}

function addressText(employee: Employee) {
  const parts = [employee.addressLine1, employee.addressLine2, employee.city, employee.state, employee.postalCode, employee.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Not configured';
}

const headerGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 1.5,
  mt: 2,
};

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
};

const cardGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
