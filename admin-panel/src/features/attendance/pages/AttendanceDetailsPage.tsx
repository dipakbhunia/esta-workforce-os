import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarCheck,
  Clock3,
  Coffee,
  Laptop,
  LogIn,
  LogOut,
  MonitorDot,
  Play,
  RotateCw,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { getAttendanceDetail, getAttendanceTimeline } from '../services/attendance-api';
import type { AttendanceDetail, AttendanceTimelineEvent, AttendanceTimelineEventType } from '../types/attendance.types';
import {
  attendanceStatusTone,
  formatDate,
  formatDateTime,
  formatEnum,
  formatMinutes,
  formatSignedMinutes,
} from '../utils/attendance-format';

const timelineMeta: Record<AttendanceTimelineEventType, { icon: LucideIcon; color: string }> = {
  PUNCH_IN: { icon: LogIn, color: '#16A34A' },
  PUNCH_OUT: { icon: LogOut, color: '#DC2626' },
  BREAK_START: { icon: Coffee, color: '#F59E0B' },
  BREAK_END: { icon: Play, color: '#2563EB' },
  AUTO_PUNCH_OUT: { icon: AlertTriangle, color: '#DC2626' },
  HEARTBEAT_LOST: { icon: AlertTriangle, color: '#F59E0B' },
};

