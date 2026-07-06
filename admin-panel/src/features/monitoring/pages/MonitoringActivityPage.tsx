import { Alert, Button, MenuItem, TextField, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Activity, AppWindow, Clock3, Globe } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getEmployees } from '@/features/people/services/employees-api';
import { getMonitoringActivity } from '../services/monitoring-api';
import type { MonitoringActivity } from '../types/monitoring.types';
import { employeeEmail, employeeName, formatDateTime, formatDuration } from '../utils/monitoring-format';

export default function MonitoringActivityPage() {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('currentWeek'));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);

  const activityQuery = useQuery({
    queryKey: ['monitoring-activity', { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, dateRange }],
    queryFn: () => getMonitoringActivity({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    }),
  });
  const employeesQuery = useQuery({ queryKey: ['monitoring-activity-employees'], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const rows = useMemo(() => activityQuery.data?.data.data ?? [], [activityQuery.data?.data.data]);
  const totals = useMemo(() => rows.reduce((acc, row) => ({
    duration: acc.duration + row.durationSeconds,
    active: acc.active + row.activeSeconds,
    idle: acc.idle + row.idleSeconds,
    apps: acc.apps + row.applications.length,
    sites: acc.sites + row.websites.length,
  }), { duration: 0, active: 0, idle: 0, apps: 0, sites: 0 }), [rows]);

  const columns = useMemo<GridColDef<MonitoringActivity>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 240, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'startedAt', headerName: 'Session Start', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.startedAt) },
    { field: 'endedAt', headerName: 'Session End', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.endedAt) },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
    { field: 'activeSeconds', headerName: 'Active', minWidth: 120, valueGetter: (_, row) => formatDuration(row.activeSeconds) },
    { field: 'idleSeconds', headerName: 'Idle', minWidth: 120, valueGetter: (_, row) => formatDuration(row.idleSeconds) },
    { field: 'applications', headerName: 'Applications', minWidth: 210, valueGetter: (_, row) => row.applications.map((item) => item.application).slice(0, 2).join(', ') || 'Not available' },
    { field: 'websites', headerName: 'Websites', minWidth: 210, valueGetter: (_, row) => row.websites.map((item) => item.domain).slice(0, 2).join(', ') || 'Not available' },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader title="Activity Timeline" description="Review monitoring activity sessions, application usage, and website usage summaries." breadcrumbs={['Admin', 'Monitoring', 'Activity Timeline']} />
      <SummaryCardsContainer>
        <StatCard label="Session Time" value={formatDuration(totals.duration)} helper="Current loaded results" icon={Clock3} tone="#2563EB" />
        <StatCard label="Active Time" value={formatDuration(totals.active)} helper="Current loaded results" icon={Activity} tone="#16A34A" />
        <StatCard label="App Events" value={String(totals.apps)} helper="Usage entries loaded" icon={AppWindow} tone="#6B7280" />
        <StatCard label="Website Events" value={String(totals.sites)} helper="URL entries loaded" icon={Globe} tone="#6B7280" />
      </SummaryCardsContainer>
      <Alert severity="info">Sorting applies to the currently loaded page. Monitoring data is read-only in this phase.</Alert>
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void activityQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <SearchFilter placeholder="Search employee, app, website, or session" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <DateRangePicker value={dateRange} defaultPreset="currentWeek" onChange={(value) => { setDateRange(value); setPagination((current) => ({ ...current, page: 0 })); }} />
      </FilterToolbar>
      <DataTable title="Activity Sessions" rows={rows} columns={columns} toolbar={<></>} gridProps={{ loading: activityQuery.isFetching, rowHeight: 60, columnHeaderHeight: 48, paginationMode: 'server', rowCount: activityQuery.data?.data.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title="No activity sessions found" description="Try adjusting the employee, date range, or search filters." /> } }} />
      {activityQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void activityQuery.refetch()}>Retry</Button>}>Activity data could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}><Typography variant="body2">{toast}</Typography></Alert>}
    </PageLayout>
  );
}
