import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Activity, AppWindow, BarChart3, Clock3, Gauge, Globe, TimerOff, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getEmployees } from '@/features/people/services/employees-api';
import { InputActivityMetrics, inputActivityFromRecord } from '../components/InputActivityMetrics';
import {
  getMonitoringActivity,
  getMonitoringApplications,
  getMonitoringSummary,
  getMonitoringWebsites,
} from '../services/monitoring-api';
import type {
  MonitoringActivity,
  MonitoringApplicationUsage,
  MonitoringSummaryRecord,
  MonitoringWebsiteUsage,
} from '../types/monitoring.types';
import { employeeEmail, employeeName, formatDateTime, formatDuration } from '../utils/monitoring-format';

type ActivityView = 'summary' | 'detailed';

interface RankedUsage {
  id: string;
  label: string;
  durationSeconds: number;
}

interface EmployeeActivitySummary {
  id: string;
  employee: MonitoringSummaryRecord['employee'];
  onlineSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  activityPercent: number;
  appCount: number;
  websiteCount: number;
}

const pageSize = 20;

export default function MonitoringActivityPage() {
  const [view, setView] = useState<ActivityView>('summary');
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('last7Days'));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize });
  const [toast, setToast] = useState<string | null>(null);

  const listParams = {
    page: pagination.page + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    employeeId: employeeId || undefined,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  };

  const insightParams = {
    page: 1,
    limit: 100,
    search: search || undefined,
    employeeId: employeeId || undefined,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  };

  const activityQuery = useQuery({
    queryKey: ['monitoring-activity', listParams],
    queryFn: () => getMonitoringActivity(listParams),
  });

  const summaryQuery = useQuery({
    queryKey: ['monitoring-summary', insightParams],
    queryFn: () => getMonitoringSummary(insightParams),
  });

  const appsQuery = useQuery({
    queryKey: ['monitoring-activity-apps', insightParams],
    queryFn: () => getMonitoringApplications(insightParams),
  });

  const websitesQuery = useQuery({
    queryKey: ['monitoring-activity-websites', insightParams],
    queryFn: () => getMonitoringWebsites(insightParams),
  });

  const employeesQuery = useQuery({
    queryKey: ['monitoring-activity-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });

  const rows = useMemo(() => activityQuery.data?.data.data ?? [], [activityQuery.data?.data.data]);
  const summaryRows = useMemo(() => summaryQuery.data?.data.data ?? [], [summaryQuery.data?.data.data]);
  const appRows = useMemo(() => appsQuery.data?.data.data ?? [], [appsQuery.data?.data.data]);
  const websiteRows = useMemo(() => websitesQuery.data?.data.data ?? [], [websitesQuery.data?.data.data]);

  const totals = useMemo(() => {
    return summaryRows.reduce((acc, row) => {
      acc.activeSeconds += safeSeconds(row.activity?.activeSeconds);
      acc.idleSeconds += safeSeconds(row.activity?.idleSeconds);
      acc.sessions += row.activity?.sessions ?? 0;
      acc.appEntries += row.applications?.entries ?? 0;
      acc.websiteEntries += row.websites?.entries ?? 0;
      return acc;
    }, { activeSeconds: 0, idleSeconds: 0, sessions: 0, appEntries: 0, websiteEntries: 0 });
  }, [summaryRows]);

  const onlineSeconds = totals.activeSeconds + totals.idleSeconds;
  const activityPercent = percentage(totals.activeSeconds, onlineSeconds);
  const topApps = useMemo(() => rankApplications(appRows), [appRows]);
  const topWebsites = useMemo(() => rankWebsites(websiteRows), [websiteRows]);
  const employeeSummaries = useMemo(() => buildEmployeeSummaries(summaryRows), [summaryRows]);
  const mostActive = useMemo(() => employeeSummaries.filter((item) => item.onlineSeconds > 0).sort((a, b) => b.activityPercent - a.activityPercent).slice(0, 5), [employeeSummaries]);
  const leastActive = useMemo(() => employeeSummaries.filter((item) => item.onlineSeconds > 0).sort((a, b) => a.activityPercent - b.activityPercent).slice(0, 5), [employeeSummaries]);

  const activityColumns = useMemo<GridColDef<MonitoringActivity>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 250, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'startedAt', headerName: 'Session Start', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.startedAt) },
    { field: 'endedAt', headerName: 'Session End', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.endedAt) },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, valueGetter: (_, row) => formatDuration(row.durationSeconds) },
    { field: 'activeSeconds', headerName: 'Active Time', minWidth: 130, valueGetter: (_, row) => formatDuration(row.activeSeconds) },
    { field: 'idleSeconds', headerName: 'Idle Time', minWidth: 130, valueGetter: (_, row) => formatDuration(row.idleSeconds) },
    {
      field: 'inputActivity',
      headerName: 'Input Activity',
      minWidth: 430,
      sortable: false,
      renderCell: ({ row }) => (
        <InputActivityMetrics
          compact
          counts={inputActivityFromRecord(row)}
        />
      ),
    },
    { field: 'applications', headerName: 'Applications', minWidth: 220, valueGetter: (_, row) => row.applications.map((item) => item.application).filter(Boolean).slice(0, 2).join(', ') || 'Not available' },
    { field: 'websites', headerName: 'Websites', minWidth: 220, valueGetter: (_, row) => row.websites.map((item) => item.domain).filter(Boolean).slice(0, 2).join(', ') || 'Not available' },
  ], []);

  const employeeSummaryColumns = useMemo<GridColDef<EmployeeActivitySummary>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 250, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={summaryEmployeeName(row.employee)} email={row.employee.user?.email} /> },
    { field: 'onlineSeconds', headerName: 'Online Time', minWidth: 140, valueGetter: (_, row) => formatDuration(row.onlineSeconds) },
    { field: 'activeSeconds', headerName: 'Active Time', minWidth: 140, valueGetter: (_, row) => formatDuration(row.activeSeconds) },
    { field: 'idleSeconds', headerName: 'Idle Time', minWidth: 140, valueGetter: (_, row) => formatDuration(row.idleSeconds) },
    { field: 'activityPercent', headerName: 'Activity %', minWidth: 120, valueGetter: (_, row) => `${Math.round(row.activityPercent)}%` },
    { field: 'appCount', headerName: 'App Count', minWidth: 120 },
    { field: 'websiteCount', headerName: 'Website Count', minWidth: 140 },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDateRange(createDateRangeValue('last7Days'));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function refreshAll() {
    void Promise.all([
      activityQuery.refetch(),
      summaryQuery.refetch(),
      appsQuery.refetch(),
      websitesQuery.refetch(),
    ]);
  }

  const isInsightLoading = summaryQuery.isFetching || appsQuery.isFetching || websitesQuery.isFetching;
  const hasInsightError = summaryQuery.isError || appsQuery.isError || websitesQuery.isError;

  return (
    <PageLayout>
      <PageHeader
        title="Activity"
        description="Analyze employee activity, online time, applications, websites, and work patterns."
        breadcrumbs={['Admin', 'Monitoring', 'Activity']}
      />

      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={refreshAll} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <DateRangePicker value={dateRange} defaultPreset="last7Days" onChange={(value) => { setDateRange(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <SearchFilter placeholder="Search employee, app, website, or session" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <TextField select label="View" size="small" value={view} onChange={(event) => setView(event.target.value as ActivityView)} sx={{ minWidth: { xs: '100%', md: 160 } }}>
          <MenuItem value="summary">Summary</MenuItem>
          <MenuItem value="detailed">Detailed</MenuItem>
        </TextField>
      </FilterToolbar>

      <Tabs value={view} onChange={(_, value: ActivityView) => setView(value)} sx={{ borderBottom: '1px solid #E5E7EB' }}>
        <Tab value="summary" label="Summary" />
        <Tab value="detailed" label="Detailed" />
      </Tabs>

      {view === 'summary' ? (
        <>
          <SummaryCardsContainer>
            <StatCard label="Activity %" value={`${Math.round(activityPercent)}%`} helper="Active time / online time" icon={Gauge} tone="#2563EB" />
            <StatCard label="Online Time" value={formatDuration(onlineSeconds)} helper="Active + idle time" icon={Clock3} tone="#2563EB" />
            <StatCard label="Active Time" value={formatDuration(totals.activeSeconds)} helper={`${totals.sessions} sessions loaded`} icon={Activity} tone="#16A34A" />
            <StatCard label="Idle Time" value={formatDuration(totals.idleSeconds)} helper="Across loaded employees" icon={TimerOff} tone="#F59E0B" />
            <StatCard label="Top Application" value={topApps[0]?.label ?? 'Not available'} helper={topApps[0] ? formatDuration(topApps[0].durationSeconds) : 'No app usage found'} icon={AppWindow} tone="#6B7280" />
            <StatCard label="Top Website" value={topWebsites[0]?.label ?? 'Not available'} helper={topWebsites[0] ? formatDuration(topWebsites[0].durationSeconds) : 'No website usage found'} icon={Globe} tone="#6B7280" />
          </SummaryCardsContainer>

          {isInsightLoading && <LoadingSkeleton rows={4} />}
          {hasInsightError && <Alert severity="error" action={<Button color="inherit" onClick={refreshAll}>Retry</Button>}>Activity analytics could not be loaded.</Alert>}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <SectionCard title="Online Time Breakdown" description="Active versus idle time for the selected range.">
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={3} alignItems="center">
                <DonutMetric value={percentage(totals.activeSeconds, onlineSeconds)} label={formatDuration(onlineSeconds)} subLabel="Online time" color="#16A34A" trackColor="#F59E0B" />
                <Stack gap={1.5} sx={{ flex: 1, width: '100%' }}>
                  <MetricLegend label="Active" value={formatDuration(totals.activeSeconds)} color="#16A34A" />
                  <MetricLegend label="Idle" value={formatDuration(totals.idleSeconds)} color="#F59E0B" />
                </Stack>
              </Stack>
            </SectionCard>

            <SectionCard title="Activity Level Breakdown" description="Overall activity percentage for the selected employees.">
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={3} alignItems="center">
                <DonutMetric value={activityPercent} label={`${Math.round(activityPercent)}%`} subLabel="Activity" color="#2563EB" />
                <Stack gap={1.5} sx={{ flex: 1, width: '100%' }}>
                  <Typography variant="body2" color="text.secondary">Activity remains at 0% when no active or idle time is available from the backend.</Typography>
                  <LinearProgress variant="determinate" value={activityPercent} sx={{ height: 10, borderRadius: 99 }} />
                </Stack>
              </Stack>
            </SectionCard>

            <RankingCard title="Top Applications" description="Top 5 applications by tracked duration." items={topApps} emptyTitle="No application usage found" icon={<AppWindow size={18} />} />
            <RankingCard title="Top Websites" description="Top 5 websites or domains by tracked duration." items={topWebsites} emptyTitle="No website usage found" icon={<Globe size={18} />} />

            <SectionCard title="Activity Outliers" description="Most and least active employees based on loaded summary data.">
              {mostActive.length || leastActive.length ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  <EmployeeRankList title="Most Active" employees={mostActive} />
                  <EmployeeRankList title="Least Active" employees={leastActive} />
                </Box>
              ) : (
                <EmptyState title="Insufficient activity data" description="Outliers will appear when employees have active or idle time in this range." />
              )}
            </SectionCard>

            <SectionCard title="Team-wise Activity Breakdown" description="Department and team grouping placeholder.">
              <EmptyState title="Team analytics not available yet" description="Team analytics will be available when department grouping is enabled." />
            </SectionCard>
          </Box>
        </>
      ) : (
        <>
          <Alert severity="info">Sorting applies to the currently loaded page. Monitoring activity data is read-only in this phase.</Alert>
          <DataTable
            title="Activity Sessions"
            rows={rows}
            columns={activityColumns}
            toolbar={<></>}
            gridProps={{
              loading: activityQuery.isFetching,
              rowHeight: 74,
              columnHeaderHeight: 48,
              paginationMode: 'server',
              rowCount: activityQuery.data?.data.meta.total ?? 0,
              paginationModel: pagination,
              onPaginationModelChange: setPagination,
              slots: {
                loadingOverlay: () => <LoadingSkeleton rows={6} />,
                noRowsOverlay: () => <EmptyState title="No activity sessions found" description="Try adjusting the employee, date range, or search filters." />,
              },
            }}
          />
          <DataTable
            title="Employee Activity Summary"
            rows={employeeSummaries}
            columns={employeeSummaryColumns}
            toolbar={<></>}
            gridProps={{
              loading: summaryQuery.isFetching,
              rowHeight: 60,
              columnHeaderHeight: 48,
              hideFooterSelectedRowCount: true,
              slots: {
                loadingOverlay: () => <LoadingSkeleton rows={6} />,
                noRowsOverlay: () => <EmptyState title="No employee summary found" description="Summary data will appear when employees have monitoring activity in this range." />,
              },
            }}
          />
          {activityQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void activityQuery.refetch()}>Retry</Button>}>Activity sessions could not be loaded.</Alert>}
        </>
      )}

      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}><Typography variant="body2">{toast}</Typography></Alert>}
    </PageLayout>
  );
}

