import { Alert, Button, MenuItem, Tab, Tabs, TextField, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, Globe } from 'lucide-react';
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
import { getMonitoringApplications, getMonitoringWebsites } from '../services/monitoring-api';
import type { MonitoringApplicationUsage, MonitoringWebsiteUsage } from '../types/monitoring.types';
import { employeeEmail, employeeName, formatDateTime, formatDuration } from '../utils/monitoring-format';

type UsageTab = 'applications' | 'websites';

export default function MonitoringAppsUrlsPage() {
  const [tab, setTab] = useState<UsageTab>('applications');
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('currentWeek'));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);
  const params = { page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, employeeId: employeeId || undefined, dateFrom: dateRange.dateFrom || undefined, dateTo: dateRange.dateTo || undefined };

  const appsQuery = useQuery({ queryKey: ['monitoring-apps', params], queryFn: () => getMonitoringApplications(params), enabled: tab === 'applications' });
  const websitesQuery = useQuery({ queryKey: ['monitoring-websites', params], queryFn: () => getMonitoringWebsites(params), enabled: tab === 'websites' });
  const employeesQuery = useQuery({ queryKey: ['monitoring-apps-urls-employees'], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const appRows = useMemo(() => appsQuery.data?.data.data ?? [], [appsQuery.data?.data.data]);
  const websiteRows = useMemo(() => websitesQuery.data?.data.data ?? [], [websitesQuery.data?.data.data]);
  const currentQuery = tab === 'applications' ? appsQuery : websitesQuery;

  const applicationColumns = useMemo<GridColDef<MonitoringApplicationUsage>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 240, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'application', headerName: 'App Name', minWidth: 210, flex: 1, valueGetter: (_, row) => row.application || 'Not available' },
    { field: 'windowTitle', headerName: 'Window Title', minWidth: 240, flex: 1, valueGetter: (_, row) => row.windowTitle || 'Not available' },
    { field: 'startedAt', headerName: 'Start', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.startedAt) },
    { field: 'endedAt', headerName: 'End', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.endedAt) },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
  ], []);

  const websiteColumns = useMemo<GridColDef<MonitoringWebsiteUsage>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 240, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'domain', headerName: 'Domain', minWidth: 190, valueGetter: (_, row) => row.domain || 'Not available' },
    { field: 'url', headerName: 'URL', minWidth: 300, flex: 1, valueGetter: (_, row) => row.url || 'Not available' },
    { field: 'pageTitle', headerName: 'Page Title', minWidth: 220, valueGetter: (_, row) => row.pageTitle || 'Not available' },
    { field: 'startedAt', headerName: 'Start', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.startedAt) },
    { field: 'endedAt', headerName: 'End', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.endedAt) },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader title="Apps & URLs" description="Review application and website usage captured by the monitoring foundation." breadcrumbs={['Admin', 'Monitoring', 'Apps & URLs']} />
      <SummaryCardsContainer>
        <StatCard label="Applications" value={String(appsQuery.data?.data.meta.total ?? appRows.length)} helper="Application usage records" icon={AppWindow} tone="#2563EB" />
        <StatCard label="Websites" value={String(websitesQuery.data?.data.meta.total ?? websiteRows.length)} helper="Website usage records" icon={Globe} tone="#16A34A" />
      </SummaryCardsContainer>
      <Tabs value={tab} onChange={(_, value: UsageTab) => { setTab(value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ borderBottom: '1px solid #E5E7EB' }}>
        <Tab value="applications" label="Applications" />
        <Tab value="websites" label="Websites" />
      </Tabs>
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void currentQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <SearchFilter placeholder={tab === 'applications' ? 'Search employee, app, or window' : 'Search employee, domain, URL, or title'} value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <DateRangePicker value={dateRange} defaultPreset="currentWeek" onChange={(value) => { setDateRange(value); setPagination((current) => ({ ...current, page: 0 })); }} />
      </FilterToolbar>
      {tab === 'applications' ? (
        <DataTable title="Application Usage" rows={appRows} columns={applicationColumns} toolbar={<></>} gridProps={{ loading: appsQuery.isFetching, rowHeight: 60, columnHeaderHeight: 48, paginationMode: 'server', rowCount: appsQuery.data?.data.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title="No application usage found" description="Try adjusting the employee, date range, or search filters." /> } }} />
      ) : (
        <DataTable title="Website Usage" rows={websiteRows} columns={websiteColumns} toolbar={<></>} gridProps={{ loading: websitesQuery.isFetching, rowHeight: 60, columnHeaderHeight: 48, paginationMode: 'server', rowCount: websitesQuery.data?.data.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title="No website usage found" description="Try adjusting the employee, date range, or search filters." /> } }} />
      )}
      {currentQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void currentQuery.refetch()}>Retry</Button>}>Usage data could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}><Typography variant="body2">{toast}</Typography></Alert>}
    </PageLayout>
  );
}
