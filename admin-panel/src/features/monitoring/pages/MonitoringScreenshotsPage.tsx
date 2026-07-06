import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { FileImage, ImageOff } from 'lucide-react';
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
import { getMonitoringScreenshots } from '../services/monitoring-api';
import type { MonitoringScreenshot } from '../types/monitoring.types';
import { employeeEmail, employeeName, formatBytes, formatDateTime } from '../utils/monitoring-format';

export default function MonitoringScreenshotsPage() {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('currentWeek'));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);

  const screenshotsQuery = useQuery({
    queryKey: ['monitoring-screenshots', { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, dateRange }],
    queryFn: () => getMonitoringScreenshots({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    }),
  });
  const employeesQuery = useQuery({ queryKey: ['monitoring-screenshot-employees'], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const rows = useMemo(() => screenshotsQuery.data?.data.data ?? [], [screenshotsQuery.data?.data.data]);
  const totalBytes = useMemo(() => rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0), [rows]);

  const columns = useMemo<GridColDef<MonitoringScreenshot>[]>(() => [
    { field: 'preview', headerName: 'Thumbnail', minWidth: 120, sortable: false, renderCell: () => (
      <Box sx={{ width: 56, height: 36, borderRadius: 1.5, bgcolor: '#F3F4F6', color: 'text.secondary', display: 'grid', placeItems: 'center' }}>
        <ImageOff size={18} />
      </Box>
    ) },
    { field: 'employee', headerName: 'Employee', minWidth: 240, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'capturedAt', headerName: 'Captured', minWidth: 185, valueGetter: (_, row) => formatDateTime(row.capturedAt) },
    { field: 'storageKey', headerName: 'Object Key', minWidth: 300, flex: 1, valueGetter: (_, row) => row.storageKey || 'Not available' },
    { field: 'mimeType', headerName: 'MIME Type', minWidth: 130, valueGetter: (_, row) => row.mimeType || 'Not available' },
    { field: 'sizeBytes', headerName: 'Size', minWidth: 120, valueGetter: (_, row) => formatBytes(row.sizeBytes) },
    { field: 'dimensions', headerName: 'Dimensions', minWidth: 135, valueGetter: (_, row) => row.width && row.height ? `${row.width} x ${row.height}` : 'Not available' },
    { field: 'checksum', headerName: 'Checksum', minWidth: 180, valueGetter: (_, row) => row.checksum || 'Not available' },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader title="Screenshots" description="Review screenshot metadata captured by the monitoring foundation. Binary image download is not enabled yet." breadcrumbs={['Admin', 'Monitoring', 'Screenshots']} />
      <SummaryCardsContainer>
        <StatCard label="Metadata Rows" value={String(rows.length)} helper="Current loaded results" icon={FileImage} tone="#2563EB" />
        <StatCard label="Stored Size" value={formatBytes(totalBytes)} helper="Current loaded results" icon={FileImage} tone="#6B7280" />
      </SummaryCardsContainer>
      <Alert severity="info">Only screenshot metadata is displayed. Image download and MinIO previews are intentionally not implemented in this phase.</Alert>
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void screenshotsQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <SearchFilter placeholder="Search employee, object key, checksum, or MIME type" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <DateRangePicker value={dateRange} defaultPreset="currentWeek" onChange={(value) => { setDateRange(value); setPagination((current) => ({ ...current, page: 0 })); }} />
      </FilterToolbar>
      <DataTable title="Screenshot Metadata" rows={rows} columns={columns} toolbar={<></>} gridProps={{ loading: screenshotsQuery.isFetching, rowHeight: 60, columnHeaderHeight: 48, paginationMode: 'server', rowCount: screenshotsQuery.data?.data.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title="No screenshots found" description="Try adjusting the employee, date range, or search filters." /> } }} />
      {screenshotsQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void screenshotsQuery.refetch()}>Retry</Button>}>Screenshot metadata could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}><Typography variant="body2">{toast}</Typography></Alert>}
    </PageLayout>
  );
}
