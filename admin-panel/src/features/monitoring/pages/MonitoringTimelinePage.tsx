import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Fade,
  MenuItem,
  Pagination,
  Popover,
  Stack,
  TextField,
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
import type { FocusEvent, MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { DateRangePicker, createDateRangeValue, type DateRangeValue } from '@/components/date-range-picker';
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
const TIMELINE_LAYOUT = {
  employeeColumnWidth: 264,
  timelineStartX: 32,
  timelineWidth: 1680,
};
const TIMELINE_CANVAS_WIDTH = TIMELINE_LAYOUT.timelineStartX + TIMELINE_LAYOUT.timelineWidth + TIMELINE_LAYOUT.timelineStartX;
const TIMELINE_TOTAL_WIDTH = TIMELINE_LAYOUT.employeeColumnWidth + TIMELINE_CANVAS_WIDTH;

type TimelineLayout = typeof TIMELINE_LAYOUT;

const segmentStyles: Record<MonitoringTimelineSegmentType, { color: string; bg: string; tone: StatusTone }> = {
  ACTIVE: { color: '#059669', bg: '#D1FAE5', tone: 'success' },
  IDLE: { color: '#D97706', bg: '#FEF3C7', tone: 'warning' },
  BREAK: { color: '#2563EB', bg: '#DBEAFE', tone: 'info' },
  OFFLINE: { color: '#BE5961', bg: '#FCE7EA', tone: 'danger' },
  NO_ACTIVITY: { color: '#6B7280', bg: '#F3F4F6', tone: 'neutral' },
};

const markerStyles: Record<MonitoringTimelineMarkerType, { color: string; bg: string; icon: typeof LogIn }> = {
  PUNCH_IN: { color: '#16A34A', bg: '#DCFCE7', icon: LogIn },
  PUNCH_OUT: { color: '#DC2626', bg: '#FEE2E2', icon: LogOut },
  BREAK_START: { color: '#F59E0B', bg: '#FEF3C7', icon: Coffee },
  BREAK_END: { color: '#2563EB', bg: '#DBEAFE', icon: PauseCircle },
  SCREENSHOT: { color: '#7C3AED', bg: '#EDE9FE', icon: Camera },
};

const zoomOptions = ['100%', '75%', '50%', '25%'];

export default function MonitoringTimelinePage() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('today'));
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'shift'>('day');
  const [zoom, setZoom] = useState('100%');

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
  const visibleTicks = useMemo(() => getVisibleTicks(ticks, range.start, range.end, TIMELINE_LAYOUT), [range.end, range.start, ticks]);
  const minorTicks = useMemo(() => buildMinorTicks(range.start, range.end), [range.end, range.start]);

  const totals = useMemo(() => employees.reduce((acc, employee) => ({
    activeSeconds: acc.activeSeconds + safeSeconds(employee.summary.activeSeconds),
    idleSeconds: acc.idleSeconds + safeSeconds(employee.summary.idleSeconds),
    breakSeconds: acc.breakSeconds + safeSeconds(employee.summary.breakSeconds),
    offlineSeconds: acc.offlineSeconds + safeSeconds(employee.summary.offlineSeconds),
    workedSeconds: acc.workedSeconds + safeSeconds(employee.summary.workedSeconds),
    activeEmployees: acc.activeEmployees + (safeSeconds(employee.summary.activeSeconds) > 0 ? 1 : 0),
    idleEmployees: acc.idleEmployees + (safeSeconds(employee.summary.idleSeconds) > 0 ? 1 : 0),
    breakEmployees: acc.breakEmployees + (safeSeconds(employee.summary.breakSeconds) > 0 ? 1 : 0),
    offlineEmployees: acc.offlineEmployees + (safeSeconds(employee.summary.offlineSeconds) > 0 ? 1 : 0),
  }), {
    activeSeconds: 0,
    idleSeconds: 0,
    breakSeconds: 0,
    offlineSeconds: 0,
    workedSeconds: 0,
    activeEmployees: 0,
    idleEmployees: 0,
    breakEmployees: 0,
    offlineEmployees: 0,
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
        <StatCard label="Employees" value={String(response?.meta.total ?? employees.length)} helper="Matching current filters" icon={Users} tone="#2563EB" />
        <StatCard label="Present" value={String(employees.length)} helper="Loaded timeline rows" icon={Users} tone="#16A34A" />
        <StatCard label="Online" value={String(totals.activeEmployees)} helper="With active time" icon={Activity} tone="#059669" />
        <StatCard label="Active" value={formatDuration(totals.activeSeconds)} helper={`${totals.activeEmployees} employees`} icon={Activity} tone="#16A34A" />
        <StatCard label="Idle" value={formatDuration(totals.idleSeconds)} helper={`${totals.idleEmployees} employees`} icon={Clock3} tone="#F59E0B" />
        <StatCard label="Break" value={formatDuration(totals.breakSeconds)} helper={`${totals.breakEmployees} employees`} icon={Coffee} tone="#2563EB" />
        <StatCard label="Offline" value={formatDuration(totals.offlineSeconds)} helper={`${totals.offlineEmployees} employees`} icon={WifiOff} tone="#BE5961" />
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
        <TextField select label="Department" size="small" value="" disabled sx={{ minWidth: { xs: '100%', md: 170 } }}>
          <MenuItem value="">All departments</MenuItem>
        </TextField>
        <TextField select label="Employee" size="small" value="" disabled sx={{ minWidth: { xs: '100%', md: 170 } }}>
          <MenuItem value="">All employees</MenuItem>
        </TextField>
        <TextField select label="Branch" size="small" value="" disabled sx={{ minWidth: { xs: '100%', md: 170 } }}>
          <MenuItem value="">All branches</MenuItem>
        </TextField>
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
        <SectionCard title="Employee Timeline" description={formatTimelineRangeTitle(dateRange, response?.date, range.start, range.end)}>
          <TimelineControls
            viewMode={viewMode}
            zoom={zoom}
            onViewModeChange={setViewMode}
            onZoomChange={setZoom}
          />
          <Box
            sx={{
              mt: 2,
              maxHeight: { xs: '65vh', lg: '70vh' },
              overflow: 'auto',
              scrollBehavior: 'smooth',
              border: '1px solid #E5E7EB',
              borderRadius: 3,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
              pb: 0.5,
            }}
          >
            <Box sx={{ minWidth: TIMELINE_TOTAL_WIDTH }}>
              <TimelineHeader ticks={visibleTicks} rangeStart={range.start} rangeEnd={range.end} />
              <Stack divider={<Divider flexItem sx={{ borderColor: '#EEF2F7' }} />} sx={{ borderTop: 0, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                {employees.map((employee, index) => (
                  <EmployeeTimelineRow
                    key={employee.employeeId}
                    employee={employee}
                    index={index}
                    rangeStart={range.start}
                    rangeEnd={range.end}
                    ticks={visibleTicks}
                    minorTicks={minorTicks}
                  />
                ))}
              </Stack>
            </Box>
          </Box>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            gap={2}
            sx={{
              position: 'sticky',
              bottom: 0,
              zIndex: 3,
              mt: 1.5,
              px: 1.25,
              py: 1,
              bgcolor: 'rgba(255, 255, 255, 0.92)',
              border: '1px solid #E5E7EB',
              borderRadius: 2.5,
              backdropFilter: 'blur(10px)',
            }}
          >
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
        gridTemplateColumns: `${TIMELINE_LAYOUT.employeeColumnWidth}px 1fr`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: '#F9FAFB',
        borderBottom: '1px solid #E5E7EB',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderRight: '1px solid #E5E7EB',
          position: 'sticky',
          left: 0,
          zIndex: 12,
        bgcolor: '#F9FAFB',
      }}
    >
        <Typography variant="body2" fontWeight={800}>Employee</Typography>
        <Typography variant="caption" color="text.secondary">Activity and daily totals</Typography>
      </Box>
      <Box sx={{ display: 'flex', height: 40, width: TIMELINE_CANVAS_WIDTH }}>
        <Box aria-hidden="true" sx={{ flex: `0 0 ${TIMELINE_LAYOUT.timelineStartX}px` }} />
        {buildHeaderCells(ticks, rangeStart, rangeEnd, TIMELINE_LAYOUT).map((cell) => (
          <Box
            key={`${cell.tick.toISOString()}-${cell.index}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: cell.align,
              flex: `0 0 ${cell.width}px`,
              minWidth: 0,
              borderLeft: '1px solid #E5E7EB',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontWeight: 700,
                fontSize: 11,
                whiteSpace: 'nowrap',
                overflow: 'visible',
                textOverflow: 'unset',
              }}
            >
              {formatTimeTick(cell.tick, rangeStart, rangeEnd)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function TimelineControls({
  viewMode,
  zoom,
  onViewModeChange,
  onZoomChange,
}: {
  viewMode: 'day' | 'shift';
  zoom: string;
  onViewModeChange: (value: 'day' | 'shift') => void;
  onZoomChange: (value: string) => void;
}) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', md: 'center' }}
      gap={1.5}
      sx={{
        p: 1,
        border: '1px solid #E5E7EB',
        borderRadius: 2.5,
        bgcolor: '#F8FAFC',
      }}
    >
      <Stack direction="row" gap={0.75} flexWrap="wrap">
        <Button size="small" variant={viewMode === 'day' ? 'contained' : 'outlined'} onClick={() => onViewModeChange('day')}>
          Day View
        </Button>
        <Tooltip title="Future-ready placeholder. Shift timeline calculations are not enabled yet.">
          <span>
            <Button size="small" variant={viewMode === 'shift' ? 'contained' : 'outlined'} disabled onClick={() => onViewModeChange('shift')}>
              Shift View
            </Button>
          </span>
        </Tooltip>
      </Stack>
      <TextField
        select
        label="Zoom"
        size="small"
        value={zoom}
        onChange={(event) => onZoomChange(event.target.value)}
        helperText="UI placeholder"
        sx={{ minWidth: { xs: '100%', md: 150 }, '& .MuiFormHelperText-root': { mx: 0 } }}
      >
        {zoomOptions.map((option) => (
          <MenuItem key={option} value={option}>{option}</MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

function EmployeePanelCard({ employee, name, email }: { employee: MonitoringTimelineEmployee; name: string; email?: string }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const status = getEmployeeTimelineStatus(employee);
  const statusStyle = segmentStyles[status];
  const open = Boolean(anchorEl);

  function openProfile(event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  return (
    <>
      <Box
        tabIndex={0}
        role="button"
        aria-label={`Open profile card for ${name}`}
        onMouseEnter={openProfile}
        onFocus={openProfile}
        sx={{
          borderRadius: 2,
          outline: 'none',
          '&:focus-visible': {
            boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.22)',
          },
        }}
      >
        <AvatarCell name={name} email={email} />
      </Box>
      <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.45 }}>
        <Chip size="small" label={employee.employeeCode || 'No code'} sx={{ height: 18, fontSize: 10.5, '& .MuiChip-label': { px: 0.75 } }} />
        <Chip size="small" label={employee.device?.hostname || employee.device?.deviceIdentifier || 'No device'} sx={{ height: 18, fontSize: 10.5, '& .MuiChip-label': { px: 0.75 } }} />
        <StatusChip label={formatEnum(status)} tone={statusStyle.tone} />
      </Stack>
      <Stack direction="row" gap={0.85} flexWrap="wrap" sx={{ mt: 0.45 }}>
        <MiniStat label="Active" value={formatDuration(employee.summary.activeSeconds)} />
        <MiniStat label="Idle" value={formatDuration(employee.summary.idleSeconds)} />
        <MiniStat label="Break" value={formatDuration(employee.summary.breakSeconds)} />
        <MiniStat label="Offline" value={formatDuration(employee.summary.offlineSeconds)} />
      </Stack>
      <EmployeeProfilePopover
        employee={employee}
        name={name}
        email={email}
        status={status}
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
      />
    </>
  );
}

function EmployeeProfilePopover({
  employee,
  name,
  email,
  status,
  anchorEl,
  open,
  onClose,
}: {
  employee: MonitoringTimelineEmployee;
  name: string;
  email?: string;
  status: MonitoringTimelineSegmentType;
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const statusStyle = segmentStyles[status];

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      TransitionComponent={Fade}
      disableRestoreFocus
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          onMouseLeave: onClose,
          sx: {
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            borderRadius: 3,
            boxShadow: '0 20px 55px rgba(15, 23, 42, 0.18)',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
          },
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Avatar sx={{ width: 52, height: 52, bgcolor: '#E0ECFF', color: '#1D4ED8', fontWeight: 850 }}>
            {initials}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" noWrap>{name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>{email || 'Email not available'}</Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.75 }}>
              <Chip size="small" label={employee.employeeCode || 'No code'} />
              <StatusChip label={formatEnum(status)} tone={statusStyle.tone} />
            </Stack>
          </Box>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          <ProfileField label="Department" value="Not available" />
          <ProfileField label="Designation" value="Not available" />
          <ProfileField label="Manager" value="Not available" />
          <ProfileField label="Branch" value="Not available" />
          <ProfileField label="Device" value={employee.device?.hostname || employee.device?.deviceIdentifier || 'Not assigned'} />
          <ProfileField label="Last heartbeat" value={formatDateTime(employee.device?.lastHeartbeatAt)} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, mt: 1.5 }}>
          <ProfileMetric label="Active" value={formatDuration(employee.summary.activeSeconds)} color="#059669" />
          <ProfileMetric label="Idle" value={formatDuration(employee.summary.idleSeconds)} color="#D97706" />
          <ProfileMetric label="Break" value={formatDuration(employee.summary.breakSeconds)} color="#2563EB" />
          <ProfileMetric label="Offline" value={formatDuration(employee.summary.offlineSeconds)} color="#BE5961" />
        </Box>

        <Button component={RouterLink} to={`/people/employees/${employee.employeeId}`} variant="contained" fullWidth sx={{ mt: 1.75 }} onClick={onClose}>
          View Employee
        </Button>
      </Box>
    </Popover>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2" fontWeight={750} noWrap>{value}</Typography>
    </Box>
  );
}

function ProfileMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box sx={{ p: 0.85, borderRadius: 2, bgcolor: `${color}12`, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="caption" fontWeight={850} sx={{ color }} noWrap>{value}</Typography>
    </Box>
  );
}

function EmployeeTimelineRow({
  employee,
  index,
  rangeStart,
  rangeEnd,
  ticks,
  minorTicks,
}: {
  employee: MonitoringTimelineEmployee;
  index: number;
  rangeStart: Date;
  rangeEnd: Date;
  ticks: Date[];
  minorTicks: Date[];
}) {
  const name = employee.user?.name || employee.user?.email || 'Employee';
  const email = employee.user?.email || undefined;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `${TIMELINE_LAYOUT.employeeColumnWidth}px 1fr`, minHeight: 76, bgcolor: index % 2 === 0 ? '#FFFFFF' : '#FCFCFD' }}>
      <Box
        sx={{
          px: 1,
          py: 0.85,
          borderRight: '1px solid #E5E7EB',
          minWidth: 0,
          position: 'sticky',
          left: 0,
          zIndex: 4,
          bgcolor: index % 2 === 0 ? '#FFFFFF' : '#FCFCFD',
        }}
      >
        <EmployeePanelCard employee={employee} name={name} email={email} />
      </Box>

      <Box sx={{ position: 'relative', minHeight: 76, py: 1.15, width: TIMELINE_CANVAS_WIDTH }}>
        {minorTicks.map((tick) => {
          const left = timelineX(timePercent(tick, rangeStart, rangeEnd), TIMELINE_LAYOUT);
          return (
            <Box
              key={`minor-${tick.toISOString()}`}
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left,
                top: 0,
                bottom: 0,
                borderLeft: '1px solid #F8FAFC',
              }}
            />
          );
        })}
        {ticks.map((tick) => {
          const left = timelineX(timePercent(tick, rangeStart, rangeEnd), TIMELINE_LAYOUT);
          return (
            <Box
              key={tick.toISOString()}
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left,
                top: 0,
                bottom: 0,
                borderLeft: '1px solid #F1F5F9',
              }}
            />
          );
        })}
        <Box sx={{ position: 'absolute', left: TIMELINE_LAYOUT.timelineStartX, width: TIMELINE_LAYOUT.timelineWidth, top: 44, height: 12, borderRadius: 999, bgcolor: '#F3F4F6' }} />
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
            markerOffset={getMarkerOffset(employee.markers, index, rangeStart, rangeEnd)}
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
        role="img"
        tabIndex={0}
        aria-label={`${formatEnum(segment.type)} segment from ${formatDateTime(segment.start)} to ${formatDateTime(segment.end)}`}
        sx={{
          position: 'absolute',
          left: timelineX(left, TIMELINE_LAYOUT),
          top: 44,
          width: Math.max(8, (width / 100 * TIMELINE_LAYOUT.timelineWidth) - 2),
          height: 12,
          minWidth: 8,
          borderRadius: 999,
          bgcolor: style.bg,
          border: `1px solid ${style.color}33`,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
          transition: 'box-shadow 160ms ease, transform 160ms ease, filter 160ms ease',
          transformOrigin: 'center',
          '&:hover, &:focus-visible': {
            boxShadow: '0 7px 18px rgba(15, 23, 42, 0.14)',
            filter: 'saturate(1.04)',
            transform: 'scaleY(1.2)',
          },
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${Math.max(8, Math.min(100, segment.intensity ?? 100))}%`,
            bgcolor: style.color,
            opacity: segment.type === 'NO_ACTIVITY' ? 0.35 : 0.9,
          }}
        />
      </Box>
    </Tooltip>
  );
}

function TimelineMarkerIcon({
  marker,
  markerOffset,
  rangeStart,
  rangeEnd,
}: {
  marker: MonitoringTimelineMarker;
  markerOffset: { x: number; y: number };
  rangeStart: Date;
  rangeEnd: Date;
}) {
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
        role="img"
        tabIndex={0}
        aria-label={`${marker.title || formatEnum(marker.type)} at ${formatDateTime(marker.time)}`}
        sx={{
          position: 'absolute',
          left: timelineX(left, TIMELINE_LAYOUT, markerOffset.x),
          top: 13 + markerOffset.y,
          transform: 'translateX(-50%)',
          width: 20,
          height: 20,
          borderRadius: marker.type === 'SCREENSHOT' ? '7px' : '50%',
          display: 'grid',
          placeItems: 'center',
          color: style.color,
          bgcolor: style.bg,
          border: '1px solid #FFFFFF',
          boxShadow: '0 4px 10px rgba(15, 23, 42, 0.12)',
          zIndex: 2,
          '&::after': marker.type === 'SCREENSHOT' ? undefined : {
            content: '""',
            position: 'absolute',
            bottom: -4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '3.5px solid transparent',
            borderRight: '3.5px solid transparent',
            borderTop: `4px solid ${style.color}`,
          },
          transition: 'box-shadow 160ms ease, transform 160ms ease',
          '&:hover, &:focus-visible': {
            boxShadow: '0 8px 18px rgba(15, 23, 42, 0.18)',
            transform: 'translateX(-50%) scale(1.08)',
          },
        }}
      >
        <Icon size={12} strokeWidth={2.2} />
      </Box>
    </Tooltip>
  );
}

function TimelineLegend() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Stack
        direction="row"
        flexWrap="wrap"
        gap={0.75}
        alignItems="center"
        sx={{
          px: 1.25,
          py: 0.75,
          border: '1px solid #E5E7EB',
          borderRadius: 2.5,
          bgcolor: '#FFFFFF',
        }}
      >
        {Object.entries(segmentStyles).map(([type, style]) => (
          <Tooltip key={type} title={`${formatEnum(type)} timeline segment`}>
            <Box component="span">
              <LegendDot label={formatEnum(type)} color={style.color} />
            </Box>
          </Tooltip>
        ))}
        <LegendMarker label="Screenshot" color="#7C3AED" icon={<Camera size={15} />} />
        <LegendMarker label="Punch" color="#16A34A" icon={<LogIn size={15} />} />
        <LegendMarker label="Break Marker" color="#F59E0B" icon={<Coffee size={15} />} />
      </Stack>
    </Box>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <Chip
      size="small"
      label={label}
      icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, ml: 0.75 }} />}
      sx={{ height: 22, fontSize: 11, bgcolor: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB' }}
    />
  );
}

