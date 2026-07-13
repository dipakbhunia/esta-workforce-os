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
import { type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, Globe, Monitor, Users, type LucideIcon } from 'lucide-react';
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
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getEmployees } from '@/features/people/services/employees-api';
import { getMonitoringApplications, getMonitoringSummary, getMonitoringWebsites } from '../services/monitoring-api';
import type { MonitoringApplicationUsage, MonitoringSummaryRecord, MonitoringWebsiteUsage } from '../types/monitoring.types';
import { employeeEmail, employeeName, formatDateTime, formatDuration } from '../utils/monitoring-format';

type UsageTab = 'applications' | 'websites' | 'employees';

interface RankedUsage {
  id: string;
  label: string;
  durationSeconds: number;
  count: number;
  employeeCount: number;
  browserName?: string | null;
}

interface EmployeeUsageRow {
  id: string;
  employee: MonitoringApplicationUsage['employee'];
  applicationsUsed: number;
  topApplication: string;
  usageSeconds: number;
  browserName: string;
  activityPercent: number | null;
}

type ApplicationUsageWithOptionalMetadata = MonitoringApplicationUsage & {
  applicationName?: string | null;
  executable?: string | null;
  processName?: string | null;
};

const browserOptions = ['Google Chrome', 'Mozilla Firefox', 'Microsoft Edge', 'Brave', 'Opera', 'Electron', 'Unknown'];

