import { Alert, Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Clock3, TimerReset, TriangleAlert } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { getAttendance } from '../services/attendance-api';
import type { AttendanceRecord } from '../types/attendance.types';
import { attendanceStatusTone, employeeEmail, employeeName, formatDate, formatDateTime, formatEnum, formatMinutes, shiftLabel, workedMinutes } from '../utils/attendance-format';

interface AttendanceLocationState {
  attendance?: AttendanceRecord;
}

export default function AttendanceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const stateRecord = (location.state as AttendanceLocationState | null)?.attendance;

  const fallbackQuery = useQuery({
    queryKey: ['attendance-detail-fallback', id],
    queryFn: () => getAttendance({ page: 1, limit: 100 }),
    enabled: Boolean(id) && !stateRecord,
  });

  const attendance = stateRecord ?? fallbackQuery.data?.data.data.find((record) => record.id === id);

  if (!stateRecord && fallbackQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (!attendance) {
    return (
      <Stack gap={3}>
        <PageHeader title="Attendance Details" description="Read-only attendance session details." breadcrumbs={['Admin', 'Attendance', 'Details']} />
        <Alert severity="warning">
          This attendance record could not be found in the loaded attendance page. The backend does not expose a dedicated attendance details endpoint yet.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap={3}>
      <PageHeader
        title="Attendance Details"
        description="Read-only attendance session details and exception context."
        breadcrumbs={['Admin', 'Attendance', employeeName(attendance)]}
      />

      <Stack sx={summaryGrid}>
        <StatCard label="Date" value={formatDate(attendance.attendanceDate)} helper="Attendance date" icon={CalendarCheck} tone="#2563EB" />
        <StatCard label="Working Hours" value={formatMinutes(workedMinutes(attendance))} helper="Backend worked minutes when available" icon={Clock3} tone="#16A34A" />
        <StatCard label="Break Time" value={formatMinutes(attendance.breakMinutes ?? 0)} helper="Total break duration" icon={TimerReset} tone="#F59E0B" />
        <StatCard label="Status" value={formatEnum(attendance.status)} helper="HR day classification" icon={TriangleAlert} tone={attendance.status === 'AUTO_PUNCHED_OUT' ? '#DC2626' : '#2563EB'} />
      </Stack>

      <SectionCard title="Employee" description="Employee linked to this attendance record.">
        <Stack gap={2}>
          <AvatarCell name={employeeName(attendance)} email={employeeEmail(attendance)} />
          <Box sx={detailGrid}>
            <Detail label="Employee" value={employeeName(attendance)} />
            <Detail label="Employee Code" value={attendance.employee?.employeeCode ?? 'Not available'} />
            <Detail label="Email" value={employeeEmail(attendance) ?? 'Not available'} />
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Session" description="Punch and shift data currently exposed by the backend.">
        <Box sx={detailGrid}>
          <Detail label="Attendance Date" value={formatDate(attendance.attendanceDate)} />
          <Detail label="Punch In" value={formatDateTime(attendance.punchInAt)} />
          <Detail label="Punch Out" value={attendance.punchOutAt ? formatDateTime(attendance.punchOutAt) : 'Open session'} />
          <Detail label="Working Hours" value={formatMinutes(workedMinutes(attendance))} />
          <Detail label="Break Time" value={formatMinutes(attendance.breakMinutes ?? 0)} />
          <Detail label="Shift" value={shiftLabel(attendance)} />
          <Detail label="Timezone" value={attendance.shiftTimezone ?? 'Not available'} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <Box sx={{ mt: 0.5 }}><StatusChip label={formatEnum(attendance.status)} tone={attendanceStatusTone(attendance.status)} /></Box>
          </Box>
        </Box>
      </SectionCard>

      <SectionCard title="Auto Punch Out" description="System-generated close reason when available.">
        <Box sx={detailGrid}>
          <Detail label="Reason" value={attendance.autoPunchOutReason ?? attendance.notes ?? 'Not configured'} />
          <Detail label="Late Minutes" value={formatMinutes(attendance.lateMinutes ?? 0)} />
          <Detail label="Expected Minutes" value={formatMinutes(attendance.expectedMinutes ?? null)} />
        </Box>
      </SectionCard>

      <SectionCard title="Punch Timeline" description="Future punch timeline support.">
        <Card variant="outlined">
          <CardContent>
            <Typography fontWeight={800}>Detailed punch timeline will be available in a future update.</Typography>
            <Typography variant="body2" color="text.secondary">Current foundation intentionally stays read-only and uses existing attendance APIs only.</Typography>
          </CardContent>
        </Card>
      </SectionCard>
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

const summaryGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
};

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
