import { Alert, Button, IconButton, MenuItem, Stack, TextField, Tooltip } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Eye, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { getEmployees } from '@/features/people/services/employees-api';
import {
  cancelAttendanceCorrection,
  getAttendanceCorrections,
  reviewAttendanceCorrection,
} from '../services/attendance-corrections-api';
import type {
  AttendanceCorrectionRequest,
  AttendanceCorrectionStatus,
  AttendanceCorrectionType,
} from '../types/attendance-correction.types';
import { canReviewCorrections } from '../types/attendance-correction.types';
import { formatDate, formatDateTime, formatEnum } from '../utils/attendance-format';
import {
  correctionEmployeeName,
  correctionStatusTone,
  correctionTypeLabel,
  correctionUserName,
} from '../utils/attendance-correction-format';
import { ReviewCorrectionDialog } from './components/ReviewCorrectionDialog';

const statuses: AttendanceCorrectionStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const types: AttendanceCorrectionType[] = ['MISSED_PUNCH_IN', 'MISSED_PUNCH_OUT', 'TIME_CORRECTION', 'FULL_DAY_REGULARIZATION'];

export default function AttendanceCorrectionsPage() {
  const queryClient = useQueryClient();
  const { roles, user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ request: AttendanceCorrectionRequest; status: 'APPROVED' | 'REJECTED' } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AttendanceCorrectionRequest | null>(null);

  const correctionsQuery = useQuery({
    queryKey: ['attendance-corrections', { page: pagination.page + 1, limit: pagination.pageSize, search, status, type, employeeId, dateFrom, dateTo }],
    queryFn: () => getAttendanceCorrections({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      status: status ? status as AttendanceCorrectionStatus : undefined,
      type: type ? type as AttendanceCorrectionType : undefined,
      employeeId: employeeId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  });

  const employeesQuery = useQuery({
    queryKey: ['attendance-correction-filter-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: 'APPROVED' | 'REJECTED'; reviewerComment?: string } }) =>
      reviewAttendanceCorrection(id, payload),
    onSuccess: async () => {
      setReviewTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      setToast('Correction request reviewed successfully.');
    },
    onError: () => setToast('Review failed. Check permissions and try again.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelAttendanceCorrection(id),
    onSuccess: async () => {
      setCancelTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      setToast('Correction request cancelled.');
    },
    onError: () => setToast('Cancellation failed. Check permissions and try again.'),
  });

  const rows = useMemo(() => correctionsQuery.data?.data.data ?? [], [correctionsQuery.data?.data.data]);
  const canReview = canReviewCorrections(roles);

  const columns = useMemo<GridColDef<AttendanceCorrectionRequest>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 230,
      flex: 1,
      sortable: false,
      valueGetter: (_, row) => correctionEmployeeName(row),
    },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 150, valueGetter: (_, row) => row.employee?.employeeCode ?? '-' },
    { field: 'attendanceDate', headerName: 'Attendance Date', minWidth: 150, valueGetter: (_, row) => formatDate(row.attendance?.attendanceDate) },
    { field: 'type', headerName: 'Type', minWidth: 190, valueGetter: (_, row) => correctionTypeLabel(row.type) },
    { field: 'status', headerName: 'Status', minWidth: 135, renderCell: ({ row }) => <StatusChip label={formatEnum(row.status)} tone={correctionStatusTone(row.status)} /> },
    { field: 'requestedPunchInAt', headerName: 'Requested In', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.requestedPunchInAt) },
    { field: 'requestedPunchOutAt', headerName: 'Requested Out', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.requestedPunchOutAt) },
    { field: 'requestedBy', headerName: 'Requested By', minWidth: 180, valueGetter: (_, row) => correctionUserName(row.requestedBy) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 210,
      renderCell: ({ row }) => {
        const pending = row.status === 'PENDING';
        const canCancel = pending && (row.requestedByUserId === user?.id || roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR'));
        return (
          <Stack direction="row" gap={0.5}>
            <Tooltip title="View details">
              <IconButton component={RouterLink} to={`/attendance/corrections/${row.id}`} size="small">
                <Eye size={17} />
              </IconButton>
            </Tooltip>
            {pending && canReview && (
              <>
                <Tooltip title="Approve">
                  <IconButton size="small" color="success" onClick={() => setReviewTarget({ request: row, status: 'APPROVED' })}>
                    <Check size={17} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reject">
                  <IconButton size="small" color="error" onClick={() => setReviewTarget({ request: row, status: 'REJECTED' })}>
                    <X size={17} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {canCancel && (
              <Tooltip title="Cancel request">
                <IconButton size="small" color="warning" onClick={() => setCancelTarget(row)}>
                  <RotateCcw size={17} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );
      },
    },
  ], [canReview, roles, user?.id]);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setType('');
    setEmployeeId('');
    setDateFrom('');
    setDateTo('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <Stack gap={3}>
      <PageHeader
        title="Attendance Corrections"
        description="Review attendance regularization requests and keep exceptions auditable."
        breadcrumbs={['Admin', 'Attendance', 'Corrections']}
        primaryActionLabel="Create Request"
        primaryActionTo="/attendance/corrections/create"
      />

      <Alert severity="info">Sorting applies to the currently loaded page. Review permissions are still enforced by the backend.</Alert>

      <DataTable
        title="Correction Requests"
        rows={rows}
        columns={columns}
        toolbar={(
          <Stack direction={{ xs: 'column', xl: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', xl: 'center' }}>
            <SearchBox placeholder="Search reason, employee code or name" value={search} onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} />
            <TextField select label="Status" size="small" value={status} onChange={(event) => {
              setStatus(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} sx={{ minWidth: 155 }}>
              <MenuItem value="">All statuses</MenuItem>
              {statuses.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
            </TextField>
            <TextField select label="Type" size="small" value={type} onChange={(event) => {
              setType(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} sx={{ minWidth: 220 }}>
              <MenuItem value="">All types</MenuItem>
              {types.map((item) => <MenuItem key={item} value={item}>{correctionTypeLabel(item)}</MenuItem>)}
            </TextField>
            <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => {
              setEmployeeId(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} sx={{ minWidth: 230 }}>
              <MenuItem value="">All employees</MenuItem>
              {(employeesQuery.data?.data.data ?? []).map((employee) => (
                <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>
              ))}
            </TextField>
            <TextField label="Date From" type="date" size="small" value={dateFrom} onChange={(event) => {
              setDateFrom(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} InputLabelProps={{ shrink: true }} />
            <TextField label="Date To" type="date" size="small" value={dateTo} onChange={(event) => {
              setDateTo(event.target.value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} InputLabelProps={{ shrink: true }} />
            <Button variant="outlined" onClick={resetFilters}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => correctionsQuery.refetch()}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => setToast('Export will be connected in the reporting phase.')}>Export</Button>
          </Stack>
        )}
        gridProps={{
          loading: correctionsQuery.isFetching,
          paginationMode: 'server',
          rowCount: correctionsQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No correction requests" description="Create a correction request or adjust filters to find existing requests." />,
          },
        }}
      />

      {correctionsQuery.isError && <Alert severity="error">Correction requests could not be loaded. Check backend availability and permissions.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      <ReviewCorrectionDialog
        open={Boolean(reviewTarget)}
        action={reviewTarget?.status ?? 'APPROVED'}
        employeeName={reviewTarget ? correctionEmployeeName(reviewTarget.request) : undefined}
        loading={reviewMutation.isPending}
        onClose={() => setReviewTarget(null)}
        onSubmit={(reviewerComment) => {
          if (!reviewTarget) return;
          reviewMutation.mutate({
            id: reviewTarget.request.id,
            payload: { status: reviewTarget.status, reviewerComment },
          });
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel correction request"
        description="This will cancel the pending correction request. The attendance record will not be changed."
        confirmLabel="Cancel request"
        loading={cancelMutation.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
      />
    </Stack>
  );
}
