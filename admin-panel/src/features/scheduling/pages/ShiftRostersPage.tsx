import { Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Download, Edit3, Eye, LockKeyhole, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { EnterpriseBarChart, EnterpriseChartCard, EnterpriseChartLegend } from '@/components/enterprise/charts';
import { DateRangePicker, createCustomDateRangeValue, formatDateRangeChip } from '@/components/enterprise/date-range';
import { EnterpriseFilterCard, EnterpriseFilterSearch, type EnterpriseActiveFilter } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useBranches, useDepartments } from '@/features/organization/hooks';
import { RosterLifecycleDialog } from '../components/RosterLifecycleDialog';
import { RosterStatusBadge } from '../components/RosterStatusBadge';
import { exportShiftRosters, getShiftRosters, lockShiftRoster, previewShiftRoster, publishShiftRoster } from '../services/shift-rosters-api';
import type { ShiftRosterPeriod, ShiftRosterStatus, ShiftRosterSummary } from '../types/shift-roster.types';
import { downloadBlob, formatDateRange, formatDateTime, localDateForFilename, responseBlob, rosterStatusLabel, rosterStatusOptions, scopeLabel } from '../utils/shift-roster-utils';

const statusColorKeys: Record<ShiftRosterStatus, 'draft' | 'published' | 'locked' | 'cancelled'> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  LOCKED: 'locked',
  CANCELLED: 'cancelled',
};

