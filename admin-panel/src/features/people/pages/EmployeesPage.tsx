import { Alert, Button, IconButton, Snackbar, Stack, Tooltip } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { deleteEmployee, getEmployees } from '../services/employees-api';
import type { Employee } from '../types/employee.types';
import { formatDate, formatEnum, fullName, statusTone } from '../utils/employee-form';

export default function EmployeesPage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  const employeesQuery = useQuery({
    queryKey: ['employees', { page: pagination.page + 1, limit: pagination.pageSize, search }],
    queryFn: () => getEmployees({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: async () => {
      setToast({ severity: 'success', message: 'Employee archived successfully.' });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Employee could not be archived. Check permissions and try again.' }),
  });

  const rows = useMemo(() => employeesQuery.data?.data.data ?? [], [employeesQuery.data?.data.data]);

  const columns = useMemo<GridColDef<Employee>[]>(() => [
    { field: 'photo', headerName: 'Employee Photo', minWidth: 220, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={fullName(row)} email={row.user?.email} /> },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 160 },
    { field: 'fullName', headerName: 'Full Name', minWidth: 180, valueGetter: (_, row) => fullName(row) },
    { field: 'email', headerName: 'Email', minWidth: 220, flex: 1, valueGetter: (_, row) => row.user?.email ?? '-' },
    { field: 'branch', headerName: 'Branch', minWidth: 160, valueGetter: (_, row) => row.branch?.name ?? '-' },
    { field: 'department', headerName: 'Department', minWidth: 170, valueGetter: (_, row) => row.department?.name ?? '-' },
    { field: 'designation', headerName: 'Designation', minWidth: 170, valueGetter: (_, row) => row.designation?.name ?? '-' },
    { field: 'shift', headerName: 'Shift', minWidth: 150, valueGetter: (_, row) => row.shift?.name ?? '-' },
    { field: 'employmentType', headerName: 'Employment Type', minWidth: 170, valueGetter: (value) => formatEnum(String(value)) },
    { field: 'workMode', headerName: 'Work Mode', minWidth: 140, valueGetter: (value) => value === 'ONSITE' ? 'Office' : formatEnum(String(value)) },
    { field: 'status', headerName: 'Status', minWidth: 130, renderCell: ({ row }) => <StatusChip label={formatEnum(row.status)} tone={statusTone(row.status)} /> },
    { field: 'joiningDate', headerName: 'Joining Date', minWidth: 150, valueFormatter: (value) => formatDate(String(value)) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 150,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.5}>
          <Tooltip title="View"><IconButton component={RouterLink} to={`/people/employees/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip>
          {canManage && <Tooltip title="Edit"><IconButton component={RouterLink} to={`/people/employees/${row.id}/edit`} size="small"><Edit3 size={17} /></IconButton></Tooltip>}
          {canManage && <Tooltip title="Archive"><IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Trash2 size={17} /></IconButton></Tooltip>}
        </Stack>
      ),
    },
  ], [canManage]);

  return (
    <Stack gap={3}>
      <PageHeader
        title="Employees"
        description="Maintain employee master profiles and HRMS metadata."
        breadcrumbs={['Admin', 'People', 'Employees']}
        primaryActionLabel={canManage ? 'Add Employee' : undefined}
        primaryActionTo={canManage ? '/people/employees/create' : undefined}
      />

      <Alert severity="info">Sorting applies to the currently loaded page.</Alert>

      <DataTable
        title="Employee Directory"
        rows={rows}
        columns={columns}
        toolbar={(
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
            <SearchBox placeholder="Search employee code, name, email, or mobile" value={search} onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} />
            <Button variant="outlined" onClick={() => {
              setSearch('');
              setPagination((current) => ({ ...current, page: 0 }));
            }}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void employeesQuery.refetch()}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => setToast({ severity: 'info', message: 'Export will be connected in the reporting phase.' })}>Export</Button>
          </Stack>
        )}
        gridProps={{
          loading: employeesQuery.isFetching,
          paginationMode: 'server',
          rowCount: employeesQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No employees found" description="Try changing search or create a new employee profile." />,
          },
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive employee?"
        description={`This will soft delete ${fullName(deleteTarget)} and mark the profile as terminated.`}
        confirmLabel="Archive employee"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Stack>
  );
}
