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
import { DateRangePicker, createCustomDateRangeValue, formatDateRangeChip } from '@/components/enterprise/date-range';
import { EnterpriseFilterCard, EnterpriseFilterSearch, type EnterpriseActiveFilter } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useBranches, useDepartments } from '@/features/organization/hooks';
import { getEmployees } from '@/features/people/services/employees-api';
import { deleteWeeklyOffRule, exportWeeklyOffRules, getWeeklyOffRules, updateWeeklyOffRule } from '../services/weekly-off-rules-api';
import type { WeeklyOffRule, WeeklyOffRuleScope, WeeklyOffRuleSummary } from '../types/weekly-off-rule.types';
import { employeeOptionLabel, emptyWeeklyOffSummary, formatDate, formatDateTime, ruleModeLabel, ruleScope, scopeLabel, statusLabel, weeklyPatternLabel, weekdays } from '../utils/weekly-off-rule-utils';

const scopeOptions: Array<{ value: WeeklyOffRuleScope; label: string }> = [
  { value: 'COMPANY', label: 'Company' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'EMPLOYEE', label: 'Employee' },
];
const scopeColors = ['#2563EB', '#7C3AED', '#0891B2', '#EA580C'];

export default function WeeklyOffRulesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<WeeklyOffRuleScope | ''>('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [enabled, setEnabled] = useState<'true' | 'false' | ''>('');
  const [day, setDay] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toggleTarget, setToggleTarget] = useState<WeeklyOffRule | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WeeklyOffRule | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const employeesQuery = useQuery({ queryKey: ['employees', { selector: 'weekly-off-rules-list' }], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const rulesQuery = useQuery({
    queryKey: ['weekly-off-rules', { page: pagination.page + 1, limit: pagination.pageSize, search, scope, branchId, departmentId, employeeId, enabled, day, dateFrom, dateTo }],
    queryFn: () => getWeeklyOffRules({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, scope: scope || undefined, branchId: branchId || undefined, departmentId: departmentId || undefined, employeeId: employeeId || undefined, enabled: enabled ? enabled === 'true' : undefined, day: day === '' ? undefined : day, ruleType: 'FIXED_WEEKDAYS', dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: WeeklyOffRule) => updateWeeklyOffRule(rule.id, { enabled: !rule.enabled }),
    onSuccess: async (_, rule) => { setToggleTarget(null); setToast({ severity: 'success', message: rule.enabled ? 'Weekly off rule disabled.' : 'Weekly off rule enabled.' }); await queryClient.invalidateQueries({ queryKey: ['weekly-off-rules'] }); },
    onError: () => setToast({ severity: 'error', message: 'Rule status could not be changed.' }),
  });
  const archiveMutation = useMutation({
    mutationFn: (rule: WeeklyOffRule) => deleteWeeklyOffRule(rule.id),
    onSuccess: async () => { setArchiveTarget(null); setToast({ severity: 'success', message: 'Weekly off rule archived.' }); await queryClient.invalidateQueries({ queryKey: ['weekly-off-rules'] }); },
    onError: () => setToast({ severity: 'error', message: 'Weekly off rule could not be archived.' }),
  });
  const exportMutation = useMutation({
    mutationFn: () => exportWeeklyOffRules({ search: search || undefined, scope: scope || undefined, branchId: branchId || undefined, departmentId: departmentId || undefined, employeeId: employeeId || undefined, enabled: enabled ? enabled === 'true' : undefined, day: day === '' ? undefined : day, ruleType: 'FIXED_WEEKDAYS', dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    onSuccess: (response) => { downloadBlob(response.data, `weekly-off-rules-${todayForFilename()}.csv`); setToast({ severity: 'success', message: 'Weekly off rules CSV export started.' }); },
    onError: () => setToast({ severity: 'error', message: 'Weekly off rules export failed. Narrow filters and try again.' }),
  });

  const rows = rulesQuery.data?.data.data ?? [];
  const meta = rulesQuery.data?.data.meta;
  const summaryData = rulesQuery.data?.data.summary ?? emptyWeeklyOffSummary();
  const branches = branchesQuery.data?.data.data ?? [];
  const departments = departmentsQuery.data?.data.data ?? [];
  const employees = employeesQuery.data?.data.data ?? [];
  const hasFilters = Boolean(search || scope || branchId || departmentId || employeeId || enabled || day !== '' || dateFrom || dateTo);
  const isEmpty = !rulesQuery.isFetching && !rulesQuery.isError && meta?.total === 0;

  const resetPage = () => setPagination((current) => ({ ...current, page: 0 }));
  const resetFilters = () => { setSearch(''); setScope(''); setBranchId(''); setDepartmentId(''); setEmployeeId(''); setEnabled(''); setDay(''); setDateFrom(''); setDateTo(''); resetPage(); };
  const setRange = (from: string, to: string) => { setDateFrom(from); setDateTo(to); resetPage(); };
  const clearRange = () => setRange('', '');
  const filteredDepartments = departments.filter((department) => !branchId || department.branchId === branchId);
  const filteredEmployees = employees.filter((employee) => (!branchId || employee.branchId === branchId) && (!departmentId || employee.departmentId === departmentId));

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (scope) filters.push({ key: 'scope', label: 'Scope', value: scopeOptions.find((option) => option.value === scope)?.label ?? scope, onRemove: () => { setScope(''); resetPage(); } });
    if (branchId) filters.push({ key: 'branch', label: 'Branch', value: branches.find((branch) => branch.id === branchId)?.name ?? 'Selected branch', onRemove: () => { setBranchId(''); setDepartmentId(''); setEmployeeId(''); resetPage(); } });
    if (departmentId) filters.push({ key: 'department', label: 'Department', value: departments.find((department) => department.id === departmentId)?.name ?? 'Selected department', onRemove: () => { setDepartmentId(''); setEmployeeId(''); resetPage(); } });
    if (employeeId) filters.push({ key: 'employee', label: 'Employee', value: employeeOptionLabel(employees.find((employee) => employee.id === employeeId) ?? { employeeCode: 'Selected employee' }), onRemove: () => { setEmployeeId(''); resetPage(); } });
    if (enabled) filters.push({ key: 'enabled', label: 'Status', value: enabled === 'true' ? 'Active' : 'Inactive', onRemove: () => { setEnabled(''); resetPage(); } });
    if (day !== '') filters.push({ key: 'day', label: 'Day', value: weekdays.find((option) => option.value === day)?.label ?? 'Selected day', onRemove: () => { setDay(''); resetPage(); } });
    if (dateFrom && dateTo) filters.push({ key: 'dateRange', label: 'Date Range', value: formatDateRangeChip({ startDate: dateFrom, endDate: dateTo }), onRemove: clearRange });
    return filters;
  }, [branchId, branches, dateFrom, dateTo, day, departmentId, departments, employeeId, employees, enabled, scope, search]);

  const summaryText = useMemo(() => {
    if (!meta) return undefined;
    if (meta.total === 0) return hasFilters ? `${activeFilters.length} filters applied` : undefined;
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    return `Showing ${start}-${end} of ${meta.total} weekly off rules`;
  }, [activeFilters.length, hasFilters, meta]);
  const chartData = [
    { label: 'Company', value: summaryData.companyScope, color: scopeColors[0] },
    { label: 'Branch', value: summaryData.branchScope, color: scopeColors[1] },
    { label: 'Department', value: summaryData.departmentScope, color: scopeColors[2] },
    { label: 'Employee', value: summaryData.employeeScope, color: scopeColors[3] },
  ];

  const columns = useMemo<GridColDef<WeeklyOffRule>[]>(() => [
    { field: 'name', headerName: 'Rule Name', minWidth: 220, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.timezone}</Typography></Box> },
    { field: 'scope', headerName: 'Scope', minWidth: 210, valueGetter: (_, row) => scopeLabel(row) },
    { field: 'branch', headerName: 'Branch', minWidth: 160, valueGetter: (_, row) => row.branch?.name ?? row.employee?.branch?.name ?? '-' },
    { field: 'department', headerName: 'Department', minWidth: 170, valueGetter: (_, row) => row.department?.name ?? row.employee?.department?.name ?? '-' },
    { field: 'employee', headerName: 'Employee', minWidth: 180, valueGetter: (_, row) => row.employee ? employeeOptionLabel(row.employee) : '-' },
    { field: 'pattern', headerName: 'Weekly Pattern', minWidth: 220, valueGetter: (_, row) => weeklyPatternLabel(row.weekdays) },
    { field: 'ruleType', headerName: 'Rule Mode', minWidth: 140, valueGetter: () => ruleModeLabel() },
    { field: 'effectiveRange', headerName: 'Effective Range', minWidth: 210, valueGetter: (_, row) => `${formatDate(row.effectiveFrom)} - ${formatDate(row.effectiveTo)}` },
    { field: 'priority', headerName: 'Priority', minWidth: 95 },
    { field: 'enabled', headerName: 'Status', minWidth: 115, renderCell: ({ row }) => <StatusChip label={statusLabel(row.enabled)} tone={row.enabled ? 'success' : 'neutral'} /> },
    { field: 'updatedAt', headerName: 'Last Updated', minWidth: 165, valueGetter: (_, row) => formatDateTime(row.updatedAt) },
    { field: 'actions', headerName: 'Actions', sortable: false, filterable: false, minWidth: 190, renderCell: ({ row }) => <Stack direction="row" gap={0.25}><Tooltip title="View"><IconButton component={RouterLink} to={`/scheduling/weekly-off-rules/${row.id}`} size="small"><Eye size={17} /></IconButton></Tooltip><Tooltip title="Edit"><IconButton component={RouterLink} to={`/scheduling/weekly-off-rules/${row.id}/edit`} size="small"><Edit3 size={17} /></IconButton></Tooltip><Tooltip title={row.enabled ? 'Disable rule' : 'Enable rule'}><IconButton size="small" onClick={() => setToggleTarget(row)}><Power size={17} /></IconButton></Tooltip><Tooltip title="Archive rule"><IconButton size="small" color="error" onClick={() => setArchiveTarget(row)}><Archive size={17} /></IconButton></Tooltip></Stack> },
  ], []);

  return (
    <PageLayout>
      <PageHeader title="Weekly Off Rules" description="Configure weekly non-working day rules for company, branch, department, or employee scopes." breadcrumbs={['Admin', 'Scheduling', 'Weekly Off Rules']} primaryActionLabel="Create Rule" primaryActionTo="/scheduling/weekly-off-rules/create" />
      <EnterpriseFilterCard title="Weekly Off Filters" description="Filter rules by scope, status, weekday, organization, employee, and effective coverage." loading={rulesQuery.isFetching || exportMutation.isPending} summary={summaryText} activeFilters={activeFilters} actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void rulesQuery.refetch()} disabled={rulesQuery.isFetching}>Refresh</Button><Tooltip title="Export all filtered weekly off rules as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>{exportMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip></>} search={<EnterpriseFilterSearch value={search} label="Search rules" placeholder="Search rule, employee, branch, or department" loading={rulesQuery.isFetching} onChange={(value) => { setSearch(value); resetPage(); }} />} filters={<><FormControl size="small" fullWidth><InputLabel id="weekly-scope-filter-label">Scope</InputLabel><Select labelId="weekly-scope-filter-label" label="Scope" value={scope} onChange={(event) => { setScope(event.target.value as WeeklyOffRuleScope | ''); resetPage(); }}><MenuItem value="">All Scopes</MenuItem>{scopeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="weekly-status-filter-label">Status</InputLabel><Select labelId="weekly-status-filter-label" label="Status" value={enabled} onChange={(event) => { setEnabled(event.target.value as 'true' | 'false' | ''); resetPage(); }}><MenuItem value="">All Statuses</MenuItem><MenuItem value="true">Active</MenuItem><MenuItem value="false">Inactive</MenuItem></Select></FormControl><FormControl size="small" fullWidth><InputLabel id="weekly-day-filter-label">Day</InputLabel><Select labelId="weekly-day-filter-label" label="Day" value={day} onChange={(event) => { const value = String(event.target.value); setDay(value === '' ? '' : Number(value)); resetPage(); }}><MenuItem value="">All Days</MenuItem>{weekdays.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="weekly-branch-filter-label">Branch</InputLabel><Select labelId="weekly-branch-filter-label" label="Branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); setDepartmentId(''); setEmployeeId(''); resetPage(); }} disabled={branchesQuery.isLoading}><MenuItem value="">All Branches</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="weekly-department-filter-label">Department</InputLabel><Select labelId="weekly-department-filter-label" label="Department" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setEmployeeId(''); resetPage(); }} disabled={departmentsQuery.isLoading}><MenuItem value="">All Departments</MenuItem>{filteredDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="weekly-employee-filter-label">Employee</InputLabel><Select labelId="weekly-employee-filter-label" label="Employee" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); resetPage(); }} disabled={employeesQuery.isLoading}><MenuItem value="">All Employees</MenuItem>{filteredEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeOptionLabel(employee)}</MenuItem>)}</Select></FormControl><Box sx={{ width: '100%', minWidth: 0 }}><DateRangePicker label="Effective Date Range" value={createCustomDateRangeValue(dateFrom, dateTo)} defaultPreset="customRange" mode="filter" onChange={(value) => setRange(value.dateFrom, value.dateTo)} onClear={clearRange} helperText="Rules overlapping this range." /></Box></>} />
      <EnterpriseChartCard title="Weekly Off Rules by Scope" description={hasFilters ? 'Showing scope distribution for the current filtered weekly off rules.' : 'Showing scope distribution for all weekly off rules.'} loading={rulesQuery.isLoading} error={rulesQuery.isError} empty={false} retry={() => void rulesQuery.refetch()} height={190} accessibleSummary={`Weekly off rule summary. Total ${summaryData.total}. Active ${summaryData.active}. Inactive ${summaryData.inactive}.`}>
        <Stack gap={1.5}><Stack direction="row" gap={1} flexWrap="wrap"><Kpi label="Total Rules" value={summaryData.total} /><Kpi label="Active" value={summaryData.active} /><Kpi label="Inactive" value={summaryData.inactive} /><Kpi label="Company" value={summaryData.companyScope} /><Kpi label="Branch" value={summaryData.branchScope} /><Kpi label="Department" value={summaryData.departmentScope} /><Kpi label="Employee" value={summaryData.employeeScope} /></Stack><EnterpriseBarChart data={chartData} categoryKey="label" valueKey="value" valueFormatter={(value) => value.toLocaleString()} colors={scopeColors} height={180} /><EnterpriseChartLegend items={chartData.map((item) => ({ label: item.label, color: item.color, value: item.value }))} /></Stack>
      </EnterpriseChartCard>
      {rulesQuery.isError ? <Alert severity="error">Weekly off rules could not be loaded.</Alert> : null}
      {isEmpty ? <SectionCard title="Weekly Off Rules" description={hasFilters ? 'Adjust or clear filters to broaden the result set.' : 'Create your first weekly off rule to define recurring non-working days.'} action={!hasFilters ? <Button component={RouterLink} to="/scheduling/weekly-off-rules/create" variant="contained">Create Rule</Button> : undefined}><EmptyState title={hasFilters ? 'No weekly off rules match the current filters' : 'No Weekly Off Rules'} description={hasFilters ? 'Adjust or clear the active filters and try again.' : 'Create your first weekly off rule to define recurring non-working days.'} /></SectionCard> : <DataTable title="Weekly Off Rules" rows={rows} columns={columns} showSearch={false} gridProps={{ loading: rulesQuery.isFetching, paginationMode: 'server', rowCount: meta?.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 64, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title={hasFilters ? 'No weekly off rules match the current filters' : 'No Weekly Off Rules'} description={hasFilters ? 'Adjust or clear the active filters and try again.' : 'Create your first weekly off rule to define recurring non-working days.'} /> } }} />}
      <ConfirmDialog open={Boolean(toggleTarget)} title={toggleTarget?.enabled ? 'Disable Weekly Off Rule' : 'Enable Weekly Off Rule'} description={toggleTarget?.enabled ? 'The rule stops applying to future work-calendar resolution. Existing attendance snapshots remain unchanged.' : 'The rule may begin applying according to its effective dates and priority.'} confirmLabel={toggleTarget?.enabled ? 'Disable Rule' : 'Enable Rule'} loading={toggleMutation.isPending} onClose={() => setToggleTarget(null)} onConfirm={() => toggleTarget && toggleMutation.mutate(toggleTarget)} />
      <ConfirmDialog open={Boolean(archiveTarget)} title="Archive Weekly Off Rule" description="This soft-removes the rule from future resolution. Existing attendance snapshots remain unchanged." confirmLabel="Archive Rule" loading={archiveMutation.isPending} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <Box sx={{ minWidth: 108, px: 1.4, py: 0.9, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={900}>{value.toLocaleString()}</Typography></Box>;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function todayForFilename() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}