export default function ShiftRostersPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState<ShiftRosterStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateRangeError, setDateRangeError] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [lifecycle, setLifecycle] = useState<{ action: 'publish' | 'lock'; roster: ShiftRosterPeriod } | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null);

  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();

  const rostersQuery = useQuery({
    queryKey: ['shift-rosters', { page: pagination.page + 1, limit: pagination.pageSize, search, branchId, departmentId, status, dateFrom, dateTo }],
    queryFn: () => getShiftRosters({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, branchId: branchId || undefined, departmentId: departmentId || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    enabled: !dateRangeError,
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => previewShiftRoster(id),
    onSuccess: (response) => setToast({ severity: response.data.valid ? 'success' : 'error', message: response.data.valid ? 'Roster preview passed.' : `Preview found ${response.data.errors.length} blocking issue(s).` }),
    onError: () => setToast({ severity: 'error', message: 'Preview failed. Try opening the roster details.' }),
  });
  const publishMutation = useMutation({
    mutationFn: async (roster: ShiftRosterPeriod) => {
      const preview = await previewShiftRoster(roster.id);
      if (!preview.data.valid) throw new Error('Preview has blocking errors');
      return publishShiftRoster(roster.id);
    },
    onSuccess: async () => {
      setLifecycle(null);
      setToast({ severity: 'success', message: 'Roster published.' });
      await queryClient.invalidateQueries({ queryKey: ['shift-rosters'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Roster could not be published. Run preview and resolve errors.' }),
  });
  const lockMutation = useMutation({
    mutationFn: (roster: ShiftRosterPeriod) => lockShiftRoster(roster.id),
    onSuccess: async () => {
      setLifecycle(null);
      setToast({ severity: 'success', message: 'Roster locked.' });
      await queryClient.invalidateQueries({ queryKey: ['shift-rosters'] });
    },
    onError: () => setToast({ severity: 'error', message: 'Roster could not be locked.' }),
  });
  const exportRostersMutation = useMutation({
    mutationFn: () => exportShiftRosters({ search: search || undefined, branchId: branchId || undefined, departmentId: departmentId || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    onSuccess: (response) => {
      downloadBlob(responseBlob(response), `shift-rosters-${localDateForFilename()}.csv`);
      setToast({ severity: 'success', message: 'Shift roster CSV export started.' });
    },
    onError: () => setToast({ severity: 'error', message: 'Shift roster export failed. Narrow filters and try again.' }),
  });

  const resetPage = () => setPagination((current) => ({ ...current, page: 0 }));
  const setRange = (start: string, end: string) => {
    if (end < start) {
      setDateRangeError('End date must be on or after the start date.');
      return;
    }
    setDateRangeError('');
    setDateFrom(start);
    setDateTo(end);
    resetPage();
  };
  const clearRange = () => { setDateFrom(''); setDateTo(''); setDateRangeError(''); resetPage(); };
  const resetFilters = () => { setSearch(''); setBranchId(''); setDepartmentId(''); setStatus(''); clearRange(); };
  const rows = rostersQuery.data?.data.data ?? [];
  const meta = rostersQuery.data?.data.meta;
  const summaryData = rostersQuery.data?.data.summary;
  const hasFilters = Boolean(search || branchId || departmentId || status || dateFrom || dateTo);
  const isEmpty = !rostersQuery.isFetching && !rostersQuery.isError && meta?.total === 0;
  const branches = branchesQuery.data?.data.data ?? [];
  const departments = departmentsQuery.data?.data.data ?? [];

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (branchId) filters.push({ key: 'branch', label: 'Branch', value: branches.find((branch) => branch.id === branchId)?.name ?? 'Selected branch', onRemove: () => { setBranchId(''); resetPage(); } });
    if (departmentId) filters.push({ key: 'department', label: 'Department', value: departments.find((department) => department.id === departmentId)?.name ?? 'Selected department', onRemove: () => { setDepartmentId(''); resetPage(); } });
    if (status) filters.push({ key: 'status', label: 'Status', value: rosterStatusLabel(status), onRemove: () => { setStatus(''); resetPage(); } });
    if (dateFrom && dateTo) filters.push({ key: 'dateRange', label: 'Date Range', value: formatDateRangeChip({ startDate: dateFrom, endDate: dateTo }), onRemove: clearRange });
    return filters;
  }, [branchId, branches, dateFrom, dateTo, departmentId, departments, search, status]);

  const summary = useMemo(() => {
    if (dateRangeError) return dateRangeError;
    if (!meta) return undefined;
    if (meta.total === 0) return hasFilters ? 'No roster periods match the current filters.' : 'No roster periods yet.';
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    return `Showing ${start}-${end} of ${meta.total} roster periods`;
  }, [dateRangeError, hasFilters, meta]);

  const chartSummary = summaryData ?? emptySummary();
  const statusColors = ['#64748B', theme.palette.success.main, theme.palette.secondary.main, theme.palette.error.light];
  const chartData = rosterStatusOptions.map((option, index) => ({ label: option.label, value: chartSummary[statusColorKeys[option.value]], color: statusColors[index] }));
  const overviewDescription = hasFilters ? 'Showing status distribution for the current filtered roster periods.' : 'Showing status distribution for all roster periods.';

  const columns = useMemo<GridColDef<ShiftRosterPeriod>[]>(() => [
    { field: 'name', headerName: 'Roster Name', minWidth: 200, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.code}</Typography></Box> },
    { field: 'scope', headerName: 'Scope', minWidth: 165, valueGetter: (_, row) => scopeLabel(row) },
    { field: 'dateRange', headerName: 'Date Range', minWidth: 190, valueGetter: (_, row) => formatDateRange(row) },
    { field: 'timezone', headerName: 'Timezone', minWidth: 130 },
    { field: 'version', headerName: 'Version', minWidth: 90, valueGetter: (_, row) => `v${row.version}` },
    { field: 'coverage', headerName: 'Coverage', minWidth: 130, renderCell: () => <StatusChip label="Not available" tone="neutral" /> },
    { field: 'status', headerName: 'Status', minWidth: 120, renderCell: ({ row }) => <RosterStatusBadge status={row.status} /> },
    { field: 'publishedAt', headerName: 'Published At', minWidth: 150, valueGetter: (_, row) => formatDateTime(row.publishedAt) },
    { field: 'lockedAt', headerName: 'Locked At', minWidth: 150, valueGetter: (_, row) => formatDateTime(row.lockedAt) },
    { field: 'actions', headerName: 'Actions', sortable: false, filterable: false, minWidth: 190, renderCell: ({ row }) => (
      <Stack direction="row" gap={0.25}>
        <Tooltip title="Open"><IconButton component={RouterLink} to={`/scheduling/shift-roster/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip>
        <Tooltip title={row.status === 'DRAFT' ? 'Edit Draft' : 'Only draft rosters can be edited'}><span><IconButton component={RouterLink} to={`/scheduling/shift-roster/${row.id}/edit`} size="small" disabled={row.status !== 'DRAFT'}><Edit3 size={17} /></IconButton></span></Tooltip>
        <Tooltip title="Preview"><IconButton size="small" onClick={() => previewMutation.mutate(row.id)}><ShieldCheck size={17} /></IconButton></Tooltip>
        <Tooltip title={row.status === 'DRAFT' ? 'Publish' : 'Only draft rosters can be published'}><span><IconButton size="small" disabled={row.status !== 'DRAFT'} onClick={() => setLifecycle({ action: 'publish', roster: row })}><CalendarDays size={17} /></IconButton></span></Tooltip>
        <Tooltip title={row.status === 'PUBLISHED' ? 'Lock' : 'Only published rosters can be locked'}><span><IconButton size="small" disabled={row.status !== 'PUBLISHED'} onClick={() => setLifecycle({ action: 'lock', roster: row })}><LockKeyhole size={17} /></IconButton></span></Tooltip>
      </Stack>
    ) },
  ], [previewMutation]);

  return (
    <PageLayout>
      <PageHeader title="Shift Roster" description="Plan, validate, publish, and lock operational roster periods." breadcrumbs={['Admin', 'Scheduling', 'Shift Roster']} primaryActionLabel="Create Draft" primaryActionTo="/scheduling/shift-roster/create" />
      <EnterpriseFilterCard
        title="Roster Filters"
        description="Filter roster periods by status, scope, and date range."
        loading={rostersQuery.isFetching || exportRostersMutation.isPending}
        summary={summary}
        activeFilters={activeFilters}
        actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void rostersQuery.refetch()} disabled={rostersQuery.isFetching || Boolean(dateRangeError)}>Refresh</Button><Tooltip title="Export filtered roster periods as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} onClick={() => exportRostersMutation.mutate()} disabled={exportRostersMutation.isPending || Boolean(dateRangeError)}>{exportRostersMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip></>}
        search={<EnterpriseFilterSearch value={search} label="Search rosters" placeholder="Search roster name or code" loading={rostersQuery.isFetching} onChange={(value) => { setSearch(value); resetPage(); }} />}
        filters={<>
          <FormControl size="small" fullWidth><InputLabel id="roster-status-filter-label">Status</InputLabel><Select labelId="roster-status-filter-label" label="Status" value={status} onChange={(event) => { setStatus(event.target.value as ShiftRosterStatus | ''); resetPage(); }}><MenuItem value="">All Statuses</MenuItem>{rosterStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" fullWidth><InputLabel id="roster-branch-filter-label">Branch</InputLabel><Select labelId="roster-branch-filter-label" label="Branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); setDepartmentId(''); resetPage(); }} disabled={branchesQuery.isLoading}><MenuItem value="">All Branches</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" fullWidth><InputLabel id="roster-department-filter-label">Department</InputLabel><Select labelId="roster-department-filter-label" label="Department" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); resetPage(); }} disabled={departmentsQuery.isLoading}><MenuItem value="">All Departments</MenuItem>{departments.filter((department) => !branchId || department.branchId === branchId).map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}</Select></FormControl>
          <Box sx={{ width: '100%', minWidth: 0 }}><DateRangePicker label="Date Range" value={createCustomDateRangeValue(dateFrom, dateTo)} defaultPreset="customRange" mode="filter" onChange={(value) => setRange(value.dateFrom, value.dateTo)} onClear={clearRange} error={Boolean(dateRangeError)} helperText={dateRangeError || 'Roster periods overlapping this range.'} /></Box>
        </>}
      />

      <EnterpriseChartCard title="Roster Status Overview" description={overviewDescription} loading={rostersQuery.isLoading} error={rostersQuery.isError} empty={false} emptyMessage="No roster status data available yet." retry={() => void rostersQuery.refetch()} height={200} accessibleSummary={`Filtered roster status distribution. Total rosters ${chartSummary.total}. Draft ${chartSummary.draft}, Published ${chartSummary.published}, Locked ${chartSummary.locked}, Cancelled ${chartSummary.cancelled}.`}>
        <Stack gap={1.5}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Kpi label="Total" value={chartSummary.total} />
            <Kpi label="Draft" value={chartSummary.draft} />
            <Kpi label="Published" value={chartSummary.published} />
            <Kpi label="Locked" value={chartSummary.locked} />
            <Kpi label="Cancelled" value={chartSummary.cancelled} />
          </Stack>
          <EnterpriseBarChart data={chartData} categoryKey="label" valueKey="value" valueFormatter={(value) => value.toLocaleString()} colors={statusColors} height={190} />
          <EnterpriseChartLegend items={chartData.map((item) => ({ label: item.label, color: item.color, value: item.value }))} />
        </Stack>
      </EnterpriseChartCard>
      {rostersQuery.isError ? <Alert severity="error">Shift rosters could not be loaded.</Alert> : null}
      {isEmpty ? (
        <SectionCard title="Roster Periods" description={hasFilters ? 'No roster periods matched the active filters.' : 'No roster periods have been created yet.'} action={!hasFilters ? <Button component={RouterLink} to="/scheduling/shift-roster/create" variant="contained">Create Draft</Button> : undefined}>
          <EmptyState title={hasFilters ? 'No roster periods match the current filters' : 'No roster periods yet'} description={hasFilters ? 'Adjust or clear the active filters and try again.' : 'Create your first draft roster to begin planning employee schedules.'} />
        </SectionCard>
      ) : (
        <DataTable title="Roster Periods" rows={rows} columns={columns} showSearch={false} gridProps={{ loading: rostersQuery.isFetching, paginationMode: 'server', rowCount: meta?.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 64, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title={hasFilters ? 'No roster periods match the current filters' : 'No roster periods yet'} description={hasFilters ? 'Adjust or clear the active filters and try again.' : 'Create your first draft roster to begin planning employee schedules.'} /> } }} />
      )}
      <RosterLifecycleDialog open={Boolean(lifecycle)} action={lifecycle?.action ?? 'publish'} loading={publishMutation.isPending || lockMutation.isPending} onClose={() => setLifecycle(null)} onConfirm={() => lifecycle?.action === 'publish' ? publishMutation.mutate(lifecycle.roster) : lifecycle && lockMutation.mutate(lifecycle.roster)} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function emptySummary(): ShiftRosterSummary {
  return { total: 0, draft: 0, published: 0, locked: 0, cancelled: 0 };
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ px: 1.5, py: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'grey.50', minWidth: 112 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ mt: 0.25 }}>{value.toLocaleString()}</Typography>
    </Box>
  );
}
