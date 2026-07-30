import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, FilePlus2, Search, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue, type DateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { useAuth } from '@/features/auth';
import { useBranches } from '@/features/organization/hooks/useBranches';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { getEmployees } from '@/features/people/services/employees-api';
import {
  createApplicationProductivityRule,
  createWebsiteProductivityRule,
  exportProductivityCoverage,
  getProductivityCoverage,
} from '../services/monitoring-api';
import type {
  ProductivityCategory,
  ProductivityCoverageApplication,
  ProductivityCoverageWebsite,
  ProductivityEmployeeCoverageRow,
} from '../types/monitoring.types';
import { downloadCsv } from '../utils/download-csv';
import { formatDateTime, formatDuration } from '../utils/monitoring-format';

const defaultRange = createDateRangeValue('currentWeek');
const categories: ProductivityCategory[] = ['PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE'];

type QuickRuleTarget =
  | { kind: 'application'; label: string; value: string; normalized: string }
  | { kind: 'website'; label: string; value: string; normalized: string };

export default function ProductivityCoveragePage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const canManageRules = roles.includes('SUPER_ADMIN') || roles.includes('COMPANY_ADMIN') || roles.includes('HR');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);
  const [target, setTarget] = useState<QuickRuleTarget | null>(null);
  const [category, setCategory] = useState<ProductivityCategory>('PRODUCTIVE');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const params = {
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    search: search || undefined,
    employeeId: employeeId || undefined,
    departmentId: departmentId || undefined,
    branchId: branchId || undefined,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  };

  const coverageQuery = useQuery({
    queryKey: ['monitoring-productivity-coverage', params],
    queryFn: () => getProductivityCoverage(params),
  });
  const employeesQuery = useQuery({ queryKey: ['employees', { selector: true, productivityCoverage: true }], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('No rule selected');
      return target.kind === 'application'
        ? createApplicationProductivityRule({ applicationName: target.value, category, notes, enabled: true })
        : createWebsiteProductivityRule({ hostname: target.value, category, notes, enabled: true });
    },
    onSuccess: async () => {
      setTarget(null);
      setNotes('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monitoring-productivity-coverage'] }),
        queryClient.invalidateQueries({ queryKey: ['monitoring-productivity-analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['productivity-rules'] }),
      ]);
      setToast('Classification rule created. Historical usage will reclassify on refresh.');
    },
    onError: () => setToast('Rule could not be created. Check duplicate rules or permissions.'),
  });

  const data = coverageQuery.data?.data;
  const employeeRows = data?.employeeCoverage ?? [];

  const columns = useMemo<GridColDef<ProductivityEmployeeCoverageRow>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 260, flex: 1, renderCell: ({ row }) => <AvatarCell name={row.employee.name} email={row.employee.email} /> },
    { field: 'department', headerName: 'Department', minWidth: 150, valueGetter: (_, row) => row.department?.name ?? 'Not assigned' },
    { field: 'branch', headerName: 'Branch', minWidth: 140, valueGetter: (_, row) => row.branch?.name ?? 'Not assigned' },
    { field: 'classifiedSeconds', headerName: 'Classified', minWidth: 130, valueGetter: (_, row) => formatDuration(row.classifiedSeconds) },
    { field: 'unclassifiedSeconds', headerName: 'Unclassified', minWidth: 140, valueGetter: (_, row) => formatDuration(row.unclassifiedSeconds) },
    {
      field: 'coveragePercentage',
      headerName: 'Coverage',
      minWidth: 180,
      renderCell: ({ row }) => <CoverageBar value={row.coveragePercentage} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 140,
      sortable: false,
      renderCell: ({ row }) => <Button size="small" component={RouterLink} to={`/monitoring/productivity/employees/${row.employeeId}`}>View Details</Button>,
    },
  ], []);

  function updateDateRange(value: DateRangeValue) {
    setDateRange(value);
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDepartmentId('');
    setBranchId('');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  async function exportCsv() {
    const response = await exportProductivityCoverage(params);
    downloadCsv('productivity-coverage.csv', response.data);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Classification Coverage"
        description="Find the highest-impact unclassified applications and hostnames, then create rules to improve productivity analytics coverage."
        breadcrumbs={['Admin', 'Monitoring', 'Productivity', 'Classification Coverage']}
      />
      {toast && <Alert severity={toast.includes('could not') ? 'error' : 'success'} onClose={() => setToast(null)}>{toast}</Alert>}
      {data && (
        <SummaryCardsContainer minCardWidth={180}>
          <StatCard label="Coverage %" value={`${data.summary.classificationCoveragePercentage}%`} helper="Classified / tracked time" icon={ShieldCheck} tone="#2563EB" />
          <StatCard label="Classified Time" value={formatDuration(data.summary.classifiedSeconds)} helper="Productive, neutral, unproductive" icon={CheckCircle2} tone="#16A34A" />
          <StatCard label="Unclassified Time" value={formatDuration(data.summary.unclassifiedSeconds)} helper="Needs classification rules" icon={AlertTriangle} tone="#F59E0B" />
          <StatCard label="Unclassified Apps" value={String(data.summary.unclassifiedApplicationCount)} helper="Unique normalized apps" icon={Search} tone="#7C3AED" />
          <StatCard label="Unclassified Websites" value={String(data.summary.unclassifiedWebsiteCount)} helper="Unique hostnames only" icon={Clock} tone="#0F766E" />
          <StatCard label="Employees Affected" value={String(data.summary.employeesAffected)} helper="Employees with unclassified time" icon={Users} tone="#DC2626" />
        </SummaryCardsContainer>
      )}
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => coverageQuery.refetch()} /><ExportButton onClick={exportCsv} /></>}>
        <SearchFilter placeholder="Search employee, app, website" value={search} onChange={(value) => updateFilter(setSearch, value)} />
        <DateRangePicker value={dateRange} onChange={updateDateRange} defaultPreset="currentWeek" />
        <TextField select size="small" label="Employee" value={employeeId} onChange={(event) => updateFilter(setEmployeeId, event.target.value)}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.user?.firstName} {employee.user?.lastName} - {employee.employeeCode}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Department" value={departmentId} onChange={(event) => updateFilter(setDepartmentId, event.target.value)}>
          <MenuItem value="">All departments</MenuItem>
          {(departmentsQuery.data?.data.data ?? []).map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Branch" value={branchId} onChange={(event) => updateFilter(setBranchId, event.target.value)}>
          <MenuItem value="">All branches</MenuItem>
          {(branchesQuery.data?.data.data ?? []).map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
        </TextField>
      </FilterToolbar>
      {coverageQuery.isLoading ? <LoadingSkeleton rows={8} /> : coverageQuery.isError ? (
        <SectionCard title="Coverage unavailable"><Button variant="outlined" onClick={() => coverageQuery.refetch()}>Retry</Button></SectionCard>
      ) : !data ? null : (
        <Stack gap={2}>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
            <UnclassifiedApplications items={data.topUnclassifiedApplications} canManage={canManageRules} onCreate={(item) => { setCategory('PRODUCTIVE'); setTarget({ kind: 'application', label: item.name, value: item.name, normalized: item.normalizedName }); }} />
            <UnclassifiedWebsites items={data.topUnclassifiedWebsites} canManage={canManageRules} onCreate={(item) => { setCategory('PRODUCTIVE'); setTarget({ kind: 'website', label: item.hostname, value: item.hostname, normalized: item.normalizedHostname }); }} />
          </Stack>
          <DataTable
            title="Employee classification coverage"
            rows={employeeRows}
            columns={columns}
            toolbar={<Typography variant="body2" color="text.secondary">Coverage = classified / (classified + unclassified). CSV export is capped to the current protected query window.</Typography>}
            gridProps={{
              getRowId: (row) => row.employeeId,
              paginationMode: 'server',
              rowCount: data.pagination.total,
              paginationModel: pagination,
              onPaginationModelChange: setPagination,
              pageSizeOptions: [10, 20, 50, 100],
              disableColumnFilter: true,
            }}
          />
        </Stack>
      )}
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Create productivity rule</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Alert severity="info">This creates a rule for <strong>{target?.label}</strong>. Historical usage is classified dynamically when analytics refresh.</Alert>
            <TextField label="Normalized value" value={target?.normalized ?? ''} InputProps={{ readOnly: true }} />
            <TextField select label="Category" value={category} onChange={(event) => setCategory(event.target.value as ProductivityCategory)}>
              {categories.map((item) => <MenuItem key={item} value={item}>{formatCategory(item)}</MenuItem>)}
            </TextField>
            <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => createRuleMutation.mutate()} disabled={createRuleMutation.isPending}>Create Rule</Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}

