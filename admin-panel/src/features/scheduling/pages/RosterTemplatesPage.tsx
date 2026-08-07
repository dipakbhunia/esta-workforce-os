import { Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, Tooltip, Typography } from '@mui/material';
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
import { useBranches, useDepartments } from '@/features/organization/hooks';
import { deleteRosterTemplate, exportRosterTemplates, getRosterTemplates, updateRosterTemplate } from '../services/roster-templates-api';
import type { RosterTemplate, RosterTemplateScope } from '../types/roster-template.types';
import { downloadBlob, emptyRosterTemplateSummary, formatDateTime, localDateForFilename, responseBlob, rosterTemplateScopeOptions, statusLabel, statusTone, templateScopeLabel } from '../utils/roster-template-utils';

const scopeColors = ['#2563EB', '#0891B2', '#7C3AED'];

export default function RosterTemplatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<RosterTemplateScope | ''>('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [enabled, setEnabled] = useState<'true' | 'false' | ''>('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toggleTarget, setToggleTarget] = useState<RosterTemplate | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RosterTemplate | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const branches = branchesQuery.data?.data.data ?? [];
  const departments = departmentsQuery.data?.data.data ?? [];
  const templatesQuery = useQuery({
    queryKey: ['roster-templates', { page: pagination.page + 1, limit: pagination.pageSize, search, scope, branchId, departmentId, enabled }],
    queryFn: () => getRosterTemplates({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, scope: scope || undefined, branchId: branchId || undefined, departmentId: departmentId || undefined, enabled: enabled ? enabled === 'true' : undefined }),
  });
  const existenceQuery = useQuery({ queryKey: ['roster-templates', 'existence-check'], queryFn: () => getRosterTemplates({ page: 1, limit: 1 }), staleTime: 60_000 });
  const toggleMutation = useMutation({ mutationFn: (template: RosterTemplate) => updateRosterTemplate(template.id, { enabled: !template.enabled }), onSuccess: async (_, template) => { setToggleTarget(null); setToast({ severity: 'success', message: template.enabled ? 'Roster template disabled.' : 'Roster template enabled.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Template status could not be changed.' }) });
  const archiveMutation = useMutation({ mutationFn: (template: RosterTemplate) => deleteRosterTemplate(template.id), onSuccess: async () => { setArchiveTarget(null); setToast({ severity: 'success', message: 'Roster template archived.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Template could not be archived.' }) });
  const exportMutation = useMutation({ mutationFn: () => exportRosterTemplates({ search: search || undefined, scope: scope || undefined, branchId: branchId || undefined, departmentId: departmentId || undefined, enabled: enabled ? enabled === 'true' : undefined }), onSuccess: (response) => { downloadBlob(responseBlob(response), `roster-templates-${localDateForFilename()}.csv`); setToast({ severity: 'success', message: 'Roster templates CSV export started.' }); }, onError: () => setToast({ severity: 'error', message: 'Roster template export failed.' }) });

  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ['roster-templates'] }); };
  const resetPage = () => setPagination((current) => ({ ...current, page: 0 }));
  const resetFilters = () => { setSearch(''); setScope(''); setBranchId(''); setDepartmentId(''); setEnabled(''); resetPage(); };

  const rows = templatesQuery.data?.data.data ?? [];
  const meta = templatesQuery.data?.data.meta;
  const summary = templatesQuery.data?.data.summary ?? emptyRosterTemplateSummary();
  const hasFilters = Boolean(search || scope || branchId || departmentId || enabled);
  const hasAnyTemplates = (existenceQuery.data?.data.meta.total ?? summary.total) > 0;
  const isEmpty = !templatesQuery.isFetching && !templatesQuery.isError && meta?.total === 0;
  const isFilteredEmpty = hasAnyTemplates && hasFilters;
  const filteredDepartments = departments.filter((department) => !branchId || department.branchId === branchId);

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (scope) filters.push({ key: 'scope', label: 'Scope', value: rosterTemplateScopeOptions.find((option) => option.value === scope)?.label ?? scope, onRemove: () => { setScope(''); resetPage(); } });
    if (branchId) filters.push({ key: 'branch', label: 'Branch', value: branches.find((branch) => branch.id === branchId)?.name ?? 'Selected branch', onRemove: () => { setBranchId(''); setDepartmentId(''); resetPage(); } });
    if (departmentId) filters.push({ key: 'department', label: 'Department', value: departments.find((department) => department.id === departmentId)?.name ?? 'Selected department', onRemove: () => { setDepartmentId(''); resetPage(); } });
    if (enabled) filters.push({ key: 'enabled', label: 'Status', value: enabled === 'true' ? 'Active' : 'Inactive', onRemove: () => { setEnabled(''); resetPage(); } });
    return filters;
  }, [branchId, branches, departmentId, departments, enabled, scope, search]);

  const summaryText = useMemo(() => {
    if (!meta) return undefined;
    if (meta.total === 0) return hasFilters && hasAnyTemplates ? 'No roster templates match the current filters.' : undefined;
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    return `Showing ${start}-${end} of ${meta.total} roster templates${hasFilters ? ` · ${activeFilters.length} filters applied` : ''}`;
  }, [activeFilters.length, hasFilters, meta]);

  const chartData = [
    { label: 'Company', value: summary.companyScope, color: scopeColors[0] },
    { label: 'Branch', value: summary.branchScope, color: scopeColors[1] },
    { label: 'Department', value: summary.departmentScope, color: scopeColors[2] },
  ];
  const hasChartData = chartData.some((item) => item.value > 0);

  const columns = useMemo<GridColDef<RosterTemplate>[]>(() => [
    { field: 'name', headerName: 'Template Name', minWidth: 240, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.code}</Typography></Box> },
    { field: 'scope', headerName: 'Scope', minWidth: 180, valueGetter: (_, row) => templateScopeLabel(row) },
    { field: 'timezone', headerName: 'Timezone', minWidth: 150 },
    { field: 'version', headerName: 'Version', minWidth: 90, valueGetter: (_, row) => `v${row.version}` },
    { field: 'days', headerName: 'Pattern', minWidth: 180, valueGetter: (_, row) => `${row.days?.filter((day) => day.dayType === 'WORKING').length ?? 0} working days` },
    { field: 'enabled', headerName: 'Status', minWidth: 115, renderCell: ({ row }) => <StatusChip label={statusLabel(row.enabled)} tone={statusTone(row.enabled)} /> },
    { field: 'updatedAt', headerName: 'Updated At', minWidth: 170, valueGetter: (_, row) => formatDateTime(row.updatedAt) },
    { field: 'actions', headerName: 'Actions', sortable: false, filterable: false, minWidth: 190, renderCell: ({ row }) => <Stack direction="row" gap={0.25}><Tooltip title="Open"><IconButton component={RouterLink} to={`/scheduling/roster-templates/${row.id}`} size="small" aria-label={`Open ${row.name}`}><Eye size={17} /></IconButton></Tooltip><Tooltip title="Edit"><IconButton component={RouterLink} to={`/scheduling/roster-templates/${row.id}/edit`} size="small" aria-label={`Edit ${row.name}`}><Edit3 size={17} /></IconButton></Tooltip><Tooltip title={row.enabled ? 'Disable template' : 'Enable template'}><IconButton size="small" onClick={() => setToggleTarget(row)} aria-label={row.enabled ? `Disable ${row.name}` : `Enable ${row.name}`}><Power size={17} /></IconButton></Tooltip><Tooltip title="Archive template"><IconButton size="small" color="error" onClick={() => setArchiveTarget(row)} aria-label={`Archive ${row.name}`}><Archive size={17} /></IconButton></Tooltip></Stack> },
  ], []);

  return <PageLayout><PageHeader title="Roster Templates" description="Create reusable weekly roster patterns for draft shift rosters." breadcrumbs={['Admin', 'Scheduling', 'Roster Templates']} primaryActionLabel="Create Template" primaryActionTo="/scheduling/roster-templates/create" />
    <EnterpriseFilterCard title="Roster Template Filters" description="Filter templates by scope, branch, department, status, and search." loading={templatesQuery.isFetching || exportMutation.isPending} summary={summaryText} activeFilters={activeFilters} actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void templatesQuery.refetch()} disabled={templatesQuery.isFetching}>Refresh</Button><Tooltip title="Export filtered roster templates as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>{exportMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip></>} search={<EnterpriseFilterSearch value={search} label="Search templates" placeholder="Search template name, code, or notes" loading={templatesQuery.isFetching} onChange={(value) => { setSearch(value); resetPage(); }} />} filters={<><FormControl size="small" fullWidth><InputLabel id="template-scope-filter-label">Scope</InputLabel><Select labelId="template-scope-filter-label" label="Scope" value={scope} onChange={(event) => { setScope(event.target.value as RosterTemplateScope | ''); resetPage(); }}><MenuItem value="">All Scopes</MenuItem>{rosterTemplateScopeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="template-status-filter-label">Status</InputLabel><Select labelId="template-status-filter-label" label="Status" value={enabled} onChange={(event) => { setEnabled(event.target.value as 'true' | 'false' | ''); resetPage(); }}><MenuItem value="">All Statuses</MenuItem><MenuItem value="true">Active</MenuItem><MenuItem value="false">Inactive</MenuItem></Select></FormControl><FormControl size="small" fullWidth><InputLabel id="template-branch-filter-label">Branch</InputLabel><Select labelId="template-branch-filter-label" label="Branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); setDepartmentId(''); resetPage(); }} disabled={branchesQuery.isLoading}><MenuItem value="">All Branches</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="template-department-filter-label">Department</InputLabel><Select labelId="template-department-filter-label" label="Department" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); resetPage(); }} disabled={departmentsQuery.isLoading}><MenuItem value="">All Departments</MenuItem>{filteredDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}</Select></FormControl></>} />
    <EnterpriseChartCard title="Roster Templates by Scope" description={hasFilters ? 'Showing scope distribution for the current filtered roster templates.' : 'Showing scope distribution for all roster templates.'} loading={templatesQuery.isLoading} error={templatesQuery.isError} empty={false} retry={() => void templatesQuery.refetch()} height={hasChartData ? 190 : 110} accessibleSummary={`Roster template summary. Total ${summary.total}. Active ${summary.active}. Inactive ${summary.inactive}.`}><Stack gap={1.25}><Stack direction="row" gap={1} flexWrap="wrap"><Kpi label="Total" value={summary.total} /><Kpi label="Active" value={summary.active} /><Kpi label="Inactive" value={summary.inactive} /><Kpi label="Company" value={summary.companyScope} /><Kpi label="Branch" value={summary.branchScope} /><Kpi label="Department" value={summary.departmentScope} /></Stack>{hasChartData ? <><EnterpriseBarChart data={chartData} categoryKey="label" valueKey="value" colors={scopeColors} height={150} valueFormatter={(value) => value.toLocaleString()} /><EnterpriseChartLegend items={chartData.map((item) => ({ label: item.label, color: item.color, value: item.value }))} /></> : null}</Stack></EnterpriseChartCard>
    {templatesQuery.isError ? <Alert severity="error">Roster templates could not be loaded.</Alert> : null}
    {isEmpty ? <SectionCard title="Roster Templates" description={isFilteredEmpty ? 'Adjust or clear filters to broaden the result set.' : 'Create your first reusable roster template.'} action={isFilteredEmpty ? <Button variant="outlined" onClick={resetFilters}>Clear Filters</Button> : undefined}><EmptyState title={isFilteredEmpty ? 'No roster templates match the current filters' : 'No roster templates yet'} description={isFilteredEmpty ? 'Adjust or clear the active filters and try again.' : 'Create a reusable weekly pattern before applying it to draft rosters.'} /></SectionCard> : <DataTable title="Roster Templates" rows={rows} columns={columns} showSearch={false} gridProps={{ loading: templatesQuery.isFetching, paginationMode: 'server', rowCount: meta?.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 64, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title={isFilteredEmpty ? 'No roster templates match the current filters' : 'No roster templates yet'} description={isFilteredEmpty ? 'Adjust or clear the active filters and try again.' : 'Create a reusable weekly pattern before applying it to draft rosters.'} /> } }} />}
    <ConfirmDialog open={Boolean(toggleTarget)} title={toggleTarget?.enabled ? 'Disable Roster Template' : 'Enable Roster Template'} description={toggleTarget?.enabled ? 'Disabled templates cannot be applied to draft rosters.' : 'Enabled templates can be applied to draft rosters.'} confirmLabel={toggleTarget?.enabled ? 'Disable Template' : 'Enable Template'} loading={toggleMutation.isPending} onClose={() => setToggleTarget(null)} onConfirm={() => toggleTarget && toggleMutation.mutate(toggleTarget)} />
    <ConfirmDialog open={Boolean(archiveTarget)} title="Archive Roster Template" description="This removes the template from future roster planning. Existing roster days remain unchanged." confirmLabel="Archive Template" loading={archiveMutation.isPending} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)} />
    <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
  </PageLayout>;
}

function Kpi({ label, value }: { label: string; value: number }) { return <Box sx={{ minWidth: 108, px: 1.4, py: 0.9, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={900}>{value.toLocaleString()}</Typography></Box>; }