export default function AttendanceDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const attendanceQuery = useQuery({
    queryKey: ['attendance-detail', id],
    queryFn: () => getAttendanceDetail(id!),
    enabled: Boolean(id),
  });

  const timelineQuery = useQuery({
    queryKey: ['attendance-timeline', id],
    queryFn: () => getAttendanceTimeline(id!),
    enabled: Boolean(id),
  });

  const attendance = attendanceQuery.data?.data;
  const timelineEvents = useMemo(
    () => [...(timelineQuery.data?.data.events ?? [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
    [timelineQuery.data?.data.events],
  );

  if (attendanceQuery.isLoading) return <LoadingSkeleton rows={10} />;

  if (attendanceQuery.isError || !attendance) {
    return (
      <Stack gap={3}>
        <PageHeader title="Attendance Details" description="Read-only attendance session details." breadcrumbs={['Admin', 'Attendance', 'Details']} />
        <ErrorCard
          title="Could not load attendance details"
          description="The attendance record may be unavailable, or you may not have permission to view it."
          onRetry={() => attendanceQuery.refetch()}
        />
      </Stack>
    );
  }

  const employeeFullName = fullName(attendance);
  const metrics = calculateMetrics(attendance);
  const shiftDisplay = shiftLabel(attendance);

  return (
    <Stack gap={3}>
      <PageHeader
        title="Attendance Details"
        description="Session detail, working metrics, and timeline for this attendance record."
        breadcrumbs={['Admin', 'Attendance', employeeFullName]}
      />

      <SectionCard title="Employee" description="Employee linked to this attendance session.">
        <Box sx={employeeGrid}>
          <AvatarCell name={employeeFullName} email={attendance.user?.email} />
          <Detail label="Employee Code" value={attendance.employeeCode ?? attendance.employee?.employeeCode ?? 'Not available'} />
          <Detail label="Email" value={attendance.user?.email ?? attendance.employee?.user?.email ?? 'Not available'} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Status
            </Typography>
            <Box sx={{ mt: 0.75 }}>
              <StatusChip label={formatEnum(attendance.status)} tone={attendanceStatusTone(attendance.status)} />
            </Box>
          </Box>
        </Box>
      </SectionCard>

      <Box sx={summaryGrid}>
        <StatCard label="Status" value={formatEnum(attendance.status)} helper="HR attendance classification" icon={CalendarCheck} tone="#2563EB" />
        <StatCard label="Worked Time" value={formatMinutes(metrics.workedMinutes)} helper={`${metrics.workedMinutes} minutes recorded`} icon={Clock3} tone="#16A34A" />
        <StatCard label="Expected Time" value={formatMinutes(metrics.expectedMinutes)} helper="Shift expectation" icon={TimerReset} tone="#F59E0B" />
        <StatCard label="Break Time" value={formatMinutes(metrics.breakMinutes)} helper={`${metrics.breakMinutes} minutes on break`} icon={Coffee} tone="#2563EB" />
        <StatCard label="Attendance Date" value={formatDate(attendance.attendanceDate)} helper="Company attendance day" icon={CalendarCheck} tone="#2563EB" />
        <StatCard label="Shift" value={shiftDisplay} helper={attendance.shift?.timezone ?? attendance.shiftTimezone ?? 'Timezone not available'} icon={TrendingUp} tone="#16A34A" />
      </Box>

      <Box sx={twoColumnGrid}>
        <SectionCard title="Session Information" description="Punch activity and shift context.">
          <Box sx={detailGrid}>
            <Detail label="Punch In" value={formatDateTime(attendance.punchInAt)} />
            <Detail label="Punch Out" value={attendance.punchOutAt ? formatDateTime(attendance.punchOutAt) : 'Open session'} />
            <Detail label="Auto Punch Out Reason" value={attendance.autoPunchOutReason ?? 'Not applicable'} />
            <Detail label="Shift Timing" value={shiftDisplay} />
            <Detail label="Timezone" value={attendance.shift?.timezone ?? attendance.shiftTimezone ?? 'Not available'} />
            <Detail label="Created" value={formatDateTime(attendance.createdAt)} />
            <Detail label="Updated" value={formatDateTime(attendance.updatedAt)} />
          </Box>
        </SectionCard>

        <SectionCard title="Working Metrics" description="Calculated from the backend attendance response.">
          <Box sx={detailGrid}>
            <Detail label="Worked Minutes" value={String(metrics.workedMinutes)} />
            <Detail label="Expected Minutes" value={metrics.expectedMinutes === null ? 'Not available' : String(metrics.expectedMinutes)} />
            <Detail label="Difference" value={formatSignedMinutes(metrics.differenceMinutes)} />
            <Detail label="Overtime" value="Available in future attendance rules" />
            <Detail label="Break Minutes" value={String(metrics.breakMinutes)} />
            <Detail label="Attendance Date" value={formatDate(attendance.attendanceDate)} />
          </Box>
        </SectionCard>
      </Box>

      <SectionCard
        title="Attendance Timeline"
        description="Chronological punch, break, and system events."
        action={
          <Button size="small" variant="outlined" startIcon={<RotateCw size={16} />} onClick={() => timelineQuery.refetch()}>
            Refresh
          </Button>
        }
      >
        {timelineQuery.isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : timelineQuery.isError ? (
          <ErrorCard
            title="Could not load timeline"
            description="Timeline events are unavailable right now. Retry after a moment."
            onRetry={() => timelineQuery.refetch()}
          />
        ) : timelineEvents.length === 0 ? (
          <EmptyState title="No timeline events" description="Punch and break events will appear here when available." />
        ) : (
          <Stack divider={<Divider flexItem />} sx={{ position: 'relative' }}>
            {timelineEvents.map((event, index) => (
              <TimelineItem key={event.eventId} event={event} isLast={index === timelineEvents.length - 1} />
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Monitoring Context" description="Future monitoring insights for this attendance session.">
        <Box sx={placeholderGrid}>
          <PlaceholderCard icon={Laptop} title="Desktop Device" />
          <PlaceholderCard icon={MonitorDot} title="Screenshots" />
          <PlaceholderCard icon={Play} title="Applications" />
          <PlaceholderCard icon={TrendingUp} title="Productivity" />
        </Box>
      </SectionCard>
    </Stack>
  );
}

function TimelineItem({ event, isLast }: { event: AttendanceTimelineEvent; isLast: boolean }) {
  const meta = timelineMeta[event.type] ?? timelineMeta.HEARTBEAT_LOST;
  const Icon = meta.icon;
  const metadata = formatMetadata(event.metadata);

  return (
    <Box sx={timelineItem}>
      <Box sx={{ ...timelineIcon, bgcolor: `${meta.color}18`, color: meta.color }}>
        <Icon size={20} strokeWidth={2.2} />
      </Box>
      {!isLast && <Box sx={timelineLine} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1}>
          <Typography fontWeight={900}>{event.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {formatDateTime(event.time)}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {event.description}
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.25 }}>
          <Chip size="small" label={formatEnum(event.type)} sx={{ bgcolor: `${meta.color}14`, color: meta.color, fontWeight: 800 }} />
          <Chip size="small" label={`Source: ${formatEnum(event.source)}`} variant="outlined" />
        </Stack>
        {metadata.length > 0 && (
          <Box sx={metadataGrid}>
            {metadata.map(([key, value]) => (
              <Detail key={key} label={formatEnum(key)} value={String(value)} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function PlaceholderCard({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={placeholderIcon}>
          <Icon size={21} />
        </Box>
        <Typography fontWeight={900} sx={{ mt: 1.5 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Available in Monitoring Module
        </Typography>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ title, description, onRetry }: { title: string; description: string; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      <Typography fontWeight={900}>{title}</Typography>
      <Typography variant="body2">{description}</Typography>
    </Alert>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  );
}

function fullName(attendance: AttendanceDetail) {
  const user = attendance.user ?? attendance.employee?.user;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unknown employee';
}

function shiftLabel(attendance: AttendanceDetail) {
  const startTime = attendance.shift?.startTime ?? attendance.shiftStartTime;
  const endTime = attendance.shift?.endTime ?? attendance.shiftEndTime;
  if (startTime && endTime) return `${startTime} to ${endTime}`;
  return 'Timing not available';
}

function calculateMetrics(attendance: AttendanceDetail) {
  const workedMinutes = attendance.workedMinutes ?? 0;
  const breakMinutes = attendance.breakMinutes ?? 0;
  const expectedMinutes = attendance.expectedMinutes ?? null;
  const differenceMinutes = expectedMinutes === null ? null : workedMinutes - expectedMinutes;
  return { workedMinutes, breakMinutes, expectedMinutes, differenceMinutes };
}

function formatMetadata(metadata: Record<string, unknown>) {
  return Object.entries(metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value] as [string, string | number | boolean]);
}

const employeeGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '1.5fr repeat(3, minmax(0, 1fr))' },
  gap: 2,
  alignItems: 'center',
};

const summaryGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};

const twoColumnGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' },
  gap: 2,
};

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};

const timelineItem = {
  position: 'relative',
  display: 'flex',
  gap: 2,
  py: 2.25,
};

const timelineIcon = {
  position: 'relative',
  zIndex: 1,
  width: 42,
  height: 42,
  borderRadius: '14px',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
};

const timelineLine = {
  position: 'absolute',
  left: 20,
  top: 54,
  bottom: -10,
  width: '2px',
  bgcolor: 'divider',
};

const metadataGrid = {
  mt: 1.5,
  p: 1.5,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: '#F9FAFB',
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 1.5,
};

const placeholderGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
};

const placeholderIcon = {
  width: 42,
  height: 42,
  borderRadius: '12px',
  bgcolor: '#EEF2FF',
  color: 'primary.main',
  display: 'grid',
  placeItems: 'center',
};
