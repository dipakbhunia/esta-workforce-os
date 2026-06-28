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
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { deleteDesignation, getDesignations } from '../services/designations-api';
import type { Designation } from '../types/designation.types';
import { formatDateTime } from '../utils/designation-form';

export default function DesignationsPage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  const designationsQuery = useQuery({
    queryKey: ['designations', { page: pagination.page + 1, limit: pagination.pageSize, search }],
    queryFn: () => getDesignations({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDesignation(id),
    onSuccess: async () => {
      setToast({ severity: 'success', message: 'Designation archived successfully.' });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['designations'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Designation could not be archived. Check permissions and try again.' }),
  });

  const rows = useMemo(() => designationsQuery.data?.data.data ?? [], [designationsQuery.data?.data.data]);

  const columns = useMemo<GridColDef<Designation>[]>(() => [
    {
      field: 'name',
      headerName: 'Designation Name',
      flex: 1,
      minWidth: 220,
      renderCell: ({ row }) => (
        <Box>
          <Typography fontWeight={800}>{row.name}</Typography>
          <Typography variant="caption" color="text.secondary">{row.id}</Typography>
        </Box>
      ),
    },
    { field: 'code', headerName: 'Designation Code', minWidth: 170, flex: 0.7 },
    { field: 'department', headerName: 'Department', minWidth: 180, flex: 0.8, valueGetter: (_, row) => row.department?.name ?? '-' },
    { field: 'employeesCount', headerName: 'Employees Count', minWidth: 160, valueGetter: (_, row) => row._count?.employees ?? '-' },
    { field: 'status', headerName: 'Status', minWidth: 120, sortable: false, renderCell: () => <StatusChip label="ACTIVE" tone="success" /> },
    { field: 'createdAt', headerName: 'Created Date', minWidth: 180, valueFormatter: (value) => formatDateTime(String(value)) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 150,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.5}>
          <Tooltip title="View"><IconButton component={RouterLink} to={`/organization/designations/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip>
          {canManage && <Tooltip title="Edit"><IconButton component={RouterLink} to={`/organization/designations/${row.id}/edit`} size="small"><Edit3 size={17} /></IconButton></Tooltip>}
          {canManage && <Tooltip title="Archive"><IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Trash2 size={17} /></IconButton></Tooltip>}
        </Stack>
      ),
    },
  ], [canManage]);

  return (
    <Stack gap={3}>
      <PageHeader
        title="Designations"
        description="Manage job titles and their department assignments."
        breadcrumbs={['Admin', 'Organization', 'Designations']}
        primaryActionLabel={canManage ? 'Add Designation' : undefined}
        primaryActionTo={canManage ? '/organization/designations/create' : undefined}
      />

      <Alert severity="info">Sorting applies to the currently loaded page.</Alert>

      <DataTable
        title="Designation Directory"
        rows={rows}
        columns={columns}
        toolbar={(
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
            <SearchBox placeholder="Search designation name, code, or department" value={search} onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} />
            <Button variant="outlined" onClick={() => {
              setSearch('');
              setPagination((current) => ({ ...current, page: 0 }));
            }}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void designationsQuery.refetch()}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => setToast({ severity: 'info', message: 'Export will be connected in the reporting phase.' })}>Export</Button>
          </Stack>
        )}
        gridProps={{
          loading: designationsQuery.isFetching,
          paginationMode: 'server',
          rowCount: designationsQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No designations found" description="Try changing search or create a new designation." />,
          },
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive designation?"
        description={`This will soft delete ${deleteTarget?.name ?? 'this designation'} and unlink related users and employees where supported by the backend.`}
        confirmLabel="Archive designation"
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
