import { Alert, Button, IconButton, MenuItem, Stack, TextField, Tooltip } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Download, Eye, RefreshCw, TimerReset, TriangleAlert, UserCheck, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { getEmployees } from '@/features/people/services/employees-api';
import { getAttendance, getAttendanceSummary } from '../services/attendance-api';
import type { AttendanceRecord, AttendanceStatus } from '../types/attendance.types';
import { attendanceStatusTone, employeeEmail, employeeName, formatDate, formatDateTime, formatEnum, formatMinutes, shiftLabel, workedMinutes } from '../utils/attendance-format';

const attendanceStatuses: AttendanceStatus[] = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'AUTO_PUNCHED_OUT'];

export default function AttendancePage() {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);

  const attendanceQuery = useQuery({
    queryKey: ['attendance', { page: pagination.page + 1, limit: pagination.pageSize, search, dateFrom, dateTo, employeeId, status }],
    queryFn: () => getAttendance({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      employeeId: employeeId || undefined,
      status: status ? status as AttendanceStatus : undefined,
    }),
  });

  const summaryQuery = useQuery({
    queryKey: ['attendance-summary', dateTo || dateFrom || 'today'],
    queryFn: () => getAttendanceSummary(dateTo || dateFrom || undefined),
  });

  const employeesQuery = useQuery({
    queryKey: ['attendance-filter-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });

  const rows = useMemo(() => attendanceQuery.data?.data.data ?? [], [attendanceQuery.data?.data.data]);
  const counts = summaryQuery.data?.data.counts ?? {};

  const columns = useMemo<GridColDef<AttendanceRecord>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 220,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => <AvatarCell name={employeeName(row)} email={employeeEmail(row)} />,
    },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 150, valueGetter: (_, row) => row.employee?.employeeCode ?? '-' },
    { field: 'attendanceDate', headerName: 'Date', minWidth: 140, valueFormatter: (value) => formatDate(String(value)) },
    { field: 'punchInAt', headerName: 'Punch In', minWidth: 180, valueFormatter: (value) => value ? formatDateTime(String(value)) : 'Not available' },
    { field: 'punchOutAt', headerName: 'Punch Out', minWidth: 180, valueFormatter: (value) => value ? formatDateTime(String(value)) : 'Open session' },
    { field: 'workedMinutes', headerName: 'Working Hours', minWidth: 145, valueGetter: (_, row) => formatMinutes(workedMinutes(row)) },
    { field: 'breakMinutes', headerName: 'Break Time', minWidth: 130, valueGetter: (value) => formatMinutes(typeof value === 'number' ? value : 0) },
    { field: 'status', headerName: 'Status', minWidth: 155, renderCell: ({ row }) => <StatusChip label={formatEnum(row.status)} tone={attendanceStatusTone(row.status)} /> },
    { field: 'shift', headerName: 'Shift', minWidth: 170, valueGetter: (_, row) => shiftLabel(row) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 110,
      renderCell: ({ row }) => (
        <Tooltip title="View details">
          <IconButton component={RouterLink} to={`/attendance/${row.id}`} state={{ attendance: row }} size="small">
            <Eye size={17} />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  function resetFilters() {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setEmployeeId('');
    setStatus('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <Stack gap={3}>
      <PageHeader
        title="Attendance"
        description="Review daily attendance sessions and exception classifications."
        breadcrumbs={['Admin', 'Attendance', 'Attendance']}
      />

      <Stack sx={summaryGrid}>
        <StatCard label="Present" value={String(counts.PRESENT ?? 0)} helper="Recorded as present" icon={UserCheck} tone="#16A34A" />
        <StatCard label="Late" value={String(counts.LATE ?? 0)} helper="Late arrivals" icon={TimerReset} tone="#F59E0B" />
        <StatCard label="Half Day" value={String(counts.HALF_DAY ?? 0)} helper="HR day classification" icon={CalendarCheck} tone="#F59E0B" />
        <StatCard label="Absent" value={String(counts.ABSENT ?? 0)} helper="No attendance record" icon={UserX} tone="#DC2626" />
        <StatCard label="Auto Punch Out" value={String(counts.AUTO_PUNCHED_OUT ?? 0)} helper="System closed sessions" icon={TriangleAlert} tone="#DC2626" />
      </Stack>

      <Alert severity="info">Sorting applies to the currently loaded page. Filters use backend-supported attendance fields only.</Alert>

      <DataTable
        title="Attendance Sessions"
        rows={rows}
        columns={columns}
        toolbar={(
          <Stack direction={{ xs: 'column', xl: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', xl: 'center' }}>
            <SearchBox placeholder="Search employee code or name" value={search} onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} />
            <TextField label="Date From" type="date" size="small" value={dateFrom} onChange={(event) => {
              setDateFrom(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} InputLabelProps={{ shrink: true }} />
            <TextField label="Date To" type="date" size="small" value={dateTo} onChange={(event) => {
              setDateTo(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} InputLabelProps={{ shrink: true }} />
            <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => {
              setEmployeeId(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} sx={{ minWidth: 220 }}>
              <MenuItem value="">All employees</MenuItem>
              {(employeesQuery.data?.data.data ?? []).map((employee) => (
                <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Status" size="small" value={status} onChange={(event) => {
              setStatus(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} sx={{ minWidth: 170 }}>
              <MenuItem value="">All statuses</MenuItem>
              {attendanceStatuses.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
            </TextField>
            <Button variant="outlined" onClick={resetFilters}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => {
              void attendanceQuery.refetch();
              void summaryQuery.refetch();
            }}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => setToast('Export will be connected in the reporting phase.')}>Export</Button>
          </Stack>
        )}
        gridProps={{
          loading: attendanceQuery.isFetching,
          paginationMode: 'server',
          rowCount: attendanceQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No attendance found" description="Try adjusting the date range, employee, status, or search filters." />,
          },
        }}
      />

      {attendanceQuery.isError && <Alert severity="error">Attendance could not be loaded. Check backend availability and permissions.</Alert>}
      {summaryQuery.isError && <Alert severity="warning">Summary cards could not be refreshed right now.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}
    </Stack>
  );
}

const summaryGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
  gap: 2,
};