function UnclassifiedApplications({ items, canManage, onCreate }: { items: ProductivityCoverageApplication[]; canManage: boolean; onCreate: (item: ProductivityCoverageApplication) => void }) {
  return <UnclassifiedPanel title="Top unclassified applications" emptyTitle="No unclassified applications" items={items.map((item) => ({ key: item.normalizedName, label: item.name, duration: item.durationSeconds, meta: `${item.employeeCount} employees - ${item.usageCount} uses - last seen ${formatDateTime(item.lastSeenAt)}`, item }))} canManage={canManage} onCreate={(entry) => onCreate(entry.item as ProductivityCoverageApplication)} />;
}

function UnclassifiedWebsites({ items, canManage, onCreate }: { items: ProductivityCoverageWebsite[]; canManage: boolean; onCreate: (item: ProductivityCoverageWebsite) => void }) {
  return <UnclassifiedPanel title="Top unclassified websites" emptyTitle="No unclassified websites" items={items.map((item) => ({ key: item.normalizedHostname, label: item.hostname, duration: item.durationSeconds, meta: `${item.employeeCount} employees - ${item.usageCount} uses - last seen ${formatDateTime(item.lastSeenAt)}`, item }))} canManage={canManage} onCreate={(entry) => onCreate(entry.item as ProductivityCoverageWebsite)} />;
}

