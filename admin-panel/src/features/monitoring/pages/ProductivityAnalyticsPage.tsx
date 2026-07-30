import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, BriefcaseBusiness, Globe, Search, Target, TrendingUp, Users } from 'lucide-react';
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
import { useBranches } from '@/features/organization/hooks/useBranches';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { getEmployees } from '@/features/people/services/employees-api';
import { exportProductivityAnalytics, getProductivityAnalytics } from '../services/monitoring-api';
import type {
  ProductivityAnalyticsApplicationItem,
  ProductivityAnalyticsEmployeeRow,
  ProductivityAnalyticsTimelineSegment,
  ProductivityAnalyticsWebsiteItem,
  ProductivityCategory,
} from '../types/monitoring.types';
import { downloadCsv } from '../utils/download-csv';

const defaultRange = createDateRangeValue('currentWeek');

export default function ProductivityAnalyticsPage() {
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);

  const analyticsQuery = useQuery({
    queryKey: ['monitoring-productivity-analytics', pagination, search, employeeId, departmentId, branchId, dateRange],
    queryFn: () => getProductivityAnalytics({
      page: pagination.page + 1,
      pageSize: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      departmentId: departmentId || undefined,
      branchId: branchId || undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    }),
  });

  const employeesQuery = useQuery({
    queryKey: ['employees', { selector: true, productivityAnalytics: true }],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();

  const data = analyticsQuery.data?.data;
  const rows = data?.employees ?? [];
  const timelineByEmployee = useMemo(() => groupTimelineByEmployee(data?.timeline ?? []), [data?.timeline]);

  const columns = useMemo<GridColDef<ProductivityAnalyticsEmployeeRow>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 260,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => <AvatarCell name={row.employee.name || 'Unknown Employee'} email={row.employee.email} />,
    },
    { field: 'department', headerName: 'Department', minWidth: 150, valueGetter: (_, row) => row.department?.name ?? 'Not assigned' },
    { field: 'branch', headerName: 'Branch', minWidth: 140, valueGetter: (_, row) => row.branch?.name ?? 'Not assigned' },
    { field: 'productiveSeconds', headerName: 'Productive', minWidth: 130, valueGetter: (_, row) => formatDuration(row.productiveSeconds) },
    { field: 'neutralSeconds', headerName: 'Neutral', minWidth: 120, valueGetter: (_, row) => formatDuration(row.neutralSeconds) },
    { field: 'unproductiveSeconds', headerName: 'Unproductive', minWidth: 140, valueGetter: (_, row) => formatDuration(row.unproductiveSeconds) },
    { field: 'unclassifiedSeconds', headerName: 'Unclassified', minWidth: 140, valueGetter: (_, row) => formatDuration(row.unclassifiedSeconds) },
    {
      field: 'productivityPercentage',
      headerName: 'Productivity %',
      minWidth: 160,
      renderCell: ({ row }) => (
        <Stack sx={{ width: '100%' }} gap={0.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" fontWeight={800}>{formatPercent(row.productivityPercentage)}</Typography>
            <StatusChip label={productivityToneLabel(row.productivityPercentage)} tone={productivityTone(row.productivityPercentage)} />
          </Stack>
          <LinearProgress variant="determinate" value={Math.min(100, row.productivityPercentage)} sx={{ height: 6, borderRadius: 999, bgcolor: '#F3F4F6' }} />
        </Stack>
      ),
    },
    { field: 'topProductiveApp', headerName: 'Top Productive App', minWidth: 180, valueGetter: (_, row) => row.topProductiveApp ?? 'Not available' },
    { field: 'topProductiveWebsite', headerName: 'Top Productive Website', minWidth: 200, valueGetter: (_, row) => row.topProductiveWebsite ?? 'Not available' },
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 140,
      sortable: false,
      filterable: false,
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


  async function exportCsv() {
    const response = await exportProductivityAnalytics({
      page: pagination.page + 1,
      pageSize: pagination.pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      departmentId: departmentId || undefined,
      branchId: branchId || undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    });
    downloadCsv('productivity-analytics.csv', response.data);
  }
  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDepartmentId('');
    setBranchId('');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Productivity Analytics"
        description="Classified productivity analytics from real application and website usage. Unclassified time is reported but excluded from productivity percentage."
        breadcrumbs={['Admin', 'Productivity', 'Analytics']}
      />

      {data && (
        <SummaryCardsContainer minCardWidth={190}>
          <StatCard label="Productive Time" value={formatDuration(data.summary.totalProductiveSeconds)} helper="Classified productive usage" icon={Target} tone="#16A34A" />
          <StatCard label="Neutral Time" value={formatDuration(data.summary.totalNeutralSeconds)} helper="Classified neutral usage" icon={Activity} tone="#2563EB" />
          <StatCard label="Unproductive Time" value={formatDuration(data.summary.totalUnproductiveSeconds)} helper="Classified unproductive usage" icon={TrendingUp} tone="#DC2626" />
          <StatCard label="Unclassified Time" value={formatDuration(data.summary.totalUnclassifiedSeconds)} helper="Rules not found yet" icon={Search} tone="#6B7280" />
          <StatCard label="Productivity %" value={formatPercent(data.summary.productivityPercentage)} helper="Productive / classified time" icon={BarChart3} tone="#7C3AED" />
          <StatCard label="Average Productivity" value={formatPercent(data.summary.averageProductivityPercentage)} helper="Average across employees" icon={Users} tone="#0F766E" />
        </SummaryCardsContainer>
      )}

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => analyticsQuery.refetch()} />
            <ExportButton onClick={exportCsv} />
          </>
        )}
      >
        <SearchFilter placeholder="Search employee, app, website" value={search} onChange={(value) => updateFilter(setSearch, value)} />
        <DateRangePicker value={dateRange} onChange={updateDateRange} defaultPreset="currentWeek" />
        <TextField select size="small" label="Employee" value={employeeId} onChange={(event) => updateFilter(setEmployeeId, event.target.value)}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>{employee.user?.firstName} {employee.user?.lastName} - {employee.employeeCode}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Department" value={departmentId} onChange={(event) => updateFilter(setDepartmentId, event.target.value)}>
          <MenuItem value="">All departments</MenuItem>
          {(departmentsQuery.data?.data.data ?? []).map((department) => (
            <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Branch" value={branchId} onChange={(event) => updateFilter(setBranchId, event.target.value)}>
          <MenuItem value="">All branches</MenuItem>
          {(branchesQuery.data?.data.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>
          ))}
        </TextField>
      </FilterToolbar>

      {analyticsQuery.isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : analyticsQuery.isError ? (
        <SectionCard title="Productivity analytics unavailable" description="The analytics request failed.">
          <Stack alignItems="flex-start" gap={1.5}>
            <Typography color="text.secondary">Check backend availability and productivity permissions, then retry.</Typography>
            <Button variant="outlined" onClick={() => analyticsQuery.refetch()}>Retry</Button>
          </Stack>
        </SectionCard>
      ) : !data || rows.length === 0 ? (
        <SectionCard title="Productivity analytics">
          <EmptyState title="No productivity data found" description="No classified application or website usage exists for the selected filters." />
        </SectionCard>
      ) : (
        <>
          <DataTable
            title="Employee productivity breakdown"
            rows={rows}
            columns={columns}
            toolbar={<Typography variant="body2" color="text.secondary">Server-side aggregation by employee</Typography>}
            gridProps={{
              getRowId: (row) => row.employeeId,
              paginationMode: 'server',
              rowCount: data.pagination.total,
              paginationModel: pagination,
              onPaginationModelChange: setPagination,
              pageSizeOptions: [10, 20, 50, 100],
              getRowHeight: () => 68,
              disableColumnFilter: true,
            }}
          />

          <Stack direction={{ xs: 'column', xl: 'row' }} gap={2} alignItems="stretch">
            <SectionCard title="Top applications" description="Duration grouped by productivity category.">
              <Stack gap={2}>
                <RankingPanel title="Productive apps" icon={BriefcaseBusiness} items={data.topProductiveApps} category="PRODUCTIVE" />
                <RankingPanel title="Neutral apps" icon={Activity} items={data.topNeutralApps} category="NEUTRAL" />
                <RankingPanel title="Unproductive apps" icon={TrendingUp} items={data.topUnproductiveApps} category="UNPRODUCTIVE" />
              </Stack>
            </SectionCard>

            <SectionCard title="Top websites" description="Hostname-only website classification. Full URLs are not used.">
              <Stack gap={2}>
                <WebsiteRankingPanel title="Productive websites" items={data.topProductiveWebsites} category="PRODUCTIVE" />
                <WebsiteRankingPanel title="Neutral websites" items={data.topNeutralWebsites} category="NEUTRAL" />
                <WebsiteRankingPanel title="Unproductive websites" items={data.topUnproductiveWebsites} category="UNPRODUCTIVE" />
              </Stack>
            </SectionCard>
          </Stack>

          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems="stretch">
            <SectionCard title="Department productivity" description="Aggregated from classified app and website usage.">
              <Stack gap={1.25}>
                {data.departments.length === 0 ? (
                  <EmptyState title="No department data" description="Department-level productivity will appear when usage is linked to employees with departments." />
                ) : data.departments.slice(0, 10).map((department) => (
                  <Box key={department.department?.id ?? 'unassigned'} sx={{ p: 1.25, border: '1px solid #E5E7EB', borderRadius: 2, bgcolor: '#FFFFFF' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={800} noWrap>{department.department?.name ?? 'Unassigned'}</Typography>
                        <Typography variant="caption" color="text.secondary">{department.employeeCount} employees</Typography>
                      </Box>
                      <StatusChip label={formatPercent(department.productivityPercentage)} tone={productivityTone(department.productivityPercentage)} />
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, department.productivityPercentage)} sx={{ mt: 1, height: 7, borderRadius: 999, bgcolor: '#F3F4F6' }} />
                    <Typography variant="caption" color="text.secondary">
                      Productive {formatDuration(department.productiveSeconds)} - Unproductive {formatDuration(department.unproductiveSeconds)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </SectionCard>

            <SectionCard title="Productivity timeline" description="Classified application and website transitions by employee.">
              <Stack gap={1.25}>
                {rows.slice(0, 8).map((employee) => (
                  <ProductivityTimelineRow
                    key={employee.employeeId}
                    employeeName={employee.employee.name}
                    employeeCode={employee.employeeCode}
                    segments={timelineByEmployee.get(employee.employeeId) ?? []}
                  />
                ))}
                {data.timeline.length > 0 && rows.length === 0 && (
                  <Alert severity="info">Timeline entries exist, but no employees are visible on this page.</Alert>
                )}
              </Stack>
            </SectionCard>
          </Stack>

          <SectionCard title="Timeline legend">
            <Stack direction="row" gap={1} flexWrap="wrap">
              <StatusChip label="Productive" tone="success" />
              <StatusChip label="Neutral" tone="info" />
              <StatusChip label="Unproductive" tone="danger" />
              <StatusChip label="Unclassified" tone="neutral" />
              <Typography variant="body2" color="text.secondary">
                Percentages use Productive / (Productive + Neutral + Unproductive). Unclassified time is excluded from the denominator.
              </Typography>
            </Stack>
          </SectionCard>
        </>
      )}
    </PageLayout>
  );
}

function RankingPanel({ title, icon: Icon, items, category }: { title: string; icon: typeof BriefcaseBusiness; items: ProductivityAnalyticsApplicationItem[]; category: ProductivityCategory }) {
  const total = items.reduce((sum, item) => sum + item.durationSeconds, 0);
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Icon size={16} />
            <Typography variant="subtitle2" fontWeight={900}>{title}</Typography>
          </Stack>
          <StatusChip label={formatCategory(category)} tone={categoryTone(category)} />
        </Stack>
        {items.length === 0 ? (
          <EmptyState title="No applications" description="No matching application usage was classified in this category." />
        ) : (
          <Stack gap={1.25}>
            {items.map((item) => <UsageRank key={`${item.category}-${item.normalizedName}`} label={item.name} duration={item.durationSeconds} employees={item.employeeCount} total={total} />)}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function WebsiteRankingPanel({ title, items, category }: { title: string; items: ProductivityAnalyticsWebsiteItem[]; category: ProductivityCategory }) {
  const total = items.reduce((sum, item) => sum + item.durationSeconds, 0);
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Globe size={16} />
            <Typography variant="subtitle2" fontWeight={900}>{title}</Typography>
          </Stack>
          <StatusChip label={formatCategory(category)} tone={categoryTone(category)} />
        </Stack>
        {items.length === 0 ? (
          <EmptyState title="No websites" description="No matching website usage was classified in this category." />
        ) : (
          <Stack gap={1.25}>
            {items.map((item) => <UsageRank key={`${item.category}-${item.normalizedHostname}`} label={item.hostname} duration={item.durationSeconds} employees={item.employeeCount} total={total} />)}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function UsageRank({ label, duration, employees, total }: { label: string; duration: number; employees: number; total: number }) {
  const percentage = total > 0 ? Math.min(100, (duration / total) * 100) : 0;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Typography variant="body2" fontWeight={800} noWrap>{label}</Typography>
        <Typography variant="caption" color="text.secondary">{formatDuration(duration)}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={percentage} sx={{ my: 0.5, height: 7, borderRadius: 999, bgcolor: '#F3F4F6' }} />
      <Typography variant="caption" color="text.secondary">{employees} employees - {formatPercent(percentage)}</Typography>
    </Box>
  );
}

function ProductivityTimelineRow({ employeeName, employeeCode, segments }: { employeeName: string; employeeCode: string; segments: ProductivityAnalyticsTimelineSegment[] }) {
  return (
    <Box sx={{ border: '1px solid #E5E7EB', borderRadius: 2.5, p: 1.25, bgcolor: '#FFFFFF' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5}>
        <Box sx={{ width: { xs: '100%', md: 210 }, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={800} noWrap>{employeeName}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{employeeCode}</Typography>
        </Box>
        <Stack direction="row" gap={0.5} sx={{ flex: 1, minWidth: 0, overflowX: 'auto', pb: 0.5 }}>
          {segments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No classified usage timeline for this employee.</Typography>
          ) : segments.map((segment) => (
            <Tooltip key={`${segment.source}-${segment.start}-${segment.title}`} title={`${formatTime(segment.start)} to ${formatTime(segment.end)} - ${formatDuration(segment.durationSeconds)} - ${segment.title}`}>
              <Box
                tabIndex={0}
                aria-label={`${employeeName} ${formatCategory(segment.category)} ${segment.source.toLowerCase()} segment from ${formatTime(segment.start)} to ${formatTime(segment.end)}`}
                sx={{
                  minWidth: Math.max(58, Math.min(240, segment.durationSeconds / 6)),
                  height: 34,
                  borderRadius: 999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 1.25,
                  bgcolor: categoryBg(segment.category),
                  color: categoryColor(segment.category),
                  border: `1px solid ${categoryBorder(segment.category)}`,
                  outline: 'none',
                  '&:focus-visible': { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.22)' },
                }}
              >
                <Typography variant="caption" fontWeight={900} noWrap>{formatCategory(segment.category)}</Typography>
              </Box>
            </Tooltip>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

function groupTimelineByEmployee(segments: ProductivityAnalyticsTimelineSegment[]) {
  const map = new Map<string, ProductivityAnalyticsTimelineSegment[]>();
  for (const segment of segments) {
    const current = map.get(segment.employeeId) ?? [];
    current.push(segment);
    map.set(segment.employeeId, current);
  }
  for (const [employeeId, employeeSegments] of map.entries()) {
    map.set(employeeId, [...employeeSegments].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
  }
  return map;
}

function formatDuration(seconds: number | null | undefined) {
  const safeSeconds = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatPercent(value: number | null | undefined) {
  return `${Math.round((value ?? 0) * 10) / 10}%`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatCategory(category: ProductivityCategory) {
  return category.replace('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function productivityTone(value: number) {
  if (value >= 75) return 'success' as const;
  if (value >= 50) return 'info' as const;
  if (value > 0) return 'warning' as const;
  return 'neutral' as const;
}

function productivityToneLabel(value: number) {
  if (value >= 75) return 'Strong';
  if (value >= 50) return 'Balanced';
  if (value > 0) return 'Low';
  return 'None';
}

function categoryTone(category: ProductivityCategory) {
  if (category === 'PRODUCTIVE') return 'success' as const;
  if (category === 'NEUTRAL') return 'info' as const;
  if (category === 'UNPRODUCTIVE') return 'danger' as const;
  return 'neutral' as const;
}

function categoryBg(category: ProductivityCategory) {
  if (category === 'PRODUCTIVE') return '#DCFCE7';
  if (category === 'NEUTRAL') return '#DBEAFE';
  if (category === 'UNPRODUCTIVE') return '#FEE2E2';
  return '#F3F4F6';
}

function categoryColor(category: ProductivityCategory) {
  if (category === 'PRODUCTIVE') return '#166534';
  if (category === 'NEUTRAL') return '#1E40AF';
  if (category === 'UNPRODUCTIVE') return '#991B1B';
  return '#374151';
}

function categoryBorder(category: ProductivityCategory) {
  if (category === 'PRODUCTIVE') return '#86EFAC';
  if (category === 'NEUTRAL') return '#93C5FD';
  if (category === 'UNPRODUCTIVE') return '#FCA5A5';
  return '#D1D5DB';
}