function safeSeconds(value?: number | null) {
  return Math.max(0, Math.round(value ?? 0));
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function summaryEmployeeName(employee: MonitoringSummaryRecord['employee']) {
  const user = employee.user;
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || employee.employeeCode || 'Employee';
}

function buildEmployeeSummaries(rows: MonitoringSummaryRecord[]): EmployeeActivitySummary[] {
  return rows.map((row) => {
    const activeSeconds = safeSeconds(row.activity?.activeSeconds);
    const idleSeconds = safeSeconds(row.activity?.idleSeconds);
    const onlineSeconds = activeSeconds + idleSeconds;
    return {
      id: row.employee.id,
      employee: row.employee,
      onlineSeconds,
      activeSeconds,
      idleSeconds,
      activityPercent: percentage(activeSeconds, onlineSeconds),
      appCount: row.applications?.entries ?? 0,
      websiteCount: row.websites?.entries ?? 0,
    };
  });
}

function rankApplications(rows: MonitoringApplicationUsage[]): RankedUsage[] {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const label = row.application || 'Unknown application';
    totals.set(label, (totals.get(label) ?? 0) + safeSeconds(row.durationSeconds));
  });
  return Array.from(totals.entries())
    .map(([label, durationSeconds]) => ({ id: label, label, durationSeconds }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 5);
}

