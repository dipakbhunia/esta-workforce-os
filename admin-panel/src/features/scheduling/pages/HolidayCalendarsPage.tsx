import { Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Edit3, Eye, Power, RefreshCw, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { EnterpriseBarChart, EnterpriseChartCard, EnterpriseChartLegend } from '@/components/enterprise/charts';
import { EnterpriseFilterCard, EnterpriseFilterSearch, type EnterpriseActiveFilter } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useBranches } from '@/features/organization/hooks';
import { deleteHolidayCalendar, exportHolidayCalendars, getHolidayCalendars, updateHolidayCalendar } from '../services/holiday-calendars-api';
import type { HolidayCalendar, HolidayCalendarScope } from '../types/holiday-calendar.types';
import { calendarScopeLabel, emptyHolidayCalendarSummary, formatDateTime, statusLabel } from '../utils/holiday-calendar-utils';

const scopeOptions: Array<{ value: HolidayCalendarScope; label: string }> = [{ value: 'COMPANY', label: 'Company' }, { value: 'BRANCH', label: 'Branch' }];
const chartColors = ['#2563EB', '#0891B2'];
const currentYear = new Date().getFullYear();

export default function HolidayCalendarsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<HolidayCalendarScope | ''>('');
  const [branchId, setBranchId] = useState('');
  const [enabled, setEnabled] = useState<'true' | 'false' | ''>('');
  const [year, setYear] = useState<number | ''>(currentYear);
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toggleTarget, setToggleTarget] = useState<HolidayCalendar | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<HolidayCalendar | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const branchesQuery = useBranches();
  const branches = branchesQuery.data?.data.data ?? [];
  const calendarsQuery = useQuery({
    queryKey: ['holiday-calendars', { page: pagination.page + 1, limit: pagination.pageSize, search, scope, branchId, enabled, year }],
    queryFn: () => getHolidayCalendars({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, scope: scope || undefined, branchId: branchId || undefined, enabled: enabled ? enabled === 'true' : undefined, year: year === '' ? undefined : year }),
  });
  const calendarsExistQuery = useQuery({
    queryKey: ['holiday-calendars', 'existence-check'],
    queryFn: () => getHolidayCalendars({ page: 1, limit: 1 }),
    staleTime: 60_000,
  });
  const toggleMutation = useMutation({ mutationFn: (calendar: HolidayCalendar) => updateHolidayCalendar(calendar.id, { enabled: !calendar.enabled }), onSuccess: async (_, calendar) => { setToggleTarget(null); setToast({ severity: 'success', message: calendar.enabled ? 'Holiday calendar disabled.' : 'Holiday calendar enabled.' }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendars'] }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendars', 'existence-check'] }); }, onError: () => setToast({ severity: 'error', message: 'Calendar status could not be changed.' }) });
  const archiveMutation = useMutation({ mutationFn: (calendar: HolidayCalendar) => deleteHolidayCalendar(calendar.id), onSuccess: async () => { setArchiveTarget(null); setToast({ severity: 'success', message: 'Holiday calendar archived.' }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendars'] }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendars', 'existence-check'] }); }, onError: () => setToast({ severity: 'error', message: 'Holiday calendar could not be archived.' }) });
  const exportMutation = useMutation({ mutationFn: () => exportHolidayCalendars({ search: search || undefined, scope: scope || undefined, branchId: branchId || undefined, enabled: enabled ? enabled === 'true' : undefined, year: year === '' ? undefined : year }), onSuccess: (response) => { downloadBlob(response.data, `holiday-calendars-${todayForFilename()}.csv`); setToast({ severity: 'success', message: 'Holiday calendars CSV export started.' }); }, onError: () => setToast({ severity: 'error', message: 'Holiday calendar export failed.' }) });

  const rows = calendarsQuery.data?.data.data ?? [];
  const meta = calendarsQuery.data?.data.meta;
  const summary = calendarsQuery.data?.data.summary ?? emptyHolidayCalendarSummary();
  const hasUserFilters = Boolean(search || scope || branchId || enabled || year === '' || year !== currentYear);
  const hasQueryFilters = Boolean(search || scope || branchId || enabled || year !== '');
  const totalCalendars = calendarsExistQuery.data?.data.meta.total ?? summary.total;
  const hasAnyCalendars = totalCalendars > 0;
  const isEmpty = !calendarsQuery.isFetching && !calendarsQuery.isError && meta?.total === 0;
  const showOnboardingEmpty = isEmpty && !hasAnyCalendars;
  const showFilteredEmpty = isEmpty && hasAnyCalendars;
  const hasChartData = summary.companyScope + summary.branchScope > 0;

  const resetPage = () => setPagination((current) => ({ ...current, page: 0 }));
  const resetFilters = () => { setSearch(''); setScope(''); setBranchId(''); setEnabled(''); setYear(currentYear); resetPage(); };

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (scope) filters.push({ key: 'scope', label: 'Scope', value: scopeOptions.find((option) => option.value === scope)?.label ?? scope, onRemove: () => { setScope(''); resetPage(); } });
    if (branchId) filters.push({ key: 'branch', label: 'Branch', value: branches.find((branch) => branch.id === branchId)?.name ?? 'Selected branch', onRemove: () => { setBranchId(''); resetPage(); } });
    if (enabled) filters.push({ key: 'enabled', label: 'Status', value: enabled === 'true' ? 'Active' : 'Inactive', onRemove: () => { setEnabled(''); resetPage(); } });
    if (year === '' || year !== currentYear) filters.push({ key: 'year', label: 'Year', value: year === '' ? 'All years' : String(year), onRemove: () => { setYear(currentYear); resetPage(); } });
    return filters;
  }, [branchId, branches, enabled, scope, search, year]);

  const summaryText = useMemo(() => {
    if (!meta) return undefined;
    if (meta.total === 0) return hasUserFilters ? `${activeFilters.length} filters applied` : showOnboardingEmpty ? 'No holiday calendars yet' : undefined;
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    return `Showing ${start}-${end} of ${meta.total} holiday calendars${hasUserFilters ? ` · ${activeFilters.length} filters applied` : ''}`;
  }, [activeFilters.length, hasUserFilters, meta, showOnboardingEmpty]);

  const chartData = [{ label: 'Company', value: summary.companyScope, color: chartColors[0] }, { label: 'Branch', value: summary.branchScope, color: chartColors[1] }];
  const columns = useMemo<GridColDef<HolidayCalendar>[]>(() => [
    { field: 'name', headerName: 'Calendar Name', minWidth: 230, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.description || row.timezone}</Typography></Box> },
    { field: 'scope', headerName: 'Scope', minWidth: 170, valueGetter: (_, row) => calendarScopeLabel(row) },
    { field: 'branch', headerName: 'Branch', minWidth: 160, valueGetter: (_, row) => row.branch?.name ?? '-' },
    { field: 'year', headerName: 'Year', minWidth: 95, valueGetter: (_, row) => row.year ?? '-' },
    { field: 'timezone', headerName: 'Timezone', minWidth: 150 },
    { field: 'holidayCount', headerName: 'Holidays', minWidth: 105, valueGetter: (_, row) => row.holidayCount ?? row.holidays?.length ?? 0 },
    { field: 'mandatoryCount', headerName: 'Mandatory', minWidth: 110, valueGetter: (_, row) => row.mandatoryCount ?? 0 },
    { field: 'optionalCount', headerName: 'Optional', minWidth: 100, valueGetter: (_, row) => row.optionalCount ?? 0 },
    { field: 'enabled', headerName: 'Status', minWidth: 115, renderCell: ({ row }) => <StatusChip label={statusLabel(row.enabled)} tone={row.enabled ? 'success' : 'neutral'} /> },
    { field: 'updatedAt', headerName: 'Updated At', minWidth: 170, valueGetter: (_, row) => formatDateTime(row.updatedAt) },
    { field: 'actions', headerName: 'Actions', sortable: false, filterable: false, minWidth: 190, renderCell: ({ row }) => <Stack direction="row" gap={0.25}><Tooltip title="Open"><IconButton component={RouterLink} to={`/scheduling/holiday-calendar/${row.id}`} size="small" aria-label={`Open ${row.name}`}><Eye size={17} /></IconButton></Tooltip><Tooltip title="Edit"><IconButton component={RouterLink} to={`/scheduling/holiday-calendar/${row.id}/edit`} size="small" aria-label={`Edit ${row.name}`}><Edit3 size={17} /></IconButton></Tooltip><Tooltip title={row.enabled ? 'Disable calendar' : 'Enable calendar'}><IconButton size="small" onClick={() => setToggleTarget(row)} aria-label={row.enabled ? `Disable ${row.name}` : `Enable ${row.name}`}><Power size={17} /></IconButton></Tooltip><Tooltip title="Archive calendar"><IconButton size="small" color="error" onClick={() => setArchiveTarget(row)} aria-label={`Archive ${row.name}`}><Archive size={17} /></IconButton></Tooltip></Stack> },
  ], []);

  return <PageLayout><PageHeader title="Holiday Calendar" description="Manage company and branch holiday calendars for non-working holidays." breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar']} primaryActionLabel="Create Calendar" primaryActionTo="/scheduling/holiday-calendar/create" /><EnterpriseFilterCard title="Holiday Calendar Filters" description="Filter calendars by scope, branch, year, status, and search." loading={calendarsQuery.isFetching || exportMutation.isPending} summary={summaryText} activeFilters={activeFilters} actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasUserFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void calendarsQuery.refetch()} disabled={calendarsQuery.isFetching}>Refresh</Button><Tooltip title="Export all filtered calendars as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>{exportMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip></>} search={<EnterpriseFilterSearch value={search} label="Search calendars" placeholder="Search calendar, branch, or notes" loading={calendarsQuery.isFetching} onChange={(value) => { setSearch(value); resetPage(); }} />} filters={<><FormControl size="small" fullWidth><InputLabel id="holiday-scope-filter-label">Scope</InputLabel><Select labelId="holiday-scope-filter-label" label="Scope" value={scope} onChange={(event) => { setScope(event.target.value as HolidayCalendarScope | ''); resetPage(); }}><MenuItem value="">All Scopes</MenuItem>{scopeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="holiday-status-filter-label">Status</InputLabel><Select labelId="holiday-status-filter-label" label="Status" value={enabled} onChange={(event) => { setEnabled(event.target.value as 'true' | 'false' | ''); resetPage(); }}><MenuItem value="">All Statuses</MenuItem><MenuItem value="true">Active</MenuItem><MenuItem value="false">Inactive</MenuItem></Select></FormControl><FormControl size="small" fullWidth><InputLabel id="holiday-branch-filter-label">Branch</InputLabel><Select labelId="holiday-branch-filter-label" label="Branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); resetPage(); }} disabled={branchesQuery.isLoading}><MenuItem value="">All Branches</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</Select></FormControl><TextField size="small" type="number" label="Year" fullWidth value={year} onChange={(event) => { const value = event.target.value; setYear(value ? Number(value) : ''); resetPage(); }} inputProps={{ min: 1900, max: 2200 }} /></>} />
    <EnterpriseChartCard title="Holiday Calendars by Scope" description={hasUserFilters ? 'Showing scope distribution for the current filtered holiday calendars.' : 'Showing scope distribution for all holiday calendars.'} loading={calendarsQuery.isLoading} error={calendarsQuery.isError} empty={false} retry={() => void calendarsQuery.refetch()} height={hasChartData ? 190 : 120} accessibleSummary={`Holiday calendar summary. Total ${summary.total}. Active ${summary.active}. Inactive ${summary.inactive}.`}><Stack gap={1.25}><Stack direction="row" gap={1} flexWrap="wrap"><Kpi label="Total" value={summary.total} /><Kpi label="Active" value={summary.active} /><Kpi label="Inactive" value={summary.inactive} /><Kpi label="Company" value={summary.companyScope} /><Kpi label="Branch" value={summary.branchScope} /><Kpi label="Total Holidays" value={summary.totalHolidays} /></Stack>{hasChartData ? <><EnterpriseBarChart data={chartData} categoryKey="label" valueKey="value" colors={chartColors} height={150} valueFormatter={(value) => value.toLocaleString()} /><EnterpriseChartLegend items={chartData.map((item) => ({ label: item.label, color: item.color, value: item.value }))} /></> : <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, border: '1px dashed', borderColor: 'divider', bgcolor: 'grey.50' }}><Typography variant="body2" color="text.secondary">No scope distribution to display yet.</Typography></Box>}</Stack></EnterpriseChartCard>
    {calendarsQuery.isError ? <Alert severity="error">Holiday calendars could not be loaded.</Alert> : null}
    {isEmpty ? <SectionCard title="Holiday Calendars" description={showFilteredEmpty ? 'Adjust or clear filters to broaden the result set.' : 'Create your first company or branch holiday calendar to manage non-working holidays.'} action={showOnboardingEmpty ? <Button component={RouterLink} to="/scheduling/holiday-calendar/create" variant="contained">Create Calendar</Button> : showFilteredEmpty ? <Button variant="outlined" onClick={resetFilters}>Clear Filters</Button> : undefined}><EmptyState title={showFilteredEmpty ? 'No holiday calendars match the current filters' : 'No holiday calendars yet'} description={showFilteredEmpty ? 'Adjust or clear the active filters and try again.' : 'Create your first company or branch holiday calendar to manage non-working holidays.'} /></SectionCard> : <DataTable title="Holiday Calendars" rows={rows} columns={columns} showSearch={false} gridProps={{ loading: calendarsQuery.isFetching, paginationMode: 'server', rowCount: meta?.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 64, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title={hasUserFilters ? 'No holiday calendars match the current filters' : 'No holiday calendars yet'} description={hasUserFilters ? 'Adjust or clear the active filters and try again.' : 'Create your first company or branch holiday calendar to manage non-working holidays.'} /> } }} />}
    <ConfirmDialog open={Boolean(toggleTarget)} title={toggleTarget?.enabled ? 'Disable Holiday Calendar' : 'Enable Holiday Calendar'} description={toggleTarget?.enabled ? 'This calendar will stop applying to future scheduling decisions. Existing attendance snapshots remain unchanged.' : 'This calendar can apply to future scheduling decisions for its selected scope.'} confirmLabel={toggleTarget?.enabled ? 'Disable Calendar' : 'Enable Calendar'} loading={toggleMutation.isPending} onClose={() => setToggleTarget(null)} onConfirm={() => toggleTarget && toggleMutation.mutate(toggleTarget)} /><ConfirmDialog open={Boolean(archiveTarget)} title="Archive Holiday Calendar" description="This removes the calendar from future scheduling. Existing attendance snapshots remain unchanged." confirmLabel="Archive Calendar" loading={archiveMutation.isPending} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)} /><Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar></PageLayout>;
}

function Kpi({ label, value }: { label: string; value: number }) { return <Box sx={{ minWidth: 108, px: 1.4, py: 0.9, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={900}>{value.toLocaleString()}</Typography></Box>; }
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function todayForFilename() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }