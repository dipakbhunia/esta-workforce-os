import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Pagination,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Camera,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  PauseCircle,
  RefreshCw,
  Users,
  WifiOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getMonitoringTimeline } from '../services/monitoring-api';
import type {
  MonitoringTimelineEmployee,
  MonitoringTimelineMarker,
  MonitoringTimelineMarkerType,
  MonitoringTimelineSegment,
  MonitoringTimelineSegmentType,
} from '../types/monitoring.types';
import { formatDateTime, formatDuration, formatEnum } from '../utils/monitoring-format';

const PAGE_SIZE = 12;
const MIN_TIMELINE_WIDTH = 1320;
const EMPLOYEE_COLUMN_WIDTH = 300;

const segmentStyles: Record<MonitoringTimelineSegmentType, { color: string; bg: string; tone: StatusTone }> = {
  ACTIVE: { color: '#16A34A', bg: '#DCFCE7', tone: 'success' },
  IDLE: { color: '#F59E0B', bg: '#FEF3C7', tone: 'warning' },
  BREAK: { color: '#2563EB', bg: '#DBEAFE', tone: 'info' },
  OFFLINE: { color: '#DC2626', bg: '#FEE2E2', tone: 'danger' },
  NO_ACTIVITY: { color: '#6B7280', bg: '#F3F4F6', tone: 'neutral' },
};

const markerStyles: Record<MonitoringTimelineMarkerType, { color: string; bg: string; icon: typeof LogIn }> = {
  PUNCH_IN: { color: '#16A34A', bg: '#DCFCE7', icon: LogIn },
  PUNCH_OUT: { color: '#DC2626', bg: '#FEE2E2', icon: LogOut },
  BREAK_START: { color: '#F59E0B', bg: '#FEF3C7', icon: Coffee },
  BREAK_END: { color: '#2563EB', bg: '#DBEAFE', icon: PauseCircle },
  SCREENSHOT: { color: '#7C3AED', bg: '#EDE9FE', icon: Camera },
};