function rankWebsites(rows: MonitoringWebsiteUsage[]): RankedUsage[] {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const label = row.domain || row.url || 'Unknown website';
    totals.set(label, (totals.get(label) ?? 0) + safeSeconds(row.durationSeconds));
  });
  return Array.from(totals.entries())
    .map(([label, durationSeconds]) => ({ id: label, label, durationSeconds }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 5);
}

function DonutMetric({ value, label, subLabel, color, trackColor = '#E5E7EB' }: { value: number; label: string; subLabel: string; color: string; trackColor?: string }) {
  const safeValue = Math.round(percentage(value, 100));
  return (
    <Box
      sx={{
        width: 156,
        height: 156,
        borderRadius: '50%',
        background: `conic-gradient(${color} 0deg ${safeValue * 3.6}deg, ${trackColor} ${safeValue * 3.6}deg 360deg)`,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
      }}
    >
      <Box sx={{ width: 112, height: 112, borderRadius: '50%', bgcolor: '#FFFFFF', display: 'grid', placeItems: 'center', textAlign: 'center', boxShadow: 'inset 0 0 0 1px #E5E7EB' }}>
        <Box>
          <Typography variant="h4">{label}</Typography>
          <Typography variant="caption" color="text.secondary">{subLabel}</Typography>
        </Box>
      </Box>
    </Box>
  );
}

