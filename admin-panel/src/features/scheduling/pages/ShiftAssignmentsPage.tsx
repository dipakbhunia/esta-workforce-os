import { Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, Eye, HelpCircle, History, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { EnterpriseFilterCard, EnterpriseFilterSearch, type EnterpriseActiveFilter } from '@/components/enterprise/filters';
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
  const meta = assignmentsQuery.data?.data.meta;

  const resetPage = useCallback(() => {
    setPagination((current) => ({ ...current, page: 0 }));
  }, []);

  const resetFilters = useCallback(() => {
    setSearch('');
    setEmployeeId('');
    setDepartmentId('');
    setDesignationId('');
    setShiftId('');
    setStatus('');
    setAssignmentType('');
    setEffectiveAt('');
    resetPage();
  }, [resetPage]);

  const employeeOptions = employeesQuery.data?.data.data ?? [];
  const departmentOptions = departmentsQuery.data?.data.data ?? [];
  const designationOptions = designationsQuery.data?.data.data ?? [];
  const shiftOptions = shiftsQuery.data?.data.data ?? [];
  const hasActiveFilters = Boolean(search || employeeId || departmentId || designationId || shiftId || status || assignmentType || effectiveAt);

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    const employee = employeeOptions.find((option) => option.id === employeeId);
    const department = departmentOptions.find((option) => option.id === departmentId);
    const designation = designationOptions.find((option) => option.id === designationId);
    const shift = shiftOptions.find((option) => option.id === shiftId);
    const statusOption = assignmentStatusOptions.find((option) => option.value === status);
    const typeOption = assignmentTypeOptions.find((option) => option.value === assignmentType);

    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (employeeId) filters.push({ key: 'employee', label: 'Employee', value: employee ? `${employeeName(employee)} - ${employee.employeeCode}` : 'Selected employee', onRemove: () => { setEmployeeId(''); resetPage(); } });
    if (departmentId) filters.push({ key: 'department', label: 'Department', value: department?.name ?? 'Selected department', onRemove: () => { setDepartmentId(''); resetPage(); } });
    if (designationId) filters.push({ key: 'designation', label: 'Designation', value: designation?.name ?? 'Selected designation', onRemove: () => { setDesignationId(''); resetPage(); } });
    if (shiftId) filters.push({ key: 'shift', label: 'Shift', value: shift?.name ?? 'Selected shift', onRemove: () => { setShiftId(''); resetPage(); } });
    if (status) filters.push({ key: 'status', label: 'Status', value: statusOption?.label ?? assignmentStatusLabel(status), onRemove: () => { setStatus(''); resetPage(); } });
    if (assignmentType) filters.push({ key: 'assignmentType', label: 'Type', value: typeOption?.label ?? formatAssignmentType(assignmentType), onRemove: () => { setAssignmentType(''); resetPage(); } });
    if (effectiveAt) filters.push({ key: 'effectiveAt', label: 'Effective Date', value: formatFilterDate(effectiveAt), onRemove: () => { setEffectiveAt(''); resetPage(); } });

    return filters;
  }, [assignmentType, departmentId, departmentOptions, designationId, designationOptions, effectiveAt, employeeId, employeeOptions, resetPage, search, shiftId, shiftOptions, status]);

  const emptyMessage = hasActiveFilters
    ? 'No assignments match the current filters.'
    : 'No shift assignments have been created yet.';

  const summaryText = useMemo(() => {
    if (!meta) return undefined;
    if (meta.total === 0) return emptyMessage;
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    return `Showing ${start}-${end} of ${meta.total} assignments`;
  }, [emptyMessage, meta]);

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

      <EnterpriseFilterCard
        title="Filters"
        description="Refine assignments by employee, organization, shift, status, type, and effective coverage date."
        loading={assignmentsQuery.isFetching}
        summary={summaryText}
        activeFilters={activeFilters}
        actions={(
          <>
            <Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasActiveFilters}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void assignmentsQuery.refetch()} disabled={assignmentsQuery.isFetching}>Refresh</Button>
            <Tooltip title="Export will be available in a future update">
              <span>
                <Button variant="outlined" startIcon={<Download size={17} />} disabled>Export</Button>
              </span>
            </Tooltip>
          </>
        )}
        search={(
          <EnterpriseFilterSearch
            value={search}
            label="Search assignments"
            placeholder="Search employee, code, or shift"
            loading={assignmentsQuery.isFetching}
            onChange={(value) => {
              setSearch(value);
              resetPage();
            }}
          />
        )}
        filters={(
          <>
            <FormControl size="small" fullWidth>
              <InputLabel id="shift-assignment-employee-filter-label">Employee</InputLabel>
              <Select
                labelId="shift-assignment-employee-filter-label"
                label="Employee"
                value={employeeId}
                onChange={(event) => { setEmployeeId(event.target.value); resetPage(); }}
                disabled={employeesQuery.isLoading}
              >
                <MenuItem value="">All Employees</MenuItem>
                {employeeOptions.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.employeeCode}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="shift-assignment-department-filter-label">Department</InputLabel>
              <Select
                labelId="shift-assignment-department-filter-label"
                label="Department"
                value={departmentId}
                onChange={(event) => { setDepartmentId(event.target.value); resetPage(); }}
                disabled={departmentsQuery.isLoading}
              >
                <MenuItem value="">All Departments</MenuItem>
                {departmentOptions.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="shift-assignment-designation-filter-label">Designation</InputLabel>
              <Select
                labelId="shift-assignment-designation-filter-label"
                label="Designation"
                value={designationId}
                onChange={(event) => { setDesignationId(event.target.value); resetPage(); }}
                disabled={designationsQuery.isLoading}
              >
                <MenuItem value="">All Designations</MenuItem>
                {designationOptions.map((designation) => <MenuItem key={designation.id} value={designation.id}>{designation.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="shift-assignment-shift-filter-label">Shift</InputLabel>
              <Select
                labelId="shift-assignment-shift-filter-label"
                label="Shift"
                value={shiftId}
                onChange={(event) => { setShiftId(event.target.value); resetPage(); }}
                disabled={shiftsQuery.isLoading}
              >
                <MenuItem value="">All Shifts</MenuItem>
                {shiftOptions.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="shift-assignment-status-filter-label">Status</InputLabel>
              <Select
                labelId="shift-assignment-status-filter-label"
                label="Status"
                value={status}
                onChange={(event) => { setStatus(event.target.value as ShiftAssignmentStatus | ''); resetPage(); }}
              >
                <MenuItem value="">All Statuses</MenuItem>
                {assignmentStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="shift-assignment-type-filter-label">Assignment Type</InputLabel>
              <Select
                labelId="shift-assignment-type-filter-label"
                label="Assignment Type"
                value={assignmentType}
                onChange={(event) => { setAssignmentType(event.target.value as ShiftAssignmentType | ''); resetPage(); }}
              >
                <MenuItem value="">All Types</MenuItem>
                {assignmentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small"
              fullWidth
              type="date"
              label={(
                <Stack component="span" direction="row" alignItems="center" gap={0.5}>
                  Effective Date
                  <Tooltip title="Find assignments active on the selected date.">
                    <HelpCircle size={14} aria-label="Effective date help" />
                  </Tooltip>
                </Stack>
              )}
              value={effectiveAt}
              onChange={(event) => { setEffectiveAt(event.target.value); resetPage(); }}
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}
      />

      <DataTable
        title="Employee Shift Assignments"
        rows={rows}
        columns={columns}
        showSearch={false}
        gridProps={{
          loading: assignmentsQuery.isFetching,
          paginationMode: 'server',
          rowCount: assignmentsQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          getRowHeight: () => 64,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title={emptyMessage} description={hasActiveFilters ? 'Try removing a filter or changing the search text.' : 'Create the first employee shift assignment to start scheduling.'} />,
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

function formatFilterDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}