export default function MonitoringTimelinePage() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('today'));
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const timelineQuery = useQuery({
    queryKey: ['monitoring-timeline', { page, limit: PAGE_SIZE, search, dateRange }],
    queryFn: () => getMonitoringTimeline({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    }),
  });

  const response = timelineQuery.data?.data;
  const employees = response?.employees ?? [];
  const rangeStart = response?.rangeStart ?? dateRange.dateFrom;
  const rangeEnd = response?.rangeEnd ?? dateRange.dateTo;
  const range = useMemo(() => getRange(rangeStart, rangeEnd), [rangeEnd, rangeStart]);
  const ticks = useMemo(() => buildTimeTicks(range.start, range.end), [range.end, range.start]);

  const totals = useMemo(() => employees.reduce((acc, employee) => ({
    activeSeconds: acc.activeSeconds + safeSeconds(employee.summary.activeSeconds),
    idleSeconds: acc.idleSeconds + safeSeconds(employee.summary.idleSeconds),
    breakSeconds: acc.breakSeconds + safeSeconds(employee.summary.breakSeconds),
    offlineSeconds: acc.offlineSeconds + safeSeconds(employee.summary.offlineSeconds),
    workedSeconds: acc.workedSeconds + safeSeconds(employee.summary.workedSeconds),
  }), {
    activeSeconds: 0,
    idleSeconds: 0,
    breakSeconds: 0,
    offlineSeconds: 0,
    workedSeconds: 0,
  }), [employees]);

  function resetFilters() {
    setSearch('');
    setDateRange(createDateRangeValue('today'));
    setPage(1);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Timeline"
        description="Employee activity timeline with active, idle, break, offline and screenshot markers."
        breadcrumbs={['Admin', 'Monitoring', 'Timeline']}
      />

      <SummaryCardsContainer>
        <StatCard label="Active Time" value={formatDuration(totals.activeSeconds)} helper="Current loaded employees" icon={Activity} tone="#16A34A" />
        <StatCard label="Idle Time" value={formatDuration(totals.idleSeconds)} helper="Current loaded employees" icon={Clock3} tone="#F59E0B" />
        <StatCard label="Break Time" value={formatDuration(totals.breakSeconds)} helper="Current loaded employees" icon={Coffee} tone="#2563EB" />
        <StatCard label="Offline Time" value={formatDuration(totals.offlineSeconds)} helper="Current loaded employees" icon={WifiOff} tone="#DC2626" />
        <StatCard label="Employees Tracked" value={String(response?.meta.total ?? employees.length)} helper="Matching current filters" icon={Users} tone="#6B7280" />
      </SummaryCardsContainer>

      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void timelineQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <SearchFilter
          placeholder="Search employee"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <DateRangePicker
          value={dateRange}
          defaultPreset="today"
          onChange={(value) => {
            setDateRange(value);
            setPage(1);
          }}
        />
      </FilterToolbar>

      <TimelineLegend />

      {timelineQuery.isLoading && <LoadingSkeleton rows={8} />}

      {timelineQuery.isError && (
        <SectionCard title="Timeline unavailable" description="Monitoring timeline data could not be loaded.">
          <Button variant="contained" startIcon={<RefreshCw size={17} />} onClick={() => void timelineQuery.refetch()}>
            Retry
          </Button>
        </SectionCard>
      )}

      {!timelineQuery.isLoading && !timelineQuery.isError && employees.length === 0 && (
        <SectionCard title="Timeline panel" description="No monitoring timeline records matched the selected filters.">
          <EmptyState title="No timeline data found" description="Try a different date range or employee search." />
        </SectionCard>
      )}

      {!timelineQuery.isLoading && !timelineQuery.isError && employees.length > 0 && (
        <SectionCard title="Employee Timeline" description={`${formatDateTime(range.start.toISOString())} to ${formatDateTime(range.end.toISOString())}`}>
          <Box sx={{ overflowX: 'auto', pb: 1 }}>
            <Box sx={{ minWidth: { xs: 920, lg: MIN_TIMELINE_WIDTH } }}>
              <TimelineHeader ticks={ticks} rangeStart={range.start} rangeEnd={range.end} />
              <Stack divider={<Divider flexItem />} sx={{ border: '1px solid #E5E7EB', borderTop: 0, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                {employees.map((employee) => (
                  <EmployeeTimelineRow
                    key={employee.employeeId}
                    employee={employee}
                    rangeStart={range.start}
                    rangeEnd={range.end}
                  />
                ))}
              </Stack>
            </Box>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2} sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Page {response?.meta.page ?? page} of {response?.meta.totalPages ?? 1}
            </Typography>
            <Pagination
              count={Math.max(1, response?.meta.totalPages ?? 1)}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
              shape="rounded"
            />
          </Stack>
        </SectionCard>
      )}

      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}
    </PageLayout>
  );
}

function TimelineHeader({ ticks, rangeStart, rangeEnd }: { ticks: Date[]; rangeStart: Date; rangeEnd: Date }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `${EMPLOYEE_COLUMN_WIDTH}px 1fr`,
        border: '1px solid #E5E7EB',
        borderRadius: '12px 12px 0 0',
        bgcolor: '#F9FAFB',
      }}
    >
      <Box sx={{ p: 2, borderRight: '1px solid #E5E7EB' }}>
        <Typography variant="body2" fontWeight={800}>Employee</Typography>
        <Typography variant="caption" color="text.secondary">Activity and daily totals</Typography>
      </Box>
      <Box sx={{ position: 'relative', minHeight: 72, px: 1 }}>
        {ticks.map((tick) => {
          const left = timePercent(tick, rangeStart, rangeEnd);
          return (
            <Box key={tick.toISOString()} sx={{ position: 'absolute', left: `${left}%`, top: 0, bottom: 0, borderLeft: '1px solid #E5E7EB' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ position: 'absolute', top: 13, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontWeight: 700 }}
              >
                {formatTimeTick(tick, rangeStart, rangeEnd)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function EmployeeTimelineRow({ employee, rangeStart, rangeEnd }: { employee: MonitoringTimelineEmployee; rangeStart: Date; rangeEnd: Date }) {
  const name = employee.user?.name || employee.user?.email || 'Employee';
  const email = employee.user?.email || undefined;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `${EMPLOYEE_COLUMN_WIDTH}px 1fr`, minHeight: 116, bgcolor: '#FFFFFF' }}>
      <Box sx={{ p: 2, borderRight: '1px solid #E5E7EB', minWidth: 0 }}>
        <AvatarCell name={name} email={email} />
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.25 }}>
          <Chip size="small" label={employee.employeeCode || 'No code'} />
          <Chip size="small" label={employee.device?.hostname || employee.device?.deviceIdentifier || 'No device'} />
        </Stack>
        <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 1.25 }}>
          <MiniStat label="Active" value={formatDuration(employee.summary.activeSeconds)} />
          <MiniStat label="Break" value={formatDuration(employee.summary.breakSeconds)} />
          <MiniStat label="Offline" value={formatDuration(employee.summary.offlineSeconds)} />
        </Stack>
      </Box>

      <Box sx={{ position: 'relative', minHeight: 116, px: 1, py: 2.25 }}>
        <Box sx={{ position: 'absolute', left: 8, right: 8, top: 49, height: 28, borderRadius: 999, bgcolor: '#F3F4F6' }} />
        {employee.segments.map((segment, index) => (
          <TimelineSegmentBar
            key={`${segment.type}-${segment.start}-${segment.end}-${index}`}
            segment={segment}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />
        ))}
        {employee.markers.map((marker, index) => (
          <TimelineMarkerIcon
            key={`${marker.type}-${marker.time}-${index}`}
            marker={marker}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />
        ))}
      </Box>
    </Box>
  );
}

