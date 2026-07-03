import { Alert, Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { deleteLeaveType, getLeaveTypes } from '../services/leave-api';
import type { LeaveType } from '../types/leave.types';
import { formatDateTime, formatNumber } from '../utils/leave-format';

export default function LeaveTypesPage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  const leaveTypesQuery = useQuery({
    queryKey: ['leave-types', { page: pagination.page + 1, limit: pagination.pageSize, search }],
    queryFn: () => getLeaveTypes({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLeaveType(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      setToast('Leave type archived successfully.');
    },
    onError: () => setToast('Leave type could not be archived. Check permissions and pending requests.'),
  });

  const rows = useMemo(() => leaveTypesQuery.data?.data.data ?? [], [leaveTypesQuery.data?.data.data]);

  const columns = useMemo<GridColDef<LeaveType>[]>(() => [
    {
      field: 'name',
      headerName: 'Leave Type Name',
      flex: 1,
      minWidth: 220,
      renderCell: ({ row }) => (
        <Box>
          <Typography fontWeight={800}>{row.name}</Typography>
          {row.description && <Typography variant="caption" color="text.secondary" noWrap>{row.description}</Typography>}
        </Box>
      ),
    },
    { field: 'code', headerName: 'Code', minWidth: 155 },
    { field: 'defaultDays', headerName: 'Default Days', minWidth: 140, valueFormatter: (value) => formatNumber(typeof value === 'number' ? value : 0) },
    {
      field: 'requiresApproval',
      headerName: 'Requires Approval',
      minWidth: 170,
      renderCell: ({ row }) => <StatusChip label={row.requiresApproval ? 'Yes' : 'No'} tone={row.requiresApproval ? 'info' : 'neutral'} />,
    },
    {
      field: 'managerCanApprove',
      headerName: 'Manager Can Approve',
      minWidth: 190,
      renderCell: ({ row }) => <StatusChip label={row.managerCanApprove ? 'Yes' : 'No'} tone={row.managerCanApprove ? 'success' : 'neutral'} />,
    },
    { field: 'createdAt', headerName: 'Created Date', minWidth: 180, valueFormatter: (value) => formatDateTime(value ? String(value) : undefined) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 130,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.5}>
          {canManage && <Tooltip title="Edit"><IconButton component={RouterLink} to={`/leave/types/${row.id}/edit`} size="small"><Edit3 size={17} /></IconButton></Tooltip>}
          {canManage && <Tooltip title="Archive"><IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Trash2 size={17} /></IconButton></Tooltip>}
        </Stack>
      ),
    },
  ], [canManage]);

  function resetFilters() {
    setSearch('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Leave Types"
        description="Define leave categories, yearly defaults, and approval behavior."
        breadcrumbs={['Admin', 'Leave', 'Leave Types']}
        primaryActionLabel={canManage ? 'Add Leave Type' : undefined}
        primaryActionTo={canManage ? '/leave/types/create' : undefined}
      />

      <Alert severity="info">Sorting applies to the currently loaded page.</Alert>

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => void leaveTypesQuery.refetch()} />
            <ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} />
          </>
        )}
      >
        <SearchFilter placeholder="Search leave type name or code" value={search} onChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} />
      </FilterToolbar>

      <DataTable
        title="Leave Type Directory"
        rows={rows}
        columns={columns}
        toolbar={<></>}
        gridProps={{
          loading: leaveTypesQuery.isFetching,
          rowHeight: 60,
          columnHeaderHeight: 48,
          paginationMode: 'server',
          rowCount: leaveTypesQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No leave types found" description="Try changing search or create a new leave type." />,
          },
        }}
      />

      {leaveTypesQuery.isError && <Alert severity="error">Leave types could not be loaded. Check backend availability and permissions.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive leave type?"
        description={`This will soft delete ${deleteTarget?.name ?? 'this leave type'} if the backend allows it.`}
        confirmLabel="Archive leave type"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}
