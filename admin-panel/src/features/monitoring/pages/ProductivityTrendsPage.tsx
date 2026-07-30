import { Box, Button, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, LineChart, ShieldCheck, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue, type DateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
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
import { getProductivityTrends } from '../services/monitoring-api';
import type {
  ProductivityRankingDepartment,
  ProductivityRankingEmployee,
  ProductivityTrendGroupBy,
  ProductivityTrendPoint,
} from '../types/monitoring.types';
import { formatDuration } from '../utils/monitoring-format';

const defaultRange = createDateRangeValue('last30Days');
const groupOptions: ProductivityTrendGroupBy[] = ['DAY', 'WEEK', 'MONTH'];

export default function ProductivityTrendsPage() {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [groupBy, setGroupBy] = useState<ProductivityTrendGroupBy>('DAY');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);

  const params = {
    page: 1,
    pageSize: 100,
    search: search || undefined,
    employeeId: employeeId || undefined,
    departmentId: departmentId || undefined,
    branchId: branchId || undefined,
    groupBy,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  };

  const trendsQuery = useQuery({ queryKey: ['monitoring-productivity-trends', params], queryFn: () => getProductivityTrends(params) });
  const employeesQuery = useQuery({ queryKey: ['employees', { selector: true, productivityTrends: true }], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const data = trendsQuery.data?.data;

  const employeeColumns = useMemo<GridColDef<ProductivityRankingEmployee>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 260, flex: 1, renderCell: ({ row }) => <AvatarCell name={row.employee.name} email={row.employee.email} /> },
    { field: 'department', headerName: 'Department', minWidth: 150, valueGetter: (_, row) => row.department?.name ?? 'Not assigned' },
    { field: 'productivityPercentage', headerName: 'Productivity', minWidth: 160, renderCell: ({ row }) => <MetricBar value={row.productivityPercentage} /> },
    { field: 'coveragePercentage', headerName: 'Coverage', minWidth: 150, renderCell: ({ row }) => <MetricBar value={row.coveragePercentage} color="#2563EB" /> },
    { field: 'changePercentage', headerName: 'Trend', minWidth: 120, renderCell: ({ row }) => <ChangeChip value={row.changePercentage} /> },
    { field: 'productiveSeconds', headerName: 'Productive', minWidth: 130, valueGetter: (_, row) => formatDuration(row.productiveSeconds) },
    { field: 'actions', headerName: 'Actions', minWidth: 130, sortable: false, renderCell: ({ row }) => <Button size="small" component={RouterLink} to={`/monitoring/productivity/employees/${row.employeeId}`}>Details</Button> },
  ], []);

  const departmentColumns = useMemo<GridColDef<ProductivityRankingDepartment>[]>(() => [
    { field: 'department', headerName: 'Department', minWidth: 220, flex: 1, valueGetter: (_, row) => row.department?.name ?? 'Unassigned' },
    { field: 'employeeCount', headerName: 'Employees', minWidth: 110 },
    { field: 'productivityPercentage', headerName: 'Productivity', minWidth: 160, renderCell: ({ row }) => <MetricBar value={row.productivityPercentage} /> },
    { field: 'coveragePercentage', headerName: 'Coverage', minWidth: 150, renderCell: ({ row }) => <MetricBar value={row.coveragePercentage} color="#2563EB" /> },
    { field: 'changePercentage', headerName: 'Trend', minWidth: 120, renderCell: ({ row }) => <ChangeChip value={row.changePercentage} /> },
    { field: 'productiveSeconds', headerName: 'Productive', minWidth: 130, valueGetter: (_, row) => formatDuration(row.productiveSeconds) },
  ], []);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
  }

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDepartmentId('');
    setBranchId('');
    setGroupBy('DAY');
    setDateRange(createDateRangeValue('last30Days'));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Productivity Trends"
        description="Historical productivity, classification coverage, rankings, and department benchmarks from classified application and hostname usage."
        breadcrumbs={['Admin', 'Monitoring', 'Productivity', 'Trends']}
      />
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => trendsQuery.refetch()} /></>}>
        <SearchFilter placeholder="Search employee, app, website" value={search} onChange={(value) => updateFilter(setSearch, value)} />
        <DateRangePicker value={dateRange} onChange={setDateRange} defaultPreset="last30Days" />
        <TextField select size="small" label="Granularity" value={groupBy} onChange={(event) => setGroupBy(event.target.value as ProductivityTrendGroupBy)}>
          {groupOptions.map((item) => <MenuItem key={item} value={item}>{formatGroup(item)}</MenuItem>)}
        </TextField>
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

      {trendsQuery.isLoading ? <LoadingSkeleton rows={8} /> : trendsQuery.isError ? (
        <SectionCard title="Productivity trends unavailable"><Button variant="outlined" onClick={() => trendsQuery.refetch()}>Retry</Button></SectionCard>
      ) : !data ? null : (
        <Stack gap={2}>
          <SummaryCardsContainer minCardWidth={180}>
            <StatCard label="Productivity %" value={`${data.summary.productivityPercentage}%`} helper="Productive / classified time" icon={LineChart} tone="#16A34A" />
            <StatCard label="Coverage %" value={`${data.summary.coveragePercentage}%`} helper="Classified / tracked time" icon={ShieldCheck} tone="#2563EB" />
            <StatCard label="Productive Time" value={formatDuration(data.summary.productiveSeconds)} helper="Historical productive usage" icon={TrendingUp} tone="#16A34A" />
            <StatCard label="Unproductive Time" value={formatDuration(data.summary.unproductiveSeconds)} helper="Historical unproductive usage" icon={TrendingDown} tone="#DC2626" />
            <StatCard label="Total Tracked" value={formatDuration(data.summary.totalSeconds)} helper="Apps plus hostnames" icon={BarChart3} tone="#7C3AED" />
            <StatCard label="Company Avg" value={`${data.benchmarks.companyAverageProductivity}%`} helper="Benchmark baseline" icon={Users} tone="#0F766E" />
          </SummaryCardsContainer>

          <Stack direction={{ xs: 'column', xl: 'row' }} gap={2}>
            <SectionCard title="Productivity trend" description={`${formatGroup(data.groupBy)} productivity percentage over time.`}>
              {data.trendPoints.length === 0 ? <EmptyState title="No trend data" description="No productivity usage was found for the selected filters." /> : <TrendChart points={data.trendPoints} metric="productivityPercentage" color="#16A34A" />}
            </SectionCard>
            <SectionCard title="Coverage trend" description="Classification coverage helps identify whether rules are keeping up with real usage.">
              {data.trendPoints.length === 0 ? <EmptyState title="No coverage data" description="Coverage appears once application or website usage exists." /> : <TrendChart points={data.trendPoints} metric="coveragePercentage" color="#2563EB" />}
            </SectionCard>
          </Stack>

          <Stack direction={{ xs: 'column', xl: 'row' }} gap={2}>
            <SectionCard title="Department comparison" description="Top departments by productivity benchmark.">
              {data.topProductiveDepartments.length === 0 ? <EmptyState title="No department benchmarks" description="Department benchmarks appear when employees have department assignments." /> : <RankingBars items={data.topProductiveDepartments.map((row) => ({ label: row.department?.name ?? 'Unassigned', value: row.productivityPercentage, caption: `${row.employeeCount} employees - ${formatDuration(row.productiveSeconds)} productive` }))} />}
            </SectionCard>
            <SectionCard title="Benchmark snapshot" description="Selected filters compared with company baselines.">
              <Stack gap={1.5}>
                <Benchmark label="Company productivity" value={data.benchmarks.companyAverageProductivity} />
                <Benchmark label="Company coverage" value={data.benchmarks.companyAverageCoverage} color="#2563EB" />
                <Benchmark label="Selected department productivity" value={data.benchmarks.selectedDepartmentProductivity} />
                <Benchmark label="Selected employee productivity" value={data.benchmarks.selectedEmployeeProductivity} />
              </Stack>
            </SectionCard>
          </Stack>

          <DataTable title="Top productive employees" rows={data.topProductiveEmployees} columns={employeeColumns} gridProps={{ getRowId: (row) => row.employeeId, disableColumnFilter: true }} />
          <DataTable title="Bottom productivity employees" rows={data.bottomProductivityEmployees} columns={employeeColumns} gridProps={{ getRowId: (row) => row.employeeId, disableColumnFilter: true }} />
          <DataTable title="Most improved employees" rows={data.mostImprovedEmployees} columns={employeeColumns} gridProps={{ getRowId: (row) => row.employeeId, disableColumnFilter: true }} />
          <DataTable title="Largest productivity drop" rows={data.largestProductivityDrop} columns={employeeColumns} gridProps={{ getRowId: (row) => row.employeeId, disableColumnFilter: true }} />
          <DataTable title="Department benchmark ranking" rows={data.topProductiveDepartments} columns={departmentColumns} gridProps={{ getRowId: (row) => row.department?.id ?? 'unassigned', disableColumnFilter: true }} />
        </Stack>
      )}
    </PageLayout>
  );
}