function LegendMarker({ label, color, icon }: { label: string; color: string; icon: React.ReactNode }) {
  return (
    <Chip
      size="small"
      icon={<Box component="span" sx={{ color, display: 'inline-flex', ml: 0.5 }}>{icon}</Box>}
      label={label}
      sx={{ height: 22, fontSize: 11, bgcolor: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB' }}
    />
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, lineHeight: 1.1 }}>{label}</Typography>
      <Typography variant="caption" fontWeight={800} sx={{ fontSize: 10.5, lineHeight: 1.1 }}>{value}</Typography>
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

function buildMinorTicks(start: Date, end: Date) {
  const halfHourMs = 30 * 60 * 1000;
  const ticks: Date[] = [];
  const firstTick = new Date(start);
  firstTick.setSeconds(0, 0);
  const minutes = firstTick.getMinutes();
  firstTick.setMinutes(minutes < 30 ? 30 : 60);

  for (let time = firstTick.getTime(); time < end.getTime(); time += halfHourMs) {
    ticks.push(new Date(time));
  }

  return ticks;
}

function getVisibleTicks(ticks: Date[], start: Date, end: Date, layout: TimelineLayout) {
  const minGapPx = 72;
  const selected: Date[] = [];

  for (const tick of ticks) {
    const leftPx = timelineX(timePercent(tick, start, end), layout);
    const previous = selected[selected.length - 1];
    const previousPx = previous ? timelineX(timePercent(previous, start, end), layout) : Number.NEGATIVE_INFINITY;

    if (!previous || leftPx - previousPx >= minGapPx || tick.getTime() === end.getTime()) {
      selected.push(tick);
    }
  }

  return selected;
}

function buildHeaderCells(ticks: Date[], start: Date, end: Date, layout: TimelineLayout) {
  const positions = ticks.map((tick) => timelineX(timePercent(tick, start, end), layout));
  const canvasEndX = layout.timelineStartX + layout.timelineWidth + layout.timelineStartX;

  return ticks.map((tick, index) => {
    const current = positions[index] ?? 0;
    const next = positions[index + 1] ?? canvasEndX;
    const width = Math.max(2, next - current);

    return {
      tick,
      index,
      width,
      align: index === 0 ? 'flex-start' : index === ticks.length - 1 ? 'flex-end' : 'center',
    };
  });
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

function timelineX(percent: number, layout: TimelineLayout, offset = 0) {
  return layout.timelineStartX + ((percent / 100) * layout.timelineWidth) + offset;
}

function getMarkerOffset(markers: MonitoringTimelineMarker[], index: number, start: Date, end: Date) {
  const marker = markers[index];
  const currentPx = timelineX(timePercent(new Date(marker.time), start, end), TIMELINE_LAYOUT);
  const nearbyBefore = markers.slice(0, index).filter((candidate) => {
    const candidatePx = timelineX(timePercent(new Date(candidate.time), start, end), TIMELINE_LAYOUT);
    return Math.abs(candidatePx - currentPx) < 24;
  }).length;
  const slot = nearbyBefore % 4;
  const offsets = [
    { x: 0, y: 0 },
    { x: 16, y: -7 },
    { x: -16, y: -7 },
    { x: 8, y: -14 },
  ];

  return offsets[slot];
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

function getEmployeeTimelineStatus(employee: MonitoringTimelineEmployee): MonitoringTimelineSegmentType {
  if (employee.segments.length === 0) return 'NO_ACTIVITY';
  const latest = employee.segments.reduce((currentLatest, segment) => {
    const currentEnd = new Date(currentLatest.end).getTime();
    const segmentEnd = new Date(segment.end).getTime();
    return segmentEnd > currentEnd ? segment : currentLatest;
  }, employee.segments[0]);

  return latest.type;
}

function formatTimelineRangeTitle(value: DateRangeValue, responseDate: string | undefined, start: Date, end: Date) {
  if (value.preset === 'today') return 'Today';
  if (value.preset === 'yesterday') return 'Yesterday';

  const startLabel = formatShortDate(value.dateFrom || responseDate || start.toISOString());
  const endLabel = formatShortDate(value.dateTo || responseDate || end.toISOString());

  if (startLabel === endLabel) return startLabel;
  return `${startLabel} → ${endLabel}`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
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
