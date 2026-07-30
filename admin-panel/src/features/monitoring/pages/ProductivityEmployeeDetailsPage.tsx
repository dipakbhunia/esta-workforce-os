import {
  Alert,
  Button,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, BriefcaseBusiness, Globe, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { exportProductivityEmployee, getProductivityEmployeeDetails } from '../services/monitoring-api';
import type {
  ProductivityCategory,
  ProductivityEmployeeTimelineItem,
  ProductivityEmployeeUsageItem,
  ProductivityEmployeeWebsiteUsageItem,
  ProductivityUsageSource,
} from '../types/monitoring.types';
import { downloadCsv } from '../utils/download-csv';
import { formatDateTime, formatDuration } from '../utils/monitoring-format';

const defaultRange = createDateRangeValue('currentWeek');
const categoryOptions: Array<ProductivityCategory | ''> = ['', 'PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE', 'UNCLASSIFIED'];
const sourceOptions: ProductivityUsageSource[] = ['ALL', 'APPLICATION', 'WEBSITE'];

export default function ProductivityEmployeeDetailsPage() {
  const { employeeId = '' } = useParams();
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ProductivityCategory | ''>('');
  const [source, setSource] = useState<ProductivityUsageSource>('ALL');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);

  const params = {
    page: pagination.page + 1,
    pageSize: pagination.pageSize,
    search: search || undefined,
    category: category || undefined,
    source,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  };

  const detailsQuery = useQuery({
    queryKey: ['monitoring-productivity-employee', employeeId, params],
    queryFn: () => getProductivityEmployeeDetails(employeeId, params),
    enabled: Boolean(employeeId),
  });

  const data = detailsQuery.data?.data;

  const appColumns = useMemo<GridColDef<ProductivityEmployeeUsageItem>[]>(() => [
    { field: 'name', headerName: 'Application', minWidth: 260, flex: 1, renderCell: ({ row }) => <Stack sx={{ minWidth: 0 }}><Typography fontWeight={900} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.normalizedName}</Typography></Stack> },
    { field: 'category', headerName: 'Category', minWidth: 150, renderCell: ({ row }) => <StatusChip label={formatCategory(row.category)} tone={categoryTone(row.category)} /> },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
    { field: 'usageCount', headerName: 'Usage Count', minWidth: 120 },
    { field: 'firstSeenAt', headerName: 'First Seen', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.firstSeenAt) },
    { field: 'lastSeenAt', headerName: 'Last Seen', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.lastSeenAt) },
  ], []);

  const websiteColumns = useMemo<GridColDef<ProductivityEmployeeWebsiteUsageItem>[]>(() => [
    { field: 'hostname', headerName: 'Hostname', minWidth: 260, flex: 1, renderCell: ({ row }) => <Stack sx={{ minWidth: 0 }}><Typography fontWeight={900} noWrap>{row.hostname}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.normalizedHostname}</Typography></Stack> },
    { field: 'category', headerName: 'Category', minWidth: 150, renderCell: ({ row }) => <StatusChip label={formatCategory(row.category)} tone={categoryTone(row.category)} /> },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
    { field: 'usageCount', headerName: 'Usage Count', minWidth: 120 },
    { field: 'firstSeenAt', headerName: 'First Seen', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.firstSeenAt) },
    { field: 'lastSeenAt', headerName: 'Last Seen', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.lastSeenAt) },
  ], []);

  const timelineColumns = useMemo<GridColDef<ProductivityEmployeeTimelineItem>[]>(() => [
    { field: 'startedAt', headerName: 'Start', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.startedAt) },
    { field: 'endedAt', headerName: 'End', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.endedAt) },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
    { field: 'source', headerName: 'Source', minWidth: 130, renderCell: ({ row }) => <StatusChip label={row.source === 'APPLICATION' ? 'Application' : 'Website'} tone={row.source === 'APPLICATION' ? 'info' : 'success'} /> },
    { field: 'displayName', headerName: 'Application / Hostname', minWidth: 260, flex: 1 },
    { field: 'category', headerName: 'Category', minWidth: 150, renderCell: ({ row }) => <StatusChip label={formatCategory(row.category)} tone={categoryTone(row.category)} /> },
  ], []);

  function updateDateRange(value: DateRangeValue) {
    setDateRange(value);
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function resetFilters() {
    setSearch('');
    setCategory('');
    setSource('ALL');
    setDateRange(createDateRangeValue('currentWeek'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  async function exportCsv() {
    const response = await exportProductivityEmployee(employeeId, params);
    downloadCsv('productivity-employee-usage.csv', response.data);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Employee Productivity Drill-down"
        description="Review one employee's classified application and hostname usage. Full URLs and typed content are not exported or displayed."
        breadcrumbs={['Admin', 'Monitoring', 'Productivity', 'Employee Drill-down']}
      />
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => detailsQuery.refetch()} /><ExportButton onClick={exportCsv} /></>}>
        <SearchFilter placeholder="Search app, hostname, timeline" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <DateRangePicker value={dateRange} onChange={updateDateRange} defaultPreset="currentWeek" />
        <TextField select size="small" label="Category" value={category} onChange={(event) => { setCategory(event.target.value as ProductivityCategory | ''); setPagination((current) => ({ ...current, page: 0 })); }}>
          {categoryOptions.map((item) => <MenuItem key={item || 'all'} value={item}>{item ? formatCategory(item) : 'All categories'}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Source" value={source} onChange={(event) => { setSource(event.target.value as ProductivityUsageSource); setPagination((current) => ({ ...current, page: 0 })); }}>
          {sourceOptions.map((item) => <MenuItem key={item} value={item}>{item === 'ALL' ? 'All sources' : item === 'APPLICATION' ? 'Applications only' : 'Websites only'}</MenuItem>)}
        </TextField>
      </FilterToolbar>
      {detailsQuery.isLoading ? <LoadingSkeleton rows={8} /> : detailsQuery.isError ? (
        <SectionCard title="Employee productivity unavailable"><Button variant="outlined" onClick={() => detailsQuery.refetch()}>Retry</Button></SectionCard>
      ) : !data ? <Alert severity="warning">Employee productivity details are not available.</Alert> : (
        <Stack gap={2}>
          <SectionCard title="Employee profile" description={`${data.department?.name ?? 'No department'} - ${data.branch?.name ?? 'No branch'}`}>
            <AvatarCell name={data.employee.name} email={`${data.employee.employeeCode} - ${data.employee.email}`} />
          </SectionCard>
          <SummaryCardsContainer minCardWidth={180}>
            <StatCard label="Productive" value={formatDuration(data.summary.productiveSeconds)} helper="Classified productive" icon={BriefcaseBusiness} tone="#16A34A" />
            <StatCard label="Neutral" value={formatDuration(data.summary.neutralSeconds)} helper="Classified neutral" icon={Activity} tone="#2563EB" />
            <StatCard label="Unproductive" value={formatDuration(data.summary.unproductiveSeconds)} helper="Classified unproductive" icon={Search} tone="#DC2626" />
            <StatCard label="Unclassified" value={formatDuration(data.summary.unclassifiedSeconds)} helper="Needs rules" icon={ShieldCheck} tone="#6B7280" />
            <StatCard label="Productivity %" value={`${data.summary.productivityPercentage}%`} helper="Productive / classified" icon={BarChart3} tone="#7C3AED" />
            <StatCard label="Coverage %" value={`${data.summary.classificationCoveragePercentage}%`} helper="Classified / tracked" icon={Globe} tone="#0F766E" />
          </SummaryCardsContainer>
          <SectionCard title="Category distribution" description="Productivity excludes unclassified time; coverage includes it.">
            <Stack gap={1.25}>
              <Distribution label="Productive" value={data.summary.productiveSeconds} total={data.summary.totalSeconds} tone="#16A34A" />
              <Distribution label="Neutral" value={data.summary.neutralSeconds} total={data.summary.totalSeconds} tone="#2563EB" />
              <Distribution label="Unproductive" value={data.summary.unproductiveSeconds} total={data.summary.totalSeconds} tone="#DC2626" />
              <Distribution label="Unclassified" value={data.summary.unclassifiedSeconds} total={data.summary.totalSeconds} tone="#6B7280" />
            </Stack>
          </SectionCard>
          {data.applications.length === 0 ? <SectionCard title="Applications"><EmptyState title="No application usage" description="No matching application records were found for the selected filters." /></SectionCard> : <DataTable title="Applications" rows={data.applications} columns={appColumns} gridProps={{ getRowId: (row) => `${row.category}-${row.normalizedName}`, disableColumnFilter: true }} />}
          {data.websites.length === 0 ? <SectionCard title="Websites"><EmptyState title="No website usage" description="No matching hostname records were found for the selected filters." /></SectionCard> : <DataTable title="Websites" rows={data.websites} columns={websiteColumns} gridProps={{ getRowId: (row) => `${row.category}-${row.normalizedHostname}`, disableColumnFilter: true }} />}
          <DataTable
            title="Classified activity timeline"
            rows={data.timeline}
            columns={timelineColumns}
            toolbar={<Typography variant="body2" color="text.secondary">Timeline rows are paginated server-side to keep drill-downs responsive.</Typography>}
            gridProps={{
              getRowId: (row) => `${row.source}-${row.startedAt}-${row.displayName}`,
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
    </PageLayout>
  );
}

function Distribution({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percentage = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return <Stack gap={0.5}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>{label}</Typography><Typography color="text.secondary">{formatDuration(value)} - {Math.round(percentage * 10) / 10}%</Typography></Stack><LinearProgress variant="determinate" value={percentage} sx={{ height: 8, borderRadius: 999, bgcolor: '#F3F4F6', '& .MuiLinearProgress-bar': { bgcolor: tone } }} /></Stack>;
}

function formatCategory(category: ProductivityCategory) {
  return category.replace('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function categoryTone(category: ProductivityCategory) {
  if (category === 'PRODUCTIVE') return 'success' as const;
  if (category === 'NEUTRAL') return 'info' as const;
  if (category === 'UNPRODUCTIVE') return 'danger' as const;
  return 'neutral' as const;
}