export default function MonitoringAppsUrlsPage() {
  const [tab, setTab] = useState<UsageTab>('applications');
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [browserFilter, setBrowserFilter] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('last7Days'));
  const [toast, setToast] = useState<string | null>(null);

  const params = {
    page: 1,
    limit: 100,
    search: search || undefined,
    employeeId: employeeId || undefined,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  };

  const appsQuery = useQuery({ queryKey: ['monitoring-apps-intelligence', params], queryFn: () => getMonitoringApplications(params) });
  const websitesQuery = useQuery({ queryKey: ['monitoring-websites-intelligence', params], queryFn: () => getMonitoringWebsites(params) });
  const summaryQuery = useQuery({ queryKey: ['monitoring-apps-urls-summary', params], queryFn: () => getMonitoringSummary(params) });
  const employeesQuery = useQuery({ queryKey: ['monitoring-apps-urls-employees'], queryFn: () => getEmployees({ page: 1, limit: 100 }) });

  const appRows = useMemo(() => appsQuery.data?.data.data ?? [], [appsQuery.data?.data.data]);
  const websiteRows = useMemo(() => websitesQuery.data?.data.data ?? [], [websitesQuery.data?.data.data]);
  const summaryRows = useMemo(() => summaryQuery.data?.data.data ?? [], [summaryQuery.data?.data.data]);

  const filteredAppRows = useMemo(() => {
    if (!browserFilter) return appRows;
    return appRows.filter((row) => browserNameFromApplication(getApplicationDisplayName(row)) === browserFilter);
  }, [appRows, browserFilter]);

  const filteredWebsiteRows = useMemo(() => {
    if (!browserFilter) return websiteRows;
    return websiteRows.filter((row) => (normalizeBrowserName(row.browserName) ?? 'Unknown') === browserFilter);
  }, [websiteRows, browserFilter]);

  const appRankings = useMemo(() => rankApplications(filteredAppRows), [filteredAppRows]);
  const websiteRankings = useMemo(() => rankWebsites(filteredWebsiteRows), [filteredWebsiteRows]);
  const browserRankings = useMemo(() => rankBrowsers(filteredAppRows, filteredWebsiteRows), [filteredAppRows, filteredWebsiteRows]);
  const employeeUsageRows = useMemo(() => buildEmployeeUsageRows(filteredAppRows, filteredWebsiteRows, summaryRows), [filteredAppRows, filteredWebsiteRows, summaryRows]);

  const totalUsageSeconds = useMemo(() => filteredAppRows.reduce((sum, row) => sum + safeSeconds(row.durationSeconds), 0), [filteredAppRows]);
  const totalWebsiteSeconds = useMemo(() => websiteRankings.reduce((sum, row) => sum + safeSeconds(row.durationSeconds), 0), [websiteRankings]);
  const totalBrowserSeconds = useMemo(() => browserRankings.reduce((sum, row) => sum + safeSeconds(row.durationSeconds), 0), [browserRankings]);
  const uniqueApps = useMemo(() => new Set(filteredAppRows.map((row) => getApplicationDisplayName(row)).filter((name) => name !== 'Unknown')).size, [filteredAppRows]);
  const uniqueWebsites = useMemo(() => new Set(filteredWebsiteRows.map((row) => normalizeWebsiteDomain(row.domain || row.url)).filter(Boolean)).size, [filteredWebsiteRows]);
  const activeEmployees = useMemo(() => new Set([...filteredAppRows, ...filteredWebsiteRows].map((row) => row.employee?.id).filter(Boolean)).size, [filteredAppRows, filteredWebsiteRows]);
  const topApp = appRankings[0];
  const topBrowser = browserRankings[0];
  const lastUpdatedAt = Math.max(appsQuery.dataUpdatedAt, websitesQuery.dataUpdatedAt, summaryQuery.dataUpdatedAt);

  const applicationColumns = useMemo<GridColDef<MonitoringApplicationUsage>[]>(() => [
    { field: 'application', headerName: 'Application', minWidth: 240, flex: 1, renderCell: ({ row }) => <ApplicationCell name={getApplicationDisplayName(row)} subtitle={row.windowTitle || undefined} search={search} /> },
    { field: 'employee', headerName: 'Employee', minWidth: 250, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'windowTitle', headerName: 'Window Title', minWidth: 280, flex: 1, renderCell: ({ row }) => <HighlightedText text={row.windowTitle || 'Not available'} query={search} muted={!row.windowTitle} /> },
    { field: 'startedAt', headerName: 'Start', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.startedAt) },
    { field: 'endedAt', headerName: 'End', minWidth: 180, valueGetter: (_, row) => formatDateTime(row.endedAt) },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, renderCell: ({ row }) => <DurationPill seconds={row.durationSeconds} /> },
    { field: 'browser', headerName: 'Browser', minWidth: 160, renderCell: ({ row }) => browserNameFromApplication(getApplicationDisplayName(row)) ? <StatusChip label={browserNameFromApplication(getApplicationDisplayName(row)) ?? 'Browser'} tone="info" /> : <Typography variant="body2" color="text.secondary">-</Typography> },
  ], [search]);

  const websiteColumns = useMemo<GridColDef<MonitoringWebsiteUsage>[]>(() => [
    { field: 'domain', headerName: 'Domain', minWidth: 240, flex: 1, renderCell: ({ row }) => <WebsiteCell domain={normalizeWebsiteDomain(row.domain || row.url) ?? 'Not available'} url={row.url} search={search} /> },
    { field: 'employee', headerName: 'Employee', minWidth: 250, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'browserName', headerName: 'Browser', minWidth: 160, renderCell: ({ row }) => normalizeBrowserName(row.browserName) ? <StatusChip label={normalizeBrowserName(row.browserName) ?? 'Browser'} tone="info" /> : <Typography variant="body2" color="text.secondary">Not available</Typography> },
    { field: 'durationSeconds', headerName: 'Duration', minWidth: 130, renderCell: ({ row }) => <DurationPill seconds={row.durationSeconds} /> },
    { field: 'visits', headerName: 'Visits', minWidth: 110, valueGetter: () => 1 },
  ], [search]);

  const employeeColumns = useMemo<GridColDef<EmployeeUsageRow>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 260, flex: 1, sortable: false, renderCell: ({ row }) => <AvatarCell name={employeeName(row.employee)} email={employeeEmail(row.employee)} /> },
    { field: 'applicationsUsed', headerName: 'Applications Used', minWidth: 160 },
    { field: 'topApplication', headerName: 'Top Application', minWidth: 200, flex: 1 },
    { field: 'browserName', headerName: 'Browser', minWidth: 150, renderCell: ({ row }) => row.browserName === 'Not available' ? <Typography variant="body2" color="text.secondary">Not available</Typography> : <StatusChip label={row.browserName} tone="info" /> },
    { field: 'usageSeconds', headerName: 'Usage', minWidth: 140, renderCell: ({ row }) => <DurationPill seconds={row.usageSeconds} /> },
  ], []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setBrowserFilter('');
    setDateRange(createDateRangeValue('last7Days'));
  }

  function refreshAll() {
    void Promise.all([appsQuery.refetch(), websitesQuery.refetch(), summaryQuery.refetch()]);
  }

  const loading = appsQuery.isFetching || websitesQuery.isFetching || summaryQuery.isFetching;
  const hasError = appsQuery.isError || websitesQuery.isError || summaryQuery.isError;

  return (
    <PageLayout>
      <PageHeader title="Apps & URLs" description="Application and Website Intelligence" breadcrumbs={['Admin', 'Monitoring', 'Apps & URLs']} />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.25}>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
          Last updated: {lastUpdatedAt ? formatDateTime(new Date(lastUpdatedAt).toISOString()) : 'Not updated yet'}
        </Typography>
        <RefreshButton onClick={refreshAll} />
        <ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} />
      </Stack>

      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={refreshAll} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <DateRangePicker value={dateRange} defaultPreset="last7Days" onChange={setDateRange} />
        <SearchFilter placeholder="Search employee, application, domain, URL, or title" value={search} onChange={setSearch} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <TextField select label="Browser" size="small" value={browserFilter} onChange={(event) => setBrowserFilter(event.target.value)} sx={{ minWidth: { xs: '100%', md: 180 } }}>
          <MenuItem value="">All browsers</MenuItem>
          {browserOptions.map((browser) => <MenuItem key={browser} value={browser}>{browser}</MenuItem>)}
        </TextField>
        <TextField select label="Department" size="small" value="" disabled sx={{ minWidth: { xs: '100%', md: 200 } }}>
          <MenuItem value="">Department filter unavailable</MenuItem>
        </TextField>
      </FilterToolbar>

      <SummaryCardsContainer>
        <KpiCard label="Applications Used" value={String(uniqueApps)} caption={`${filteredAppRows.length} usage records`} trend="Trend placeholder" icon={AppWindow} tone="#2563EB" />
        <KpiCard label="Websites Visited" value={String(uniqueWebsites)} caption={`${filteredWebsiteRows.length} website records`} trend="Trend placeholder" icon={Globe} tone="#16A34A" />
        <KpiCard label="Total Usage Time" value={formatDuration(totalUsageSeconds)} caption="Application tracked time" trend="Trend placeholder" icon={Monitor} tone="#6B7280" />
        <KpiCard label="Most Used Application" value={topApp?.label ?? 'Not available'} caption={topApp ? formatDuration(topApp.durationSeconds) : 'No app usage found'} trend="Trend placeholder" icon={AppWindow} tone="#2563EB" />
        <KpiCard label="Most Used Browser" value={topBrowser?.label ?? 'Not available'} caption={topBrowser ? formatDuration(topBrowser.durationSeconds) : 'No browser usage found'} trend="Trend placeholder" icon={Globe} tone="#F59E0B" />
        <KpiCard label="Employees Active" value={String(activeEmployees)} caption="Employees with app usage" trend="Trend placeholder" icon={Users} tone="#16A34A" />
      </SummaryCardsContainer>

      {loading && <LoadingSkeleton rows={4} />}
      {hasError && <Alert severity="error" action={<Button color="inherit" onClick={refreshAll}>Retry</Button>}>Apps & URLs data could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <RankingCard title="Top 10 Applications" description="Application ranking by tracked usage time." items={appRankings.slice(0, 10)} totalDuration={totalUsageSeconds} emptyTitle="No application usage recorded" icon={AppWindow} />
        <RankingCard title="Browser Usage" description="Detected browser ranking from application and website metadata." items={browserRankings} totalDuration={totalBrowserSeconds} emptyTitle="No browser usage recorded" compact icon={Globe} />
        <RankingCard title="Website Ranking" description="Domain ranking by duration and visit count." items={websiteRankings.slice(0, 10)} totalDuration={totalWebsiteSeconds} emptyTitle="No website activity recorded" emptyDescription="Website analytics will appear after browser URL collection is enabled." icon={Globe} />
        <SectionCard title="Application Categories" description="Future-ready category intelligence.">
          <DashboardEmptyState title="No category information available yet." description="Application category analytics will appear after backend classification is introduced." icon={AppWindow} />
        </SectionCard>
      </Box>

      <SectionCard title="Top Employees" description="Employee usage summary from application and website records.">
        {employeeUsageRows.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
            {employeeUsageRows.slice(0, 6).map((employee) => (
              <Card key={employee.id} variant="outlined" sx={interactiveCardSx}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                    <AvatarCell name={employeeName(employee.employee)} email={employee.employee?.employeeCode || employeeEmail(employee.employee)} />
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{formatDuration(employee.usageSeconds)}</Typography>
                  </Stack>
                  <Stack gap={1.25} sx={{ mt: 1.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                      <MiniMetric label="Primary application" value={employee.topApplication} />
                      <MiniMetric label="Primary browser" value={employee.browserName} />
                    </Stack>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                      <Typography variant="caption" color="text.secondary">Activity {employee.activityPercent === null ? 'not available' : `${Math.round(employee.activityPercent)}%`}</Typography>
                      <Typography variant="caption" color="text.secondary">{employee.applicationsUsed} apps</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={employee.activityPercent ?? 0} sx={progressSx} />
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <DashboardEmptyState title="No employees matched" description="Employee usage cards will appear when application usage exists for the selected filters." icon={Users} />
        )}
      </SectionCard>

      <Tabs value={tab} onChange={(_, value: UsageTab) => setTab(value)} sx={{ borderBottom: '1px solid #E5E7EB' }}>
        <Tab value="applications" label="Applications" />
        <Tab value="websites" label="Websites" />
        <Tab value="employees" label="Employees" />
      </Tabs>
      <Typography variant="caption" color="text.secondary">Showing loaded results (client-side pagination).</Typography>

      {tab === 'applications' && (
        <DataTable title="Application Details" rows={filteredAppRows} columns={applicationColumns} toolbar={<></>} gridProps={{ loading: appsQuery.isFetching, rowHeight: 64, columnHeaderHeight: 48, sx: dataGridSx, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <DashboardEmptyState title="No application usage recorded" description="Try adjusting the employee, browser, date range, or search filters." icon={AppWindow} /> } }} />
      )}
      {tab === 'websites' && (
        <DataTable title="Website Details" rows={filteredWebsiteRows} columns={websiteColumns} toolbar={<></>} gridProps={{ loading: websitesQuery.isFetching, rowHeight: 64, columnHeaderHeight: 48, sx: dataGridSx, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <DashboardEmptyState title="No website activity recorded" description="Website analytics will appear when browser URL providers submit real domains." icon={Globe} /> } }} />
      )}
      {tab === 'employees' && (
        <DataTable title="Employee Usage Details" rows={employeeUsageRows} columns={employeeColumns} toolbar={<></>} gridProps={{ loading: loading, rowHeight: 64, columnHeaderHeight: 48, sx: dataGridSx, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <DashboardEmptyState title="No employees matched" description="Try adjusting the filters or date range." icon={Users} /> } }} />
      )}

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

function rankApplications(rows: MonitoringApplicationUsage[]): RankedUsage[] {
  return rankBy(rows, getApplicationDisplayName, undefined, (row) => row.durationSeconds, (row) => row.employee?.id);
}

function rankWebsites(rows: MonitoringWebsiteUsage[]): RankedUsage[] {
  return rankBy(
    rows.filter((row) => Boolean(normalizeWebsiteDomain(row.domain || row.url))),
    (row) => normalizeWebsiteDomain(row.domain || row.url) ?? 'Not available',
    (row) => normalizeBrowserName(row.browserName),
    (row) => row.durationSeconds,
    (row) => row.employee?.id,
  );
}

function rankBrowsers(appRows: MonitoringApplicationUsage[], websiteRows: MonitoringWebsiteUsage[]): RankedUsage[] {
  const records = [
    ...appRows.map((row) => ({ label: browserNameFromApplication(getApplicationDisplayName(row)), durationSeconds: row.durationSeconds, employeeId: row.employee?.id })),
    ...websiteRows.map((row) => ({ label: normalizeBrowserName(row.browserName) ?? 'Unknown', durationSeconds: row.durationSeconds, employeeId: row.employee?.id })),
  ].filter((row): row is { label: string; durationSeconds: number; employeeId: string | undefined } => Boolean(row.label));

  return rankBy(records, (row) => row.label, undefined, (row) => row.durationSeconds, (row) => row.employeeId);
}

function rankBy<T>(
  rows: T[],
  labelFor: (row: T) => string,
  browserFor?: (row: T) => string | null | undefined,
  durationFor: (row: T) => number = (row) => (row as { durationSeconds?: number }).durationSeconds ?? 0,
  employeeFor?: (row: T) => string | undefined,
): RankedUsage[] {
  const totals = new Map<string, RankedUsage & { employeeIds: Set<string> }>();
  rows.forEach((row) => {
    const label = labelFor(row);
    const current = totals.get(label) ?? { id: label, label, durationSeconds: 0, count: 0, employeeCount: 0, browserName: browserFor?.(row), employeeIds: new Set<string>() };
    current.durationSeconds += safeSeconds(durationFor(row));
    current.count += 1;
    const employeeId = employeeFor?.(row);
    if (employeeId) current.employeeIds.add(employeeId);
    current.employeeCount = current.employeeIds.size;
    totals.set(label, current);
  });
  return Array.from(totals.values()).map(({ employeeIds: _employeeIds, ...item }) => item).sort((a, b) => b.durationSeconds - a.durationSeconds);
}

function buildEmployeeUsageRows(appRows: MonitoringApplicationUsage[], websiteRows: MonitoringWebsiteUsage[], summaryRows: MonitoringSummaryRecord[]): EmployeeUsageRow[] {
  const summaryByEmployee = new Map(summaryRows.map((row) => [row.employee.id, row]));
  const byEmployee = new Map<string, { employee: MonitoringApplicationUsage['employee']; apps: MonitoringApplicationUsage[]; websites: MonitoringWebsiteUsage[] }>();

  [...appRows, ...websiteRows].forEach((row) => {
    const employee = row.employee;
    if (!employee?.id) return;
    const current = byEmployee.get(employee.id) ?? { employee, apps: [], websites: [] };
    if ('application' in row) current.apps.push(row);
    else current.websites.push(row);
    byEmployee.set(employee.id, current);
  });

  return Array.from(byEmployee.entries()).map(([id, value]) => {
    const appRanking = rankApplications(value.apps);
    const browserRanking = rankBrowsers(value.apps, value.websites);
    const usageSeconds = value.apps.reduce((sum, row) => sum + safeSeconds(row.durationSeconds), 0);
    const summary = summaryByEmployee.get(id);
    const activeSeconds = safeSeconds(summary?.activity?.activeSeconds);
    const idleSeconds = safeSeconds(summary?.activity?.idleSeconds);
    const onlineSeconds = activeSeconds + idleSeconds;
    return {
      id,
      employee: value.employee,
      applicationsUsed: new Set(value.apps.map((row) => row.application).filter(Boolean)).size,
      topApplication: appRanking[0]?.label ?? 'Not available',
      usageSeconds,
      browserName: browserRanking[0]?.label ?? 'Not available',
      activityPercent: onlineSeconds ? percentage(activeSeconds, onlineSeconds) : null,
    };
  }).sort((a, b) => b.usageSeconds - a.usageSeconds);
}

function normalizeBrowserName(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes('chrome')) return 'Google Chrome';
  if (normalized.includes('edge') || normalized.includes('msedge')) return 'Microsoft Edge';
  if (normalized.includes('firefox')) return 'Mozilla Firefox';
  if (normalized.includes('brave')) return 'Brave';
  if (normalized.includes('opera')) return 'Opera';
  if (normalized.includes('electron')) return 'Electron';
  return null;
}

function browserNameFromApplication(application?: string | null): string | null {
  return normalizeBrowserName(application);
}

function getApplicationDisplayName(row: MonitoringApplicationUsage): string {
  const application = row as ApplicationUsageWithOptionalMetadata;
  return firstMeaningfulValue([
    application.applicationName,
    application.application,
    application.executable,
    application.processName,
    application.windowTitle,
  ]) ?? 'Unknown';
}

function normalizeWebsiteDomain(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (normalized === 'unknown' || normalized === 'unknown website') return null;
  return trimmed;
}

function firstMeaningfulValue(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (normalized === 'unknown' || normalized === 'unknown application') continue;
    return trimmed;
  }
  return null;
}

