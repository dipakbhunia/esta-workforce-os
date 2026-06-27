import { Alert, Box, Button, IconButton, MenuItem, Snackbar, Stack, TextField, Tooltip, Typography } from '@mui/material';
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
import { deleteCompany, getCompanies } from '../services/companies-api';
import type { Company, CompanyStatus } from '../types/company.types';
import { formatDateTime } from '../utils/company-form';

const statusOptions: Array<'ALL' | CompanyStatus> = ['ALL', 'ACTIVE', 'INACTIVE', 'TRIAL', 'SUSPENDED'];

export default function CompaniesPage() {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | CompanyStatus>('ALL');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);
  const canCreate = roles.includes('SUPER_ADMIN');
  const canDelete = roles.includes('SUPER_ADMIN');
  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('COMPANY_ADMIN');

  const companiesQuery = useQuery({
    queryKey: ['companies', { page: pagination.page + 1, limit: pagination.pageSize, search }],
    queryFn: () => getCompanies({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: async () => {
      setToast({ severity: 'success', message: 'Company archived successfully.' });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Company could not be archived. Check permissions and try again.' }),
  });

  const rows = useMemo(() => {
    const data = companiesQuery.data?.data.data ?? [];
    return status === 'ALL' ? data : data.filter((company) => company.status === status);
  }, [companiesQuery.data?.data.data, status]);

  const columns = useMemo<GridColDef<Company>[]>(() => [
    {
      field: 'name',
      headerName: 'Company Name',
      flex: 1.2,
      minWidth: 220,
      renderCell: ({ row }) => (
        <Box>
          <Typography fontWeight={800}>{row.name}</Typography>
          <Typography variant="caption" color="text.secondary">{row.id}</Typography>
        </Box>
      ),
    },
    { field: 'slug', headerName: 'Company Code', minWidth: 160, flex: 0.8 },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 130,
      renderCell: ({ value }) => <StatusChip label={String(value)} tone={statusTone(value as CompanyStatus)} />,
    },
    { field: 'country', headerName: 'Country', minWidth: 130, valueGetter: () => '-' },
    { field: 'timezone', headerName: 'Timezone', minWidth: 150, valueGetter: () => '-' },
    { field: 'employeesCount', headerName: 'Employees Count', minWidth: 150, valueGetter: (_, row) => row._count?.employees ?? '-' },
    { field: 'createdAt', headerName: 'Created Date', minWidth: 180, valueFormatter: (value) => formatDateTime(String(value)) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 150,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.5}>
          <Tooltip title="View"><IconButton component={RouterLink} to={`/organization/companies/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip>
          {canEdit && <Tooltip title="Edit"><IconButton component={RouterLink} to={`/organization/companies/${row.id}/edit`} size="small"><Edit3 size={17} /></IconButton></Tooltip>}
          {canDelete && <Tooltip title="Archive"><IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Trash2 size={17} /></IconButton></Tooltip>}
        </Stack>
      ),
    },
  ], [canDelete, canEdit]);

  function resetFilters() {
    setSearch('');
    setStatus('ALL');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  const meta = companiesQuery.data?.data.meta;
  const rowCount = status === 'ALL' ? meta?.total ?? 0 : rows.length;

  return (
    <Stack gap={3}>
      <PageHeader
        title="Companies"
        description={roles.includes('SUPER_ADMIN') ? 'Manage tenant companies, legal entities, and operating workspaces.' : 'View your company workspace foundation.'}
        breadcrumbs={['Admin', 'Organization', 'Companies']}
        primaryActionLabel={canCreate ? 'Add Company' : undefined}
        primaryActionTo={canCreate ? '/organization/companies/create' : undefined}
      />

      {!roles.includes('SUPER_ADMIN') && user?.companyId && (
        <Alert severity="info">Company administrators can read and update their own company only. HR, Manager, and Employee roles do not have company management access.</Alert>
      )}

      <DataTable
        title="Company Directory"
        rows={rows}
        columns={columns}
        toolbar={(
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
            <SearchBox placeholder="Search company name or code" value={search} onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, page: 0 }));
            }} />
            <TextField select size="small" label="Status (loaded page)" value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | CompanyStatus)} sx={{ minWidth: 190, bgcolor: '#fff' }}>
              {statusOptions.map((option) => <MenuItem key={option} value={option}>{option === 'ALL' ? 'All statuses' : option}</MenuItem>)}
            </TextField>
            <Button variant="outlined" onClick={resetFilters}>Reset</Button>
            <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void companiesQuery.refetch()}>Refresh</Button>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => setToast({ severity: 'info', message: 'Export will be connected in the reporting phase.' })}>Export</Button>
          </Stack>
        )}
        gridProps={{
          loading: companiesQuery.isFetching,
          paginationMode: 'server',
          rowCount,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No companies found" description="Try changing filters or create a new company." />,
          },
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive company?"
        description={`This will soft delete ${deleteTarget?.name ?? 'this company'} and related organization records. This cannot be undone from the admin panel yet.`}
        confirmLabel="Archive company"
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

function statusTone(status: CompanyStatus) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'info';
  if (status === 'SUSPENDED') return 'danger';
  return 'neutral';
}