function MetricLegend({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Stack>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
    </Stack>
  );
}

function RankingCard({ title, description, items, emptyTitle, icon }: { title: string; description: string; items: RankedUsage[]; emptyTitle: string; icon: React.ReactNode }) {
  const maxDuration = Math.max(...items.map((item) => item.durationSeconds), 0);
  return (
    <SectionCard title={title} description={description} action={<Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>}>
      {items.length ? (
        <Stack gap={1.5}>
          {items.map((item, index) => (
            <Box key={item.id}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{index + 1}. {item.label}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flex: '0 0 auto' }}>{formatDuration(item.durationSeconds)}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={percentage(item.durationSeconds, maxDuration)} sx={{ height: 8, borderRadius: 99 }} />
            </Box>
          ))}
        </Stack>
      ) : (
        <EmptyState title={emptyTitle} description="No records were returned for the selected filters." />
      )}
    </SectionCard>
  );
}

function EmployeeRankList({ title, employees }: { title: string; employees: EmployeeActivitySummary[] }) {
  return (
    <Card variant="outlined" sx={{ borderColor: '#E5E7EB' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
          {title === 'Most Active' ? <BarChart3 size={18} /> : <Users size={18} />}
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
        </Stack>
        {employees.length ? (
          <Stack gap={1.25}>
            {employees.map((employee) => (
              <Stack key={employee.id} direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summaryEmployeeName(employee.employee)}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatDuration(employee.onlineSeconds)} online</Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>{Math.round(employee.activityPercent)}%</Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">Not enough activity data.</Typography>
        )}
      </CardContent>
    </Card>
  );
}