function TrendChart({ points, metric, color }: { points: ProductivityTrendPoint[]; metric: 'productivityPercentage' | 'coveragePercentage'; color: string }) {
  const width = 720;
  const height = 220;
  const pad = 28;
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - (Math.min(100, Math.max(0, point[metric])) / 100) * (height - pad * 2);
    return { x, y, point };
  });
  const path = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ');
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric} trend chart`} sx={{ minWidth: 620, width: '100%', height }}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = height - pad - (tick / 100) * (height - pad * 2);
          return <g key={tick}><line x1={pad} x2={width - pad} y1={y} y2={y} stroke="#E5E7EB" /><text x={4} y={y + 4} fontSize="11" fill="#6B7280">{tick}%</text></g>;
        })}
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((coord) => <circle key={coord.point.bucket} cx={coord.x} cy={coord.y} r="4" fill={color}><title>{coord.point.bucket}: {coord.point[metric]}%</title></circle>)}
      </Box>
    </Box>
  );
}

function RankingBars({ items }: { items: Array<{ label: string; value: number; caption: string }> }) {
  return <Stack gap={1.25}>{items.slice(0, 8).map((item) => <Box key={item.label}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>{item.label}</Typography><Typography color="text.secondary">{item.value}%</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100, item.value)} sx={{ my: 0.5, height: 8, borderRadius: 999 }} /><Typography variant="caption" color="text.secondary">{item.caption}</Typography></Box>)}</Stack>;
}

function Benchmark({ label, value, color = '#16A34A' }: { label: string; value: number | null; color?: string }) {
  const safe = value ?? 0;
  return <Box><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>{label}</Typography><Typography color="text.secondary">{value === null ? 'Not selected' : `${safe}%`}</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100, safe)} sx={{ mt: 0.5, height: 8, borderRadius: 999, bgcolor: '#F3F4F6', '& .MuiLinearProgress-bar': { bgcolor: color } }} /></Box>;
}

function MetricBar({ value, color = '#16A34A' }: { value: number; color?: string }) {
  return <Stack sx={{ width: '100%' }} gap={0.5}><Typography variant="body2" fontWeight={800}>{value}%</Typography><LinearProgress variant="determinate" value={Math.min(100, value)} sx={{ height: 6, borderRadius: 999, bgcolor: '#F3F4F6', '& .MuiLinearProgress-bar': { bgcolor: color } }} /></Stack>;
}

function ChangeChip({ value }: { value: number }) {
  return <StatusChip label={`${value > 0 ? '+' : ''}${value}%`} tone={value > 0 ? 'success' : value < 0 ? 'danger' : 'neutral'} />;
}

function formatGroup(value: ProductivityTrendGroupBy) {
  if (value === 'DAY') return 'Daily';
  if (value === 'WEEK') return 'Weekly';
  return 'Monthly';
}