function UnclassifiedPanel({ title, emptyTitle, items, canManage, onCreate }: { title: string; emptyTitle: string; items: Array<{ key: string; label: string; duration: number; meta: string; item: unknown }>; canManage: boolean; onCreate: (entry: { item: unknown }) => void }) {
  const total = items.reduce((sum, item) => sum + item.duration, 0);
  return (
    <SectionCard title={title} description="Highest duration values without an enabled productivity rule.">
      {items.length === 0 ? <EmptyState title={emptyTitle} description="Coverage is complete for this area in the selected range." /> : (
        <Stack gap={1.25}>
          {items.map((item) => {
            const percentage = total > 0 ? Math.min(100, (item.duration / total) * 100) : 0;
            return (
              <Box key={item.key} sx={{ border: '1px solid #E5E7EB', borderRadius: 2.5, p: 1.25 }}>
                <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                  <Box sx={{ minWidth: 0 }}><Typography fontWeight={900} noWrap>{item.label}</Typography><Typography variant="caption" color="text.secondary">{item.meta}</Typography></Box>
                  {canManage && <Button size="small" startIcon={<FilePlus2 size={15} />} onClick={() => onCreate(item)}>Create Rule</Button>}
                </Stack>
                <LinearProgress variant="determinate" value={percentage} sx={{ mt: 1, height: 7, borderRadius: 999 }} />
                <Typography variant="caption" color="text.secondary">{formatDuration(item.duration)} unclassified</Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}

function CoverageBar({ value }: { value: number }) {
  return <Stack sx={{ width: '100%' }} gap={0.5}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>{value}%</Typography><StatusChip label={value >= 90 ? 'Strong' : value >= 60 ? 'Improving' : 'Low'} tone={value >= 90 ? 'success' : value >= 60 ? 'warning' : 'danger'} /></Stack><LinearProgress variant="determinate" value={Math.min(100, value)} sx={{ height: 6, borderRadius: 999 }} /></Stack>;
}

function formatCategory(category: ProductivityCategory) {
  return category.replace('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
