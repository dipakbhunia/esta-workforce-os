import { Alert, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, FileCheck2, FileClock, FileX2, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { useAuth } from '@/features/auth';
import { getEmployees } from '@/features/people/services/employees-api';
import { useLeaveTypes } from '../hooks/useLeaveTypes';
import { cancelLeaveRequest, getLeaveRequests, reviewLeaveRequest } from '../services/leave-api';
import type { LeaveRequest, LeaveRequestStatus, ReviewLeaveRequestPayload } from '../types/leave.types';
import { employeeCode, employeeEmail, employeeName, formatDate, formatDateTime, formatEnum, leaveStatusTone } from '../utils/leave-format';
import { ReviewLeaveDialog } from './components/ReviewLeaveDialog';

const leaveStatuses: LeaveRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default function LeaveRequestsPage() {
  const queryClient = useQueryClient();
  const { roles, user } = useAuth();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [status, setStatus] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('currentMonth'));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [reviewTarget, setReviewTarget] = useState<{ request: LeaveRequest; mode: 'APPROVED' | 'REJECTED' } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dateFrom = dateRange.dateFrom;
  const dateTo = dateRange.dateTo;

  const leaveRequestsQuery = useQuery({
    queryKey: ['leave-requests', { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, leaveTypeId, status, dateFrom, dateTo }],
    queryFn: () => getLeaveRequests({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      leaveTypeId: leaveTypeId || undefined,
      status: status ? status as LeaveRequestStatus : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  });

  const employeesQuery = useQuery({
    queryKey: ['leave-request-filter-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });

  const leaveTypesQuery = useLeaveTypes();

  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewLeaveRequestPayload }) => reviewLeaveRequest(id, payload),
    onSuccess: async () => {
      setReviewTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      setToast('Leave request reviewed successfully.');
    },
    onError: () => setToast('Review failed. Check permissions and try again.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: async () => {
      setCancelTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      setToast('Leave request cancelled.');
    },
    onError: () => setToast('Cancellation failed. Check permissions and try again.'),
  });

  const rows = useMemo(() => leaveRequestsQuery.data?.data.data ?? [], [leaveRequestsQuery.data?.data.data]);
  const counts = useMemo(() => ({
    PENDING: rows.filter((row) => row.status === 'PENDING').length,
    APPROVED: rows.filter((row) => row.status === 'APPROVED').length,
    REJECTED: rows.filter((row) => row.status === 'REJECTED').length,
    CANCELLED: rows.filter((row) => row.status === 'CANCELLED').length,
  }), [rows]);

  const canReview = roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR' || role === 'MANAGER');
  const canApply = roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR' || role === 'MANAGER' || role === 'EMPLOYEE');

  const columns = useMemo<GridColDef<LeaveRequest>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 230,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => <AvatarCell name={employeeName(row)} email={employeeEmail(row)} />,
    },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 145, valueGetter: (_, row) => employeeCode(row) },
    { field: 'leaveType', headerName: 'Leave Type', minWidth: 160, valueGetter: (_, row) => row.leaveType?.name ?? 'Not available' },
    { field: 'startDate', headerName: 'Start Date', minWidth: 130, valueFormatter: (value) => formatDate(String(value)) },
    { field: 'endDate', headerName: 'End Date', minWidth: 130, valueFormatter: (value) => formatDate(String(value)) },
    { field: 'totalDays', headerName: 'Days', minWidth: 95, valueGetter: (value) => typeof value === 'number' ? value : '-' },
    { field: 'status', headerName: 'Status', minWidth: 135, renderCell: ({ row }) => <StatusChip label={formatEnum(row.status)} tone={leaveStatusTone(row.status)} /> },
    { field: 'createdAt', headerName: 'Requested', minWidth: 165, valueFormatter: (value) => formatDateTime(value ? String(value) : undefined) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 190,
      renderCell: ({ row }) => {
        const pending = row.status === 'PENDING';
        const canCancel = pending && (row.employee?.user?.id === user?.id || roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR'));
        return (
          <>
            <Tooltip title="View details">
              <IconButton component={RouterLink} to={`/leave/requests/${row.id}`} size="small">
                <Eye size={17} />
              </IconButton>
            </Tooltip>
            {canReview && pending && (
              <>
                <Tooltip title="Approve">
                  <IconButton color="success" size="small" onClick={() => setReviewTarget({ request: row, mode: 'APPROVED' })}>
                    <Check size={17} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reject">
                  <IconButton color="error" size="small" onClick={() => setReviewTarget({ request: row, mode: 'REJECTED' })}>
                    <X size={17} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {canCancel && (
              <Tooltip title="Cancel request">
                <IconButton color="warning" size="small" onClick={() => setCancelTarget(row)}>
                  <RotateCcw size={17} />
                </IconButton>
              </Tooltip>
            )}
          </>
        );
      },
    },
  ], [canReview, roles, user?.id]);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setLeaveTypeId('');
    setStatus('');
    setDateRange(createDateRangeValue('currentMonth'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Leave Requests"
        description="Review, approve, reject, and track employee leave applications."
        breadcrumbs={['Admin', 'Leave', 'Leave Requests']}
        primaryActionLabel={canApply ? 'Apply Leave' : undefined}
        primaryActionTo={canApply ? '/leave/requests/create' : undefined}
      />

      <SummaryCardsContainer>
        <StatCard label="Pending" value={String(counts.PENDING)} helper="Current loaded results" icon={FileClock} tone="#F59E0B" />
        <StatCard label="Approved" value={String(counts.APPROVED)} helper="Current loaded results" icon={FileCheck2} tone="#16A34A" />
        <StatCard label="Rejected" value={String(counts.REJECTED)} helper="Current loaded results" icon={FileX2} tone="#DC2626" />
        <StatCard label="Cancelled" value={String(counts.CANCELLED)} helper="Current loaded results" icon={RotateCcw} tone="#6B7280" />
      </SummaryCardsContainer>

      <Alert severity="info">Sorting applies to the currently loaded page. Summary cards reflect the loaded result set.</Alert>

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => void leaveRequestsQuery.refetch()} />
            <ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} />
          </>
        )}
      >
        <SearchFilter placeholder="Search employee or reason" value={search} onChange={(value) => {
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
        <TextField select label="Status" size="small" value={status} onChange={(event) => {
          setStatus(event.target.value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} sx={{ minWidth: { xs: '100%', md: 160 } }}>
          <MenuItem value="">All statuses</MenuItem>
          {leaveStatuses.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
        </TextField>
        <DateRangePicker
          value={dateRange}
          defaultPreset="currentMonth"
          onChange={(value) => {
            setDateRange(value);
            setPagination((current) => ({ ...current, page: 0 }));
          }}
        />
      </FilterToolbar>

      <DataTable
        title="Leave Applications"
        rows={rows}
        columns={columns}
        toolbar={<></>}
        gridProps={{
          loading: leaveRequestsQuery.isFetching,
          rowHeight: 60,
          columnHeaderHeight: 48,
          paginationMode: 'server',
          rowCount: leaveRequestsQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No leave requests found" description="Try adjusting the search, status, leave type, employee, or date filters." />,
          },
        }}
      />

      {leaveRequestsQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void leaveRequestsQuery.refetch()}>Retry</Button>}>Leave requests could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {leaveTypesQuery.isError && <Alert severity="warning">Leave type filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      <ReviewLeaveDialog
        open={Boolean(reviewTarget)}
        mode={reviewTarget?.mode ?? 'APPROVED'}
        loading={reviewMutation.isPending}
        onClose={() => setReviewTarget(null)}
        onSubmit={(payload) => {
          if (!reviewTarget) return;
          reviewMutation.mutate({ id: reviewTarget.request.id, payload });
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel leave request"
        description="This will cancel the pending leave request. Approved leave cannot be cancelled from this action."
        confirmLabel="Cancel request"
        loading={cancelMutation.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) cancelMutation.mutate(cancelTarget.id);
        }}
      />
    </PageLayout>
  );
}
