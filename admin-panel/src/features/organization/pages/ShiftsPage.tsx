import { Alert, Box, Button, IconButton, Snackbar, Stack, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { useAuth } from '@/features/auth';
import { deleteShift, getShifts } from '../services/shifts-api';
import type { Shift } from '../types/shift.types';
import { formatDateTime, formatWorkingHours } from '../utils/shift-form';

export default function ShiftsPage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  const shiftsQuery = useQuery({
    queryKey: ['shifts', { page: pagination.page + 1, limit: pagination.pageSize, search }],
    queryFn: () => getShifts({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShift(id),
    onSuccess: async () => {
      setToast({ severity: 'success', message: 'Shift archived successfully.' });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Shift could not be archived. Check permissions and try again.' }),
  });

  const rows = useMemo(() => shiftsQuery.data?.data.data ?? [], [shiftsQuery.data?.data.data]);

  const columns = useMemo<GridColDef<Shift>[]>(() => [
    {
      field: 'name',
      headerName: 'Shift Name',
      flex: 1,
      minWidth: 220,
      renderCell: ({ row }) => (
        <Box>
          <Typography fontWeight={800}>{row.name}</Typography>
          <Typography variant="caption" color="text.secondary">{row.id}</Typography>
        </Box>
      ),
    },
    { field: 'code', headerName: 'Shift Code', minWidth: 150, flex: 0.6 },
    { field: 'startTime', headerName: 'Start Time', minWidth: 130 },
    { field: 'endTime', headerName: 'End Time', minWidth: 130 },
    { field: 'timezone', headerName: 'Timezone', minWidth: 180, flex: 0.8, valueGetter: (_, row) => row.timezone ?? 'UTC' },
    { field: 'workingHours', headerName: 'Working Hours', minWidth: 150, valueGetter: (_, row) => formatWorkingHours(row.startTime, row.endTime) },
    { field: 'graceTime', headerName: 'Grace Time', minWidth: 140, sortable: false, valueGetter: () => 'Future' },
    { field: 'employeesCount', headerName: 'Employees Count', minWidth: 160, valueGetter: (_, row) => row._count?.employees ?? '-' },
    { field: 'createdAt', headerName: 'Created Date', minWidth: 180, valueFormatter: (value) => formatDateTime(String(value)) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 150,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.5}>
          <Tooltip title="View"><IconButton component={RouterLink} to={`/organization/shifts/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip>
          {canManage && <Tooltip title="Edit"><IconButton component={RouterLink} to={`/organization/shifts/${row.id}/edit`} size="small"><Edit3 size={17} /></IconButton></Tooltip>}
          {canManage && <Tooltip title="Archive"><IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Trash2 size={17} /></IconButton></Tooltip>}
        </Stack>
      ),
    },
  ], [canManage]);

  return (
    <Stack gap={3}>
      <PageHeader
        title="Shifts"
        description="Manage shift schedules, working windows, and timezones."
        breadcrumbs={['Admin', 'Organization', 'Shifts']}
        primaryActionLabel={canManage ? 'Add Shift' : undefined}
        primaryActionTo={canManage ? '/organization/shifts/create' : undefined}
      />

      <Alert severity="info">Sorting applies to the currently loaded page.</Alert>

      <DataTable
        title="Shift Directory"
        rows={rows}
        columns={columns}
        toolbar={(
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
            <SearchBox placeholder="Search shift name, code, or timezone" value={search} onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} />
            <Button variant="outlined" onClick={() => {
              setSearch('');
              setPagination((current) => ({ ...current, page: 0 }));
            }}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void shiftsQuery.refetch()}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => setToast({ severity: 'info', message: 'Export will be connected in the reporting phase.' })}>Export</Button>
          </Stack>
        )}
        gridProps={{
          loading: shiftsQuery.isFetching,
          paginationMode: 'server',
          rowCount: shiftsQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No shifts found" description="Try changing search or create a new shift." />,
          },
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive shift?"
        description={`This will soft delete ${deleteTarget?.name ?? 'this shift'} and unlink related users and employees where supported by the backend.`}
        confirmLabel="Archive shift"
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