function TimelineSegmentBar({ segment, rangeStart, rangeEnd }: { segment: MonitoringTimelineSegment; rangeStart: Date; rangeEnd: Date }) {
  const start = new Date(segment.start);
  const end = new Date(segment.end);
  const left = timePercent(start, rangeStart, rangeEnd);
  const right = timePercent(end, rangeStart, rangeEnd);
  const width = Math.max(0.4, right - left);
  const style = segmentStyles[segment.type] ?? segmentStyles.NO_ACTIVITY;
  const metadata = segmentMetadataLabel(segment);

  return (
    <Tooltip
      arrow
      title={(
        <Box>
          <Typography variant="body2" fontWeight={800}>{formatEnum(segment.type)}</Typography>
          <Typography variant="caption" display="block">{formatDateTime(segment.start)} to {formatDateTime(segment.end)}</Typography>
          <Typography variant="caption" display="block">Duration: {formatDuration(segment.durationSeconds)}</Typography>
          <Typography variant="caption" display="block">Source: {formatEnum(segment.source)}</Typography>
          {metadata && <Typography variant="caption" display="block">{metadata}</Typography>}
        </Box>
      )}
    >
      <Box
        sx={{
          position: 'absolute',
          left: `calc(${left}% + 8px)`,
          top: 49,
          width: `calc(${width}% - 2px)`,
          height: 28,
          minWidth: 8,
          borderRadius: 999,
          bgcolor: style.bg,
          border: `1px solid ${style.color}55`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${Math.max(8, Math.min(100, segment.intensity || 100))}%`,
            bgcolor: style.color,
            opacity: segment.type === 'NO_ACTIVITY' ? 0.35 : 0.9,
          }}
        />
      </Box>
    </Tooltip>
  );
}

function TimelineMarkerIcon({ marker, rangeStart, rangeEnd }: { marker: MonitoringTimelineMarker; rangeStart: Date; rangeEnd: Date }) {
  const style = markerStyles[marker.type] ?? markerStyles.SCREENSHOT;
  const Icon = style.icon;
  const left = timePercent(new Date(marker.time), rangeStart, rangeEnd);
  const metadata = metadataLabel(marker.metadata);

  return (
    <Tooltip
      arrow
      title={(
        <Box>
          <Typography variant="body2" fontWeight={800}>{marker.title || formatEnum(marker.type)}</Typography>
          <Typography variant="caption" display="block">{formatDateTime(marker.time)}</Typography>
          <Typography variant="caption" display="block">{formatEnum(marker.type)}</Typography>
          {metadata && <Typography variant="caption" display="block">{metadata}</Typography>}
        </Box>
      )}
    >
      <Box
        sx={{
          position: 'absolute',
          left: `calc(${left}% + 8px)`,
          top: 16,
          transform: 'translateX(-50%)',
          width: 30,
          height: 30,
          borderRadius: '10px',
          display: 'grid',
          placeItems: 'center',
          color: style.color,
          bgcolor: style.bg,
          border: '1px solid #FFFFFF',
          boxShadow: '0 8px 18px rgba(15, 23, 42, 0.12)',
          zIndex: 2,
        }}
      >
        <Icon size={16} strokeWidth={2.2} />
      </Box>
    </Tooltip>
  );
}

function TimelineLegend() {
  return (
    <SectionCard title="Legend" description="Timeline colors and markers used across employee rows.">
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {Object.entries(segmentStyles).map(([type, style]) => (
          <StatusChip key={type} label={formatEnum(type)} tone={style.tone} />
        ))}
        <LegendMarker label="Screenshot" color="#7C3AED" icon={<Camera size={15} />} />
        <LegendMarker label="Punch" color="#16A34A" icon={<LogIn size={15} />} />
        <LegendMarker label="Break Marker" color="#F59E0B" icon={<Coffee size={15} />} />
      </Stack>
    </SectionCard>
  );
}

function LegendMarker({ label, color, icon }: { label: string; color: string; icon: React.ReactNode }) {
  return (
    <Chip
      size="small"
      icon={<Box component="span" sx={{ color, display: 'inline-flex', ml: 0.5 }}>{icon}</Box>}
      label={label}
      sx={{ bgcolor: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB' }}
    />
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="caption" fontWeight={800}>{value}</Typography>
    </Box>
  );
}

function getRange(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const fallbackStart = new Date();
  fallbackStart.setHours(0, 0, 0, 0);
  const fallbackEnd = new Date(fallbackStart);
  fallbackEnd.setHours(23, 59, 59, 999);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return { start: fallbackStart, end: fallbackEnd };
  }

  return { start, end };
}

function buildTimeTicks(start: Date, end: Date) {
  const durationMs = end.getTime() - start.getTime();
  const hourMs = 60 * 60 * 1000;
  const stepMs = durationMs <= 24 * hourMs ? hourMs : durationMs <= 3 * 24 * hourMs ? 6 * hourMs : 24 * hourMs;
  const ticks: Date[] = [start];
  const firstTick = new Date(start);
  firstTick.setMinutes(0, 0, 0);
  if (firstTick.getTime() < start.getTime()) {
    firstTick.setTime(firstTick.getTime() + stepMs);
  }

  for (let time = firstTick.getTime(); time < end.getTime(); time += stepMs) {
    const tick = new Date(time);
    if (tick.getTime() > start.getTime()) {
      ticks.push(tick);
    }
  }

  ticks.push(end);
  return ticks;
}

function formatTimeTick(tick: Date, start: Date, end: Date) {
  const durationMs = end.getTime() - start.getTime();
  const options: Intl.DateTimeFormatOptions = durationMs > 24 * 60 * 60 * 1000
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat(undefined, options).format(tick);
}

function timePercent(value: Date, start: Date, end: Date) {
  const range = end.getTime() - start.getTime();
  if (range <= 0 || Number.isNaN(value.getTime())) return 0;
  const percent = ((value.getTime() - start.getTime()) / range) * 100;
  return Math.max(0, Math.min(100, percent));
}

function metadataLabel(metadata?: Record<string, unknown> | null) {
  if (!metadata) return '';
  const important = ['applicationName', 'domain', 'deviceId', 'activitySessionId'];
  for (const key of important) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return `${formatEnum(key)}: ${value}`;
    }
  }

  const [firstKey] = Object.keys(metadata);
  const value = firstKey ? metadata[firstKey] : undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${formatEnum(firstKey)}: ${String(value)}`;
  }

  return '';
}

function segmentMetadataLabel(segment: MonitoringTimelineSegment) {
  const topLevelMetadata: Record<string, unknown> = {
    applicationName: segment.applicationName,
    domain: segment.domain,
    activitySessionId: segment.activitySessionId,
    deviceId: segment.deviceId,
  };

  return metadataLabel(topLevelMetadata) || metadataLabel(segment.metadata);
}

function safeSeconds(value?: number | null) {
  return Number.isFinite(value) ? Number(value) : 0;
}
