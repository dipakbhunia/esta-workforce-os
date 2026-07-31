import { Alert, Box, Button, IconButton, MenuItem, Select, Snackbar, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, Eye, History, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterToolbar } from '@/components/filter-toolbar/FilterToolbar';
import { SearchFilter } from '@/components/filter-toolbar/SearchFilter';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { StatusChip } from '@/components/status-chip';
import { useDepartments, useDesignations, useShifts } from '@/features/organization/hooks';
import { getEmployees } from '@/features/people/services/employees-api';
import { cancelShiftAssignment, getShiftAssignments } from '../services/shift-assignments-api';
import type { ShiftAssignment, ShiftAssignmentStatus, ShiftAssignmentType } from '../types/shift-assignment.types';
import {
  assignmentStatusLabel,
  assignmentStatusOptions,
  assignmentStatusTone,
  assignmentTypeOptions,
  employeeEmail,
  employeeName,
  formatAssignmentType,
  formatDateTime,
  shiftLabel,
} from '../utils/shift-assignment-utils';

export default function ShiftAssignmentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [status, setStatus] = useState<ShiftAssignmentStatus | ''>('');
  const [assignmentType, setAssignmentType] = useState<ShiftAssignmentType | ''>('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [cancelTarget, setCancelTarget] = useState<ShiftAssignment | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);

  const employeesQuery = useQuery({
    queryKey: ['employees', { selector: 'shift-assignments-list' }],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });
  const departmentsQuery = useDepartments();
  const designationsQuery = useDesignations();
  const shiftsQuery = useShifts();

  const assignmentsQuery = useQuery({
    queryKey: ['shift-assignments', { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, departmentId, designationId, shiftId, status, assignmentType, effectiveAt }],
    queryFn: () => getShiftAssignments({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
      shiftId: shiftId || undefined,
      status: status || undefined,
      assignmentType: assignmentType || undefined,
      effectiveAt: effectiveAt ? new Date(`${effectiveAt}T00:00:00`).toISOString() : undefined,
    }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelShiftAssignment(id),
    onSuccess: async () => {
      setCancelTarget(null);
      setToast({ severity: 'success', message: 'Shift assignment cancelled.' });
      await queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Shift assignment could not be cancelled. Check permissions and try again.' }),
  });

  const rows = useMemo(() => assignmentsQuery.data?.data.data ?? [], [assignmentsQuery.data?.data.data]);

  const resetFilters = () => {
    setSearch('');
    setEmployeeId('');
    setDepartmentId('');
    setDesignationId('');
    setShiftId('');
    setStatus('');
    setAssignmentType('');
    setEffectiveAt('');
    setPagination((current) => ({ ...current, page: 0 }));
  };

  const columns = useMemo<GridColDef<ShiftAssignment>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 260,
      flex: 1,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0, py: 0.75 }}>
          <Typography fontWeight={850} noWrap>{employeeName(row.employee)}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{employeeEmail(row.employee)}</Typography>
        </Box>
      ),
    },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 150, valueGetter: (_, row) => row.employee?.employeeCode ?? '-' },
    { field: 'department', headerName: 'Department', minWidth: 160, valueGetter: (_, row) => row.employee?.department?.name ?? '-' },
    { field: 'designation', headerName: 'Designation', minWidth: 160, valueGetter: (_, row) => row.employee?.designation?.name ?? '-' },
    { field: 'shift', headerName: 'Current Shift', minWidth: 220, valueGetter: (_, row) => shiftLabel(row) },
    { field: 'effectiveFrom', headerName: 'Effective From', minWidth: 190, valueGetter: (_, row) => formatDateTime(row.effectiveFrom) },
    { field: 'effectiveTo', headerName: 'Effective To', minWidth: 190, valueGetter: (_, row) => formatDateTime(row.effectiveTo) },
    { field: 'assignmentType', headerName: 'Assignment Type', minWidth: 160, valueGetter: (_, row) => formatAssignmentType(row.assignmentType) },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 130,
      renderCell: ({ row }) => <StatusChip label={assignmentStatusLabel(row.status)} tone={assignmentStatusTone(row.status)} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 190,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.25}>
          <Tooltip title="View"><IconButton component={RouterLink} to={`/scheduling/shift-assignments/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip>
          <Tooltip title={row.status === 'CANCELLED' ? 'Cancelled assignments cannot be edited' : 'Edit'}><span><IconButton component={RouterLink} to={`/scheduling/shift-assignments/${row.id}/edit`} size="small" disabled={row.status === 'CANCELLED'}><Edit3 size={17} /></IconButton></span></Tooltip>
          <Tooltip title="History"><IconButton component={RouterLink} to={`/scheduling/shift-assignments/employee/${row.employeeId}/history`} size="small"><History size={17} /></IconButton></Tooltip>
          <Tooltip title="Cancel Assignment"><span><IconButton size="small" color="error" disabled={row.status === 'CANCELLED'} onClick={() => setCancelTarget(row)}><XCircle size={17} /></IconButton></span></Tooltip>
        </Stack>
      ),
    },
  ], []);

  return (
    <PageLayout>
      <PageHeader
        title="Shift Assignments"
        description="Manage effective-dated employee shift assignments for attendance resolution."
        breadcrumbs={['Admin', 'Scheduling', 'Shift Assignments']}
        primaryActionLabel="Create Assignment"
        primaryActionTo="/scheduling/shift-assignments/create"
      />

      <Alert severity="info">Assignment ranges use inclusive start and exclusive end semantics. Effective Date returns assignments covering the selected local day start.</Alert>

      <FilterToolbar
        actions={(
          <>
            <Button variant="outlined" startIcon={<RotateCcw size={17} />} onClick={resetFilters}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void assignmentsQuery.refetch()}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} disabled onClick={() => setToast({ severity: 'info', message: 'Export will be connected in a future reporting phase.' })}>Export</Button>
          </>
        )}
      >
        <SearchFilter placeholder="Search employee, code, shift" value={search} onChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} />
        <Select size="small" displayEmpty value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }}>
          <MenuItem value="">All Employees</MenuItem>
          {employeesQuery.data?.data.data.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeName(employee)} · {employee.employeeCode}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }}>
          <MenuItem value="">All Departments</MenuItem>
          {departmentsQuery.data?.data.data.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={designationId} onChange={(event) => { setDesignationId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }}>
          <MenuItem value="">All Designations</MenuItem>
          {designationsQuery.data?.data.data.map((designation) => <MenuItem key={designation.id} value={designation.id}>{designation.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={shiftId} onChange={(event) => { setShiftId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }}>
          <MenuItem value="">All Shifts</MenuItem>
          {shiftsQuery.data?.data.data.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={status} onChange={(event) => { setStatus(event.target.value as ShiftAssignmentStatus | ''); setPagination((current) => ({ ...current, page: 0 })); }}>
          <MenuItem value="">All Statuses</MenuItem>
          {assignmentStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={assignmentType} onChange={(event) => { setAssignmentType(event.target.value as ShiftAssignmentType | ''); setPagination((current) => ({ ...current, page: 0 })); }}>
          <MenuItem value="">All Types</MenuItem>
          {assignmentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </Select>
        <TextField size="small" type="date" label="Effective Date" value={effectiveAt} onChange={(event) => { setEffectiveAt(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} InputLabelProps={{ shrink: true }} />
      </FilterToolbar>

      <DataTable
        title="Employee Shift Assignments"
        rows={rows}
        columns={columns}
        gridProps={{
          loading: assignmentsQuery.isFetching,
          paginationMode: 'server',
          rowCount: assignmentsQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          getRowHeight: () => 64,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No assignments found" description="Try adjusting filters or create a new shift assignment." />,
          },
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Shift Assignment"
        description="This assignment will no longer be considered during future shift resolution."
        confirmLabel="Cancel Assignment"
        loading={cancelMutation.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
      />

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </PageLayout>
  );
}
