import { Alert, Button, MenuItem, TextField } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Hourglass, Scale, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getEmployees } from '@/features/people/services/employees-api';
import { useLeaveTypes } from '../hooks/useLeaveTypes';
import { getLeaveBalances } from '../services/leave-api';
import type { LeaveBalance } from '../types/leave.types';
import { formatNumber } from '../utils/leave-format';

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);

export default function LeaveBalancesPage() {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['leave-balances', { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, leaveTypeId, year }],
    queryFn: () => getLeaveBalances({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      leaveTypeId: leaveTypeId || undefined,
      year: year ? Number(year) : undefined,
    }),
  });

  const employeesQuery = useQuery({
    queryKey: ['leave-balance-filter-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });

  const leaveTypesQuery = useLeaveTypes();
  const rows = useMemo(() => balancesQuery.data?.data.data ?? [], [balancesQuery.data?.data.data]);
  const totals = useMemo(() => rows.reduce((acc, row) => ({
    allocated: acc.allocated + (row.allocated ?? 0),
    used: acc.used + (row.used ?? 0),
    remaining: acc.remaining + (row.remaining ?? 0),
    pending: acc.pending + (row.pending ?? 0),
  }), { allocated: 0, used: 0, remaining: 0, pending: 0 }), [rows]);

  const columns = useMemo<GridColDef<LeaveBalance>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 230,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => {
        const user = row.employee?.user;
        const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Employee';
        return <AvatarCell name={name} email={user?.email ?? undefined} />;
      },
    },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 145, valueGetter: (_, row) => row.employee?.employeeCode ?? '-' },
    { field: 'leaveType', headerName: 'Leave Type', minWidth: 170, valueGetter: (_, row) => row.leaveType?.name ?? 'Not available' },
    { field: 'allocated', headerName: 'Allocated', minWidth: 120, valueFormatter: (value) => formatNumber(typeof value === 'number' ? value : 0) },
    { field: 'used', headerName: 'Used', minWidth: 110, valueFormatter: (value) => formatNumber(typeof value === 'number' ? value : 0) },
    { field: 'remaining', headerName: 'Remaining', minWidth: 130, valueFormatter: (value) => formatNumber(typeof value === 'number' ? value : 0) },
    { field: 'pending', headerName: 'Pending', minWidth: 120, valueFormatter: (value) => formatNumber(typeof value === 'number' ? value : 0) },
    { field: 'year', headerName: 'Year', minWidth: 100 },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setLeaveTypeId('');
    setYear(String(currentYear));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Leave Balances"
        description="Track allocated, used, remaining, and pending leave balances by employee and leave type."
        breadcrumbs={['Admin', 'Leave', 'Leave Balance']}
      />

      <SummaryCardsContainer>
        <StatCard label="Allocated" value={formatNumber(totals.allocated)} helper="Current loaded results" icon={WalletCards} tone="#2563EB" />
        <StatCard label="Used" value={formatNumber(totals.used)} helper="Current loaded results" icon={ClipboardList} tone="#F59E0B" />
        <StatCard label="Remaining" value={formatNumber(totals.remaining)} helper="Current loaded results" icon={Scale} tone="#16A34A" />
        <StatCard label="Pending" value={formatNumber(totals.pending)} helper="Current loaded results" icon={Hourglass} tone="#6B7280" />
      </SummaryCardsContainer>

      <Alert severity="info">Sorting applies to the currently loaded page. Balance totals reflect the loaded result set.</Alert>

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => void balancesQuery.refetch()} />
            <ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} />
          </>
        )}
      >
        <SearchFilter placeholder="Search employee or leave type" value={search} onChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => {
          setEmployeeId(event.target.value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>
          ))}
        </TextField>
        <TextField select label="Leave Type" size="small" value={leaveTypeId} onChange={(event) => {
          setLeaveTypeId(event.target.value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} sx={{ minWidth: { xs: '100%', md: 180 } }}>
          <MenuItem value="">All types</MenuItem>
          {(leaveTypesQuery.data?.data.data ?? []).map((leaveType) => (
            <MenuItem key={leaveType.id} value={leaveType.id}>{leaveType.name}</MenuItem>
          ))}
        </TextField>
        <TextField select label="Year" size="small" value={year} onChange={(event) => {
          setYear(event.target.value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} sx={{ minWidth: { xs: '100%', md: 130 } }}>
          <MenuItem value="">All years</MenuItem>
          {yearOptions.map((item) => <MenuItem key={item} value={String(item)}>{item}</MenuItem>)}
        </TextField>
      </FilterToolbar>

      <DataTable
        title="Leave Balance Ledger"
        rows={rows}
        columns={columns}
        toolbar={<></>}
        gridProps={{
          loading: balancesQuery.isFetching,
          rowHeight: 60,
          columnHeaderHeight: 48,
          paginationMode: 'server',
          rowCount: balancesQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No leave balances found" description="Try adjusting the employee, leave type, year, or search filters." />,
          },
        }}
      />

      {balancesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void balancesQuery.refetch()}>Retry</Button>}>Leave balances could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {leaveTypesQuery.isError && <Alert severity="warning">Leave type filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}
    </PageLayout>
  );
}