const interactiveCardSx = {
  borderColor: '#E5E7EB',
  borderRadius: 3,
  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    borderColor: '#CBD5E1',
    boxShadow: '0 14px 35px rgba(17, 24, 39, 0.08)',
  },
  '&:focus-within': {
    outline: '2px solid rgba(37, 99, 235, 0.35)',
    outlineOffset: 2,
  },
};

const progressSx = {
  height: 8,
  borderRadius: 99,
  bgcolor: '#E5E7EB',
  '& .MuiLinearProgress-bar': {
    borderRadius: 99,
    transition: 'transform 420ms ease',
  },
};

const dataGridSx = {
  border: 0,
  '& .MuiDataGrid-columnHeaders': {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    bgcolor: '#F9FAFB',
    borderBottom: '1px solid #E5E7EB',
  },
  '& .MuiDataGrid-cell': {
    alignItems: 'center',
    py: 1,
  },
  '& .MuiDataGrid-row': {
    transition: 'background-color 160ms ease',
    '&:hover': {
      bgcolor: '#F8FAFC',
    },
  },
};

function KpiCard({ label, value, caption, trend, icon: Icon, tone }: { label: string; value: string; caption: string; trend: string; icon: LucideIcon; tone: string }) {
  return (
    <Card variant="outlined" tabIndex={0} aria-label={`${label}: ${value}`} sx={{ ...interactiveCardSx, background: `linear-gradient(135deg, ${tone}0D 0%, #FFFFFF 44%)` }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Typography>
            <Typography variant="h6" sx={{ mt: 0.75, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
          </Box>
          <Box sx={{ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: `${tone}14`, color: tone, flex: '0 0 auto' }}>
            <Icon size={18} strokeWidth={2.2} aria-hidden />
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5} sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" noWrap>{caption}</Typography>
          <Typography variant="caption" sx={{ color: tone, fontWeight: 800 }} noWrap>{trend}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function RankingCard({ title, description, items, totalDuration, emptyTitle, emptyDescription = 'No records were returned for the selected filters.', icon: Icon, compact = false }: { title: string; description: string; items: RankedUsage[]; totalDuration: number; emptyTitle: string; emptyDescription?: string; icon: LucideIcon; compact?: boolean }) {
  return (
    <SectionCard title={title} description={description}>
      {items.length ? (
        <Stack gap={compact ? 1 : 1.25}>
          {items.map((item) => (
            <Box key={item.id} tabIndex={0} aria-label={`${item.label}, ${formatDuration(item.durationSeconds)}`} sx={{ p: compact ? 1 : 1.25, border: '1px solid #E5E7EB', borderRadius: 2.5, transition: 'background-color 160ms ease, border-color 160ms ease', '&:hover': { bgcolor: '#F8FAFC', borderColor: '#CBD5E1' }, '&:focus-visible': { outline: '2px solid rgba(37, 99, 235, 0.35)', outlineOffset: 2 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 0.75 }}>
                <Box sx={{ width: 30, height: 30, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#EEF2FF', color: '#2563EB', flex: '0 0 auto' }}>
                  <Icon size={16} strokeWidth={2.2} aria-hidden />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</Typography>
                  {item.employeeCount ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.employeeCount} {item.employeeCount === 1 ? 'employee' : 'employees'}</Typography> : null}
                  <Typography variant="caption" color="text.secondary">{item.count} {item.count === 1 ? 'record' : 'records'}{item.browserName ? ` • ${item.browserName}` : ''}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ flex: '0 0 auto' }}>{formatDuration(item.durationSeconds)} • {Math.round(percentage(item.durationSeconds, totalDuration))}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={percentage(item.durationSeconds, totalDuration)} sx={progressSx} />
            </Box>
          ))}
        </Stack>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </SectionCard>
  );
}

function ApplicationCell({ name, subtitle, search }: { name: string; subtitle?: string; search: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
      <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#EEF2FF', color: '#2563EB', flex: '0 0 auto' }}>
        <AppWindow size={17} strokeWidth={2.2} aria-hidden />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <HighlightedText text={name} query={search} strong />
        {subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</Typography>}
      </Box>
    </Stack>
  );
}

function WebsiteCell({ domain, url, search }: { domain: string; url?: string | null; search: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
      <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#ECFDF5', color: '#16A34A', flex: '0 0 auto' }}>
        <Globe size={17} strokeWidth={2.2} aria-hidden />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <HighlightedText text={domain} query={search} strong />
        {url && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</Typography>}
      </Box>
    </Stack>
  );
}

function HighlightedText({ text, query, strong = false, muted = false }: { text: string; query: string; strong?: boolean; muted?: boolean }) {
  const normalizedText = text || 'Not available';
  const index = query ? normalizedText.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) {
    return <Typography variant="body2" color={muted ? 'text.secondary' : 'text.primary'} sx={{ fontWeight: strong ? 850 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{normalizedText}</Typography>;
  }

  const before = normalizedText.slice(0, index);
  const match = normalizedText.slice(index, index + query.length);
  const after = normalizedText.slice(index + query.length);
  return (
    <Typography variant="body2" sx={{ fontWeight: strong ? 850 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {before}<Box component="mark" sx={{ px: 0.25, borderRadius: 0.75, bgcolor: '#FEF3C7', color: 'inherit' }}>{match}</Box>{after}
    </Typography>
  );
}

function DurationPill({ seconds }: { seconds?: number | null }) {
  return <StatusChip label={formatDuration(seconds)} tone="neutral" />;
}

function DashboardEmptyState({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <Box sx={{ py: 3, px: 2, textAlign: 'center' }}>
      <Box sx={{ mx: 'auto', mb: 1.5, width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: '#F1F5F9', color: '#64748B' }}>
        <Icon size={22} strokeWidth={2} aria-hidden />
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
    </Box>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: '#F9FAFB', border: '1px solid #E5E7EB', minWidth: 0, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
    </Box>
  );
}
