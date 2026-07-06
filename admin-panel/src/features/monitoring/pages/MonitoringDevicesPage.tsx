import { Alert, Button, MenuItem, TextField, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { HardDrive, MonitorDot, Wifi } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getEmployees } from '@/features/people/services/employees-api';
import { getMonitoringDevices } from '../services/monitoring-api';
import type { MonitoringDevice, MonitoringDeviceStatus } from '../types/monitoring.types';
import { deviceStatusTone, employeeEmail, employeeName, formatDateTime, formatEnum } from '../utils/monitoring-format';

const deviceStatuses: MonitoringDeviceStatus[] = ['ACTIVE', 'INACTIVE', 'REVOKED'];

export default function MonitoringDevicesPage() {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: ['monitoring-devices', { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId }],
    queryFn: () => getMonitoringDevices({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
    }),
  });
  const employeesQuery = useQuery({ queryKey: ['monitoring-device-employees'], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const allRows = useMemo(() => devicesQuery.data?.data.data ?? [], [devicesQuery.data?.data.data]);
  const rows = useMemo(() => status ? allRows.filter((row) => row.status === status) : allRows, [allRows, status]);
  const activeCount = useMemo(() => allRows.filter((row) => row.status === 'ACTIVE').length, [allRows]);

  const columns = useMemo<GridColDef<MonitoringDevice>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 240, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'hostname', headerName: 'Hostname / Device', minWidth: 220, flex: 1, valueGetter: (_, row) => row.hostname || row.deviceIdentifier || 'Not available' },
    { field: 'platform', headerName: 'Platform', minWidth: 130, valueGetter: (_, row) => row.platform || 'Not available' },
    { field: 'agentVersion', headerName: 'Agent Version', minWidth: 140, valueGetter: (_, row) => row.agentVersion || 'Not available' },
    { field: 'status', headerName: 'Status', minWidth: 130, renderCell: ({ row }) => <StatusChip label={formatEnum(row.status)} tone={deviceStatusTone(row.status)} /> },
    { field: 'lastHeartbeatAt', headerName: 'Last Heartbeat', minWidth: 190, valueGetter: (_, row) => formatDateTime(row.lastHeartbeatAt) },
    { field: 'registeredAt', headerName: 'Registered', minWidth: 190, valueGetter: (_, row) => formatDateTime(row.registeredAt) },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setStatus('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader title="Devices" description="Review registered desktop agent devices and their latest heartbeat metadata." breadcrumbs={['Admin', 'Monitoring', 'Devices']} />
      <SummaryCardsContainer>
        <StatCard label="Loaded Devices" value={String(allRows.length)} helper="Current loaded page" icon={HardDrive} tone="#2563EB" />
        <StatCard label="Active Devices" value={String(activeCount)} helper="Current loaded page" icon={MonitorDot} tone="#16A34A" />
        <StatCard label="With Heartbeat" value={String(allRows.filter((row) => row.lastHeartbeatAt).length)} helper="Latest heartbeat available" icon={Wifi} tone="#6B7280" />
      </SummaryCardsContainer>
      <Alert severity="info">Status filtering applies to the currently loaded page until backend status filtering is added.</Alert>
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void devicesQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <SearchFilter placeholder="Search employee, hostname, platform, or version" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <TextField select label="Status" size="small" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: { xs: '100%', md: 160 } }}>
          <MenuItem value="">All statuses</MenuItem>
          {deviceStatuses.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
        </TextField>
      </FilterToolbar>
      <DataTable title="Monitoring Devices" rows={rows} columns={columns} toolbar={<></>} gridProps={{ loading: devicesQuery.isFetching, rowHeight: 60, columnHeaderHeight: 48, paginationMode: 'server', rowCount: devicesQuery.data?.data.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title="No devices found" description="Try adjusting the employee, status, or search filters." /> } }} />
      {devicesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void devicesQuery.refetch()}>Retry</Button>}>Devices could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}><Typography variant="body2">{toast}</Typography></Alert>}
    </PageLayout>
  );
}
