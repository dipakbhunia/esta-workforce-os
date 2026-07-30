import {
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Download, TimerOff, TrendingUp, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue, type DateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { useBranches } from '@/features/organization/hooks/useBranches';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { getEmployees } from '@/features/people/services/employees-api';
import { getMonitoringIdle } from '../services/monitoring-api';
import type { MonitoringIdleEmployeeRow, MonitoringIdleTimelineSegment } from '../types/monitoring.types';

const defaultRange = createDateRangeValue('currentWeek');
const idleThresholdOptions = [
  { label: 'Any idle %', value: '' },
  { label: '10% or more', value: '10' },
  { label: '25% or more', value: '25' },
  { label: '50% or more', value: '50' },
];

export default function MonitoringIdleAnalyticsPage() {
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [idlePercentageMin, setIdlePercentageMin] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);

  const idleQuery = useQuery({
    queryKey: ['monitoring-idle', pagination, search, employeeId, departmentId, branchId, idlePercentageMin, dateRange],
    queryFn: () => getMonitoringIdle({
      page: pagination.page + 1,
      pageSize: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      departmentId: departmentId || undefined,
      branchId: branchId || undefined,
      idlePercentageMin: idlePercentageMin ? Number(idlePercentageMin) : undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    }),
  });

  const employeesQuery = useQuery({
    queryKey: ['employees', { selector: true, monitoringIdle: true }],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();

  const data = idleQuery.data?.data;
  const rows = data?.employees ?? [];
  const timelineByEmployee = useMemo(() => groupTimelineByEmployee(data?.timeline ?? []), [data?.timeline]);
  const employeeNameById = useMemo(() => {
    return new Map(rows.map((row) => [row.employeeId, row.employee.name]));
  }, [rows]);

  const columns = useMemo<GridColDef<MonitoringIdleEmployeeRow>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 260,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => <AvatarCell name={row.employee.name || 'Unknown Employee'} email={row.employee.email} />,
    },
    {
      field: 'department',
      headerName: 'Department',
      minWidth: 150,
      valueGetter: (_, row) => row.department?.name ?? 'Not assigned',
    },
    {
      field: 'branch',
      headerName: 'Branch',
      minWidth: 150,
      valueGetter: (_, row) => row.branch?.name ?? 'Not assigned',
    },
    {
      field: 'activeSeconds',
      headerName: 'Active Time',
      minWidth: 140,
      valueGetter: (_, row) => formatDuration(row.activeSeconds),
    },
    {
      field: 'idleSeconds',
      headerName: 'Idle Time',
      minWidth: 140,
      valueGetter: (_, row) => formatDuration(row.idleSeconds),
    },
    {
      field: 'idlePercentage',
      headerName: 'Idle %',
      minWidth: 150,
      renderCell: ({ row }) => (
        <Stack sx={{ width: '100%' }} gap={0.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" fontWeight={700}>{formatPercent(row.idlePercentage)}</Typography>
            <StatusChip label={idleToneLabel(row.idlePercentage)} tone={idleTone(row.idlePercentage)} />
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, row.idlePercentage)}
            sx={{ height: 6, borderRadius: 999, bgcolor: '#F3F4F6' }}
            color={row.idlePercentage >= 30 ? 'warning' : 'primary'}
          />
        </Stack>
      ),
    },
    {
      field: 'longestIdleSeconds',
      headerName: 'Longest Idle',
      minWidth: 140,
      valueGetter: (_, row) => formatDuration(row.longestIdleSeconds),
    },
    {
      field: 'sessions',
      headerName: 'Sessions',
      minWidth: 110,
      valueGetter: (_, row) => row.sessions,
    },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDepartmentId('');
    setBranchId('');
    setIdlePercentageMin('');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function updateDateRange(value: DateRangeValue) {
    setDateRange(value);
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Idle Analytics"
        description="Analyze aggregate idle time, active time and idle patterns from persisted desktop activity sessions."
        breadcrumbs={['Admin', 'Monitoring', 'Idle Analytics']}
      />

      {data && (
        <SummaryCardsContainer minCardWidth={190}>
          <StatCard label="Total Active Time" value={formatDuration(data.summary.totalActiveSeconds)} helper="Selected range" icon={Activity} tone="#16A34A" />
          <StatCard label="Total Idle Time" value={formatDuration(data.summary.totalIdleSeconds)} helper="Persisted idle sessions" icon={TimerOff} tone="#F59E0B" />
          <StatCard label="Idle %" value={formatPercent(data.summary.idlePercentage)} helper="Idle / online time" icon={TrendingUp} tone="#2563EB" />
          <StatCard label="High Idle Employees" value={String(data.summary.employeesWithHighIdle)} helper="30% idle or higher" icon={Users} tone="#DC2626" />
          <StatCard label="Average Idle" value={formatDuration(data.summary.averageIdleSeconds)} helper="Per employee" icon={Clock3} tone="#7C3AED" />
        </SummaryCardsContainer>
      )}

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => idleQuery.refetch()} />
            <ExportButton onClick={() => undefined} />
          </>
        )}
      >
        <SearchFilter placeholder="Search employee or code" value={search} onChange={(value) => updateFilter(setSearch, value)} />
        <DateRangePicker value={dateRange} onChange={updateDateRange} defaultPreset="currentWeek" />
        <TextField select size="small" label="Employee" value={employeeId} onChange={(event) => updateFilter(setEmployeeId, event.target.value)}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>{employee.user?.firstName} {employee.user?.lastName} - {employee.employeeCode}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Department" value={departmentId} onChange={(event) => updateFilter(setDepartmentId, event.target.value)}>
          <MenuItem value="">All departments</MenuItem>
          {(departmentsQuery.data?.data.data ?? []).map((department) => (
            <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Branch" value={branchId} onChange={(event) => updateFilter(setBranchId, event.target.value)}>
          <MenuItem value="">All branches</MenuItem>
          {(branchesQuery.data?.data.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Idle %" value={idlePercentageMin} onChange={(event) => updateFilter(setIdlePercentageMin, event.target.value)}>
          {idleThresholdOptions.map((option) => (
            <MenuItem key={option.value || 'any'} value={option.value}>{option.label}</MenuItem>
          ))}
        </TextField>
      </FilterToolbar>

      {idleQuery.isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : idleQuery.isError ? (
        <SectionCard title="Idle analytics unavailable" description="The idle analytics request failed.">
          <Stack alignItems="flex-start" gap={1.5}>
            <Typography color="text.secondary">Check that the backend is running, then retry the request.</Typography>
            <Button variant="outlined" onClick={() => idleQuery.refetch()}>Retry</Button>
          </Stack>
        </SectionCard>
      ) : rows.length === 0 ? (
        <SectionCard title="Idle analytics">
          <EmptyState title="No idle analytics found" description="No activity sessions were recorded for the selected filters." />
        </SectionCard>
      ) : (
        <>
          <DataTable
            title="Employee idle breakdown"
            rows={rows}
            columns={columns}
            toolbar={<Typography variant="body2" color="text.secondary">Server-side aggregation by employee</Typography>}
            gridProps={{
              getRowId: (row) => row.employeeId,
              paginationMode: 'server',
              rowCount: data?.pagination.total ?? 0,
              paginationModel: pagination,
              onPaginationModelChange: setPagination,
              pageSizeOptions: [10, 20, 50, 100],
              getRowHeight: () => 64,
              disableColumnFilter: true,
            }}
          />

          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems="stretch">
            <SectionCard title="Idle timeline" description="Per-employee active and idle transitions from persisted sessions.">
              <Stack gap={1.5}>
                {rows.slice(0, 8).map((employee) => (
                  <EmployeeTimelineRow
                    key={employee.employeeId}
                    employee={employee}
                    segments={timelineByEmployee.get(employee.employeeId) ?? []}
                  />
                ))}
              </Stack>
            </SectionCard>

            <SectionCard title="Top 10 longest idle periods" description="Longest persisted idle sessions in the selected range.">
              <Stack gap={1.25}>
                {(data?.longestIdlePeriods ?? []).length === 0 ? (
                  <EmptyState title="No idle periods" description="No idle sessions were recorded for these filters." />
                ) : data?.longestIdlePeriods.map((period, index) => (
                  <Box key={period.id} sx={{ p: 1.25, border: '1px solid #E5E7EB', borderRadius: 2, bgcolor: '#FFFFFF' }}>
                    <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={800} noWrap>{index + 1}. {period.employee.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {period.employeeCode} - {formatTime(period.start)} to {formatTime(period.end)}
                        </Typography>
                      </Box>
                      <StatusChip label={formatDuration(period.durationSeconds)} tone="warning" />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          </Stack>
        </>
      )}
    </PageLayout>
  );
}

function EmployeeTimelineRow({ employee, segments }: { employee: MonitoringIdleEmployeeRow; segments: MonitoringIdleTimelineSegment[] }) {
  return (
    <Box sx={{ border: '1px solid #E5E7EB', borderRadius: 2.5, p: 1.5, bgcolor: '#FFFFFF' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5}>
        <Box sx={{ width: { xs: '100%', md: 220 }, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={800} noWrap>{employee.employee.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{employee.employeeCode}</Typography>
        </Box>
        <Stack direction="row" gap={0.5} sx={{ flex: 1, minWidth: 0, overflowX: 'auto', pb: 0.5 }}>
          {segments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No timeline sessions for this employee.</Typography>
          ) : segments.map((segment) => (
            <Tooltip key={`${segment.activitySessionId}-${segment.start}-${segment.type}`} title={`${formatTime(segment.start)} to ${formatTime(segment.end)} - ${formatDuration(segment.durationSeconds)}`}>
              <Box
                tabIndex={0}
                aria-label={`${employee.employee.name} ${segment.type.toLowerCase()} segment from ${formatTime(segment.start)} to ${formatTime(segment.end)}`}
                sx={{
                  minWidth: Math.max(52, Math.min(220, segment.durationSeconds / 6)),
                  height: 34,
                  borderRadius: 999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 1.25,
                  bgcolor: segment.type === 'IDLE' ? '#FEF3C7' : '#DCFCE7',
                  color: segment.type === 'IDLE' ? '#92400E' : '#166534',
                  border: `1px solid ${segment.type === 'IDLE' ? '#FCD34D' : '#86EFAC'}`,
                  outline: 'none',
                  '&:focus-visible': { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.22)' },
                }}
              >
                <Typography variant="caption" fontWeight={800} noWrap>{segment.type}</Typography>
              </Box>
            </Tooltip>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

function groupTimelineByEmployee(segments: MonitoringIdleTimelineSegment[]) {
  const map = new Map<string, MonitoringIdleTimelineSegment[]>();
  for (const segment of segments) {
    const current = map.get(segment.employeeId) ?? [];
    current.push(segment);
    map.set(segment.employeeId, current);
  }
  for (const [employeeId, employeeSegments] of map.entries()) {
    map.set(employeeId, [...employeeSegments].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
  }
  return map;
}

function formatDuration(seconds: number | null | undefined) {
  const safeSeconds = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatPercent(value: number | null | undefined) {
  return `${Math.round((value ?? 0) * 10) / 10}%`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function idleTone(value: number) {
  if (value >= 50) return 'danger' as const;
  if (value >= 30) return 'warning' as const;
  if (value > 0) return 'info' as const;
  return 'neutral' as const;
}

function idleToneLabel(value: number) {
  if (value >= 50) return 'High';
  if (value >= 30) return 'Watch';
  if (value > 0) return 'Normal';
  return 'None';
}
