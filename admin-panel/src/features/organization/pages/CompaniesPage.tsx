import { Alert, Box, Button, Card, CardContent, IconButton, MenuItem, Snackbar, Stack, TablePagination, TextField, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Eye, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { EnterpriseFilterCard, EnterpriseFilterSearch, type EnterpriseActiveFilter } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusChip } from '@/components/status-chip';
import { deleteCompany, getCompanies } from '../services/companies-api';
import type { Company, CompanyStatus } from '../types/company.types';
import { companyErrorMessage, formatDateTime } from '../utils/company-form';

const statusOptions: CompanyStatus[] = ['ACTIVE', 'INACTIVE', 'TRIAL', 'SUSPENDED'];

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CompanyStatus | ''>('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [archiveTarget, setArchiveTarget] = useState<Company | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const resetPage = useCallback(() => setPagination((current) => ({ ...current, page: 0 })), []);
  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    resetPage();
  }, [resetPage]);

  const companiesQuery = useQuery({
    queryKey: ['companies', { page: pagination.page + 1, limit: pagination.pageSize, search, status }],
    queryFn: () => getCompanies({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      status: status || undefined,
    }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => deleteCompany(id),
    onSuccess: async () => {
      setToast({ severity: 'success', message: 'Company archived successfully. Tenant business records were preserved.' });
      setArchiveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error) => setToast({ severity: 'error', message: companyErrorMessage(error, 'Company could not be archived. Check permissions and try again.') }),
  });

  const rows = companiesQuery.data?.data.data ?? [];
  const meta = companiesQuery.data?.data.meta;
  const total = meta?.total ?? 0;
  const hasFilters = Boolean(search || status);
  const summary = total === 0
    ? hasFilters ? 'No companies match the current filters.' : 'No companies have been created yet.'
    : `Showing ${pagination.page * pagination.pageSize + 1}-${Math.min((pagination.page + 1) * pagination.pageSize, total)} of ${total} companies`;

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => [
    ...(search ? [{ key: 'search', label: 'Search', value: search, onRemove: () => changeSearch('') }] : []),
    ...(status ? [{ key: 'status', label: 'Status', value: status, onRemove: () => { setStatus(''); resetPage(); } }] : []),
  ], [changeSearch, resetPage, search, status]);

  const columns = useMemo<GridColDef<Company>[]>(() => [
    {
      field: 'name',
      headerName: 'Company',
      flex: 1.2,
      minWidth: 220,
      renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={800} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.slug}</Typography></Box>,
    },
    { field: 'country', headerName: 'Country', minWidth: 130, valueFormatter: (value) => value || '-' },
    { field: 'timezone', headerName: 'Timezone', minWidth: 165 },
    { field: 'employeesCount', headerName: 'Employees', minWidth: 120, valueGetter: (_, row) => row.counts.employees },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 130,
      renderCell: ({ value }) => <StatusChip label={String(value)} tone={statusTone(value as CompanyStatus)} />,
    },
    { field: 'createdAt', headerName: 'Created', minWidth: 180, valueFormatter: (value) => formatDateTime(String(value)) },
    {
      field: 'actions',
      headerName: 'Actions',
      sortable: false,
      filterable: false,
      minWidth: 150,
      renderCell: ({ row }) => <CompanyActions company={row} onArchive={setArchiveTarget} />,
    },
  ], []);

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    resetPage();
  };

  return (
    <PageLayout>
      <PageHeader title="Companies" description="Manage tenant company identities, regional settings, and lifecycle status." breadcrumbs={['Admin', 'Organization', 'Companies']} primaryActionLabel="Add Company" primaryActionTo="/organization/companies/create" />

      <EnterpriseFilterCard
        title="Company Filters"
        description="Search tenant companies and filter by lifecycle status."
        loading={companiesQuery.isFetching}
        summary={summary}
        activeFilters={activeFilters}
        search={(
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(320px, 1fr) minmax(160px, 190px) auto auto' },
              alignItems: 'center',
              gap: 1,
              width: '100%',
              '& > .MuiFormControl-root': { maxWidth: 'none' },
              '& .MuiButton-root': { minHeight: 40, whiteSpace: 'nowrap' },
            }}
          >
            <EnterpriseFilterSearch value={search} onChange={changeSearch} label="Search Companies" placeholder="Search by company name or code" loading={companiesQuery.isFetching} />
            <TextField select size="small" fullWidth label="Status" value={status} onChange={(event) => { setStatus(event.target.value as CompanyStatus | ''); resetPage(); }}><MenuItem value="">All Statuses</MenuItem>{statusOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField>
            <Button variant="text" fullWidth startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button>
            <Button variant="outlined" fullWidth startIcon={<RefreshCw size={17} />} onClick={() => void companiesQuery.refetch()} disabled={companiesQuery.isFetching}>Refresh</Button>
          </Box>
        )}
      />

      {companiesQuery.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void companiesQuery.refetch()}>Retry</Button>}>Companies could not be loaded.</Alert> : null}

      <Box sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } }}>
        <DataTable
          title="Company Directory"
          rows={rows}
          columns={columns}
          showSearch={false}
          gridProps={{
            loading: companiesQuery.isFetching,
            paginationMode: 'server',
            pageSizeOptions: [10, 20, 50],
            rowCount: total,
            paginationModel: pagination,
            onPaginationModelChange: setPagination,
            slots: {
              loadingOverlay: () => <LoadingSkeleton rows={6} />,
              noRowsOverlay: () => <EmptyState title={hasFilters ? 'No companies match the current filters' : 'No companies yet'} description={hasFilters ? 'Clear or adjust the filters to broaden the results.' : 'Create the first company tenant to begin.'} />,
            },
          }}
        />
      </Box>

      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {companiesQuery.isLoading ? <LoadingSkeleton rows={5} /> : rows.length === 0 ? <Card><EmptyState title={hasFilters ? 'No companies match the current filters' : 'No companies yet'} description={hasFilters ? 'Clear or adjust the filters to broaden the results.' : 'Create the first company tenant to begin.'} /></Card> : <Stack gap={1.5}>{rows.map((company) => <CompanyMobileCard key={company.id} company={company} onArchive={setArchiveTarget} />)}</Stack>}
        <TablePagination component="div" count={total} page={pagination.page} rowsPerPage={pagination.pageSize} onPageChange={(_, page) => setPagination((current) => ({ ...current, page }))} onRowsPerPageChange={(event) => setPagination({ page: 0, pageSize: Number(event.target.value) })} rowsPerPageOptions={[10, 20, 50]} />
      </Box>

      <ConfirmDialog open={Boolean(archiveTarget)} title="Archive company?" description={`Archive ${archiveTarget?.name ?? 'this company'} and suspend tenant access? Existing organization and workforce records will be preserved.`} confirmLabel="Archive company" loading={archiveMutation.isPending} onClose={() => { if (!archiveMutation.isPending) setArchiveTarget(null); }} onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)} />

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function CompanyActions({ company, onArchive }: { company: Company; onArchive: (company: Company) => void }) {
  return <Stack direction="row" gap={0.5}><Tooltip title="View company"><IconButton component={RouterLink} to={`/organization/companies/${company.id}`} size="small" aria-label={`View ${company.name}`}><Eye size={17} /></IconButton></Tooltip><Tooltip title="Edit company"><IconButton component={RouterLink} to={`/organization/companies/${company.id}/edit`} size="small" aria-label={`Edit ${company.name}`}><Edit3 size={17} /></IconButton></Tooltip><Tooltip title="Archive company"><IconButton size="small" color="error" aria-label={`Archive ${company.name}`} onClick={() => onArchive(company)}><Trash2 size={17} /></IconButton></Tooltip></Stack>;
}

function CompanyMobileCard({ company, onArchive }: { company: Company; onArchive: (company: Company) => void }) {
  return <Card variant="outlined"><CardContent><Stack gap={1.5}><Stack direction="row" justifyContent="space-between" gap={1}><Box minWidth={0}><Typography fontWeight={800}>{company.name}</Typography><Typography variant="body2" color="text.secondary">{company.slug}</Typography></Box><StatusChip label={company.status} tone={statusTone(company.status)} /></Stack><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}><MobileDetail label="Timezone" value={company.timezone} /><MobileDetail label="Country" value={company.country ?? '-'} /><MobileDetail label="Employees" value={String(company.counts.employees)} /><MobileDetail label="Created" value={formatDateTime(company.createdAt)} /></Box><CompanyActions company={company} onArchive={onArchive} /></Stack></CardContent></Card>;
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} noWrap>{value}</Typography></Box>;
}

function statusTone(status: CompanyStatus) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'info';
  if (status === 'SUSPENDED') return 'danger';
  return 'neutral';
}
