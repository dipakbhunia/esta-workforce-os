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
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  Gauge,
  MailCheck,
  ShieldAlert,
  Timer,
  TrendingUp,
  Wifi,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DateRangePicker, createDateRangeValue, type DateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { exportMonitoringOperationsReport, getMonitoringOperationsDashboard } from '../services/monitoring-api';
import type {
  MonitoringAlertSeverity,
  MonitoringAlertStatus,
  MonitoringAlertType,
  MonitoringOperationsDashboard,
  MonitoringOperationsParams,
  OperationsGroupBy,
  OperationsRankingItem,
  OperationsSlaMetric,
} from '../types/monitoring.types';

const defaultRange = createDateRangeValue('currentWeek');

const alertTypeOptions: Array<{ value: MonitoringAlertType; label: string }> = [
  { value: 'DEVICE_OFFLINE', label: 'Device offline' },
  { value: 'MISSING_HEARTBEAT', label: 'Missing heartbeat' },
  { value: 'MONITORING_DISABLED', label: 'Monitoring disabled' },
  { value: 'DEVICE_REVOKED', label: 'Device revoked' },
  { value: 'REREGISTRATION_REQUIRED', label: 'Re-registration required' },
  { value: 'EXCESSIVE_IDLE', label: 'Excessive idle' },
  { value: 'SCREENSHOT_MISSING', label: 'Screenshot missing' },
];

const severityOptions: Array<{ value: MonitoringAlertSeverity; label: string }> = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'INFO', label: 'Info' },
];

const statusOptions: Array<{ value: MonitoringAlertStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'RESOLVED', label: 'Resolved' },
];

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatPercent(value?: number | null) {
  return `${Math.round(value ?? 0)}%`;
}

function formatMinutes(value?: number | null) {
  if (value === null || value === undefined) return 'Not available';
  if (value < 60) return `${Math.round(value)}m`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatSeconds(value?: number | null) {
  if (value === null || value === undefined) return 'Not available';
  if (value < 60) return `${Math.round(value)}s`;
  return formatMinutes(value / 60);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function ratingTone(rating: MonitoringOperationsDashboard['executiveSummary']['rating']): StatusTone {
  if (rating === 'Excellent') return 'success';
  if (rating === 'Good') return 'info';
  if (rating === 'Needs Attention') return 'warning';
  return 'danger';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getResponseBlob(response: unknown) {
  if (response instanceof Blob) return response;
  const maybe = response as { data?: Blob };
  return maybe.data instanceof Blob ? maybe.data : new Blob([String(maybe.data ?? '')], { type: 'text/plain' });
}

function HeatmapList({ items }: { items: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) {
    return <Typography variant="body2" color="text.secondary">No alert activity in this dimension.</Typography>;
  }

  return (
    <Stack gap={1}>
      {items.slice(0, 10).map((item) => (
        <Box key={item.label}>
          <Stack direction="row" justifyContent="space-between" gap={2} sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={700} noWrap>{item.label}</Typography>
            <Typography variant="body2" color="text.secondary">{formatNumber(item.count)}</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={(item.count / max) * 100}
            sx={{ height: 8, borderRadius: 999, bgcolor: '#F3F4F6' }}
          />
        </Box>
      ))}
    </Stack>
  );
}

function RankingList({ items, emptyText }: { items: OperationsRankingItem[]; emptyText: string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) {
    return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
  }

  return (
    <Stack gap={1.25}>
      {items.slice(0, 8).map((item, index) => (
        <Card key={`${item.id}-${item.label}`} variant="outlined" sx={{ borderColor: '#E5E7EB' }}>
          <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Stack direction="row" alignItems="center" gap={1.25} minWidth={0}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '10px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: '#EFF6FF',
                    color: '#1D4ED8',
                    fontSize: 12,
                    fontWeight: 800,
                    flex: '0 0 auto',
                  }}
                >
                  {index + 1}
                </Box>
                <Box minWidth={0}>
                  <Typography variant="body2" fontWeight={800} noWrap>{item.label}</Typography>
                  {item.secondary && <Typography variant="caption" color="text.secondary" noWrap>{item.secondary}</Typography>}
                </Box>
              </Stack>
              <Stack direction="row" alignItems="center" gap={1} minWidth={110}>
                <LinearProgress
                  variant="determinate"
                  value={(item.count / max) * 100}
                  sx={{ height: 7, borderRadius: 999, flex: 1, bgcolor: '#F3F4F6' }}
                />
                <Typography variant="body2" fontWeight={800}>{formatNumber(item.count)}</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function SlaCard({ title, metric }: { title: string; metric: OperationsSlaMetric }) {
  return (
    <Card variant="outlined" sx={{ borderColor: '#E5E7EB' }}>
      <CardContent>
        <Typography variant="h4">{title}</Typography>
        <Typography variant="h2" sx={{ mt: 1 }}>{formatMinutes(metric.averageMinutes)}</Typography>
        <Typography variant="body2" color="text.secondary">Average across {formatNumber(metric.samples)} persisted samples</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mt: 2 }}>
          <Metric label="Median" value={formatMinutes(metric.medianMinutes)} />
          <Metric label="Minimum" value={formatMinutes(metric.minMinutes)} />
          <Metric label="Maximum" value={formatMinutes(metric.maxMinutes)} />
        </Box>
        <Stack gap={1} sx={{ mt: 2 }}>
          {metric.distribution.map((item) => (
            <Stack key={item.label} direction="row" alignItems="center" gap={1}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 72 }}>{item.label}</Typography>
              <LinearProgress
                variant="determinate"
                value={metric.samples ? (item.count / metric.samples) * 100 : 0}
                sx={{ height: 7, borderRadius: 999, flex: 1, bgcolor: '#F3F4F6' }}
              />
              <Typography variant="caption" fontWeight={800}>{item.count}</Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={800}>{value}</Typography>
    </Box>
  );
}

function TrendPanel({ data }: { data: MonitoringOperationsDashboard['trend'] }) {
  const max = Math.max(1, ...data.flatMap((point) => [point.openAlerts, point.resolvedAlerts, point.criticalAlerts, point.warningAlerts, point.infoAlerts]));
  if (!data.length) {
    return <EmptyState title="No alert trend data" description="No alert events were detected for the selected filters." />;
  }

  return (
    <Stack gap={1.5}>
      {data.map((point) => (
        <Box key={point.bucket}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 0.75 }}>
            <Typography variant="body2" fontWeight={800}>{point.bucket}</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end">
              <StatusChip label={`Open ${point.openAlerts}`} tone="danger" />
              <StatusChip label={`Resolved ${point.resolvedAlerts}`} tone="success" />
              <StatusChip label={`Critical ${point.criticalAlerts}`} tone="danger" />
              <StatusChip label={`Warning ${point.warningAlerts}`} tone="warning" />
              <StatusChip label={`Info ${point.infoAlerts}`} tone="info" />
            </Stack>
          </Stack>
          <Stack direction="row" sx={{ height: 12, borderRadius: 999, overflow: 'hidden', bgcolor: '#F3F4F6' }}>
            <Box sx={{ width: `${(point.openAlerts / max) * 100}%`, bgcolor: '#DC2626' }} />
            <Box sx={{ width: `${(point.resolvedAlerts / max) * 100}%`, bgcolor: '#16A34A' }} />
            <Box sx={{ width: `${(point.warningAlerts / max) * 100}%`, bgcolor: '#F59E0B' }} />
            <Box sx={{ width: `${(point.infoAlerts / max) * 100}%`, bgcolor: '#2563EB' }} />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export default function MonitoringOperationsPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);
  const [groupBy, setGroupBy] = useState<OperationsGroupBy>('DAY');
  const [alertType, setAlertType] = useState<MonitoringAlertType | ''>('');
  const [severity, setSeverity] = useState<MonitoringAlertSeverity | ''>('');
  const [status, setStatus] = useState<MonitoringAlertStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [exporting, setExporting] = useState<'CSV' | 'PDF' | null>(null);

  const params = useMemo<MonitoringOperationsParams>(() => ({
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
    groupBy,
    companyId: companyId || undefined,
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    employeeId: employeeId || undefined,
    alertType: alertType || undefined,
    severity: severity || undefined,
    status: status || undefined,
  }), [alertType, branchId, companyId, dateRange.dateFrom, dateRange.dateTo, departmentId, employeeId, groupBy, severity, status]);

  const operationsQuery = useQuery({
    queryKey: ['monitoring-operations-dashboard', params],
    queryFn: () => getMonitoringOperationsDashboard(params),
  });

  const data = operationsQuery.data?.data;

  function resetFilters() {
    setDateRange(createDateRangeValue('currentWeek'));
    setGroupBy('DAY');
    setAlertType('');
    setSeverity('');
    setStatus('');
    setCompanyId('');
    setBranchId('');
    setDepartmentId('');
    setEmployeeId('');
  }

  async function exportReport(format: 'CSV' | 'PDF') {
    setExporting(format);
    try {
      const response = await exportMonitoringOperationsReport({ ...params, format });
      downloadBlob(getResponseBlob(response), `monitoring-operations.${format.toLowerCase()}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Operations Dashboard"
        description="Monitor alert volume, SLA health, notification reliability, and monitoring coverage from one operational command center."
        breadcrumbs={['Admin', 'Monitoring', 'Operations Dashboard']}
      />

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => operationsQuery.refetch()} />
            <Tooltip title="Download CSV operations summary">
              <span>
                <ExportButton onClick={() => exportReport('CSV')} />
              </span>
            </Tooltip>
            <Button variant="outlined" startIcon={<Download size={17} />} onClick={() => exportReport('PDF')} disabled={exporting === 'PDF'}>
              PDF
            </Button>
          </>
        )}
      >
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <TextField select label="Trend" value={groupBy} onChange={(event) => setGroupBy(event.target.value as OperationsGroupBy)} size="small">
          <MenuItem value="DAY">Daily</MenuItem>
          <MenuItem value="WEEK">Weekly</MenuItem>
          <MenuItem value="MONTH">Monthly</MenuItem>
        </TextField>
        <TextField select label="Alert Type" value={alertType} onChange={(event) => setAlertType(event.target.value as MonitoringAlertType | '')} size="small">
          <MenuItem value="">All alert types</MenuItem>
          {alertTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <TextField select label="Severity" value={severity} onChange={(event) => setSeverity(event.target.value as MonitoringAlertSeverity | '')} size="small">
          <MenuItem value="">All severities</MenuItem>
          {severityOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <TextField select label="Status" value={status} onChange={(event) => setStatus(event.target.value as MonitoringAlertStatus | '')} size="small">
          <MenuItem value="">All statuses</MenuItem>
          {statusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <TextField label="Company ID" value={companyId} onChange={(event) => setCompanyId(event.target.value)} size="small" />
        <TextField label="Branch ID" value={branchId} onChange={(event) => setBranchId(event.target.value)} size="small" />
        <TextField label="Department ID" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} size="small" />
        <TextField label="Employee ID" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} size="small" />
      </FilterToolbar>

      {operationsQuery.isLoading && <LoadingSkeleton rows={8} />}
      {operationsQuery.isError && (
        <Alert severity="error" action={<Button onClick={() => operationsQuery.refetch()}>Retry</Button>}>
          Operations dashboard could not be loaded. Please try again.
        </Alert>
      )}

      {data && (
        <>
          <SummaryCardsContainer minCardWidth={190}>
            <StatCard label="Open Alerts" value={formatNumber(data.kpis.openAlerts)} helper="Currently unresolved" icon={ShieldAlert} tone="#DC2626" />
            <StatCard label="Critical Alerts" value={formatNumber(data.kpis.criticalAlerts)} helper="High priority operations" icon={AlertTriangle} tone="#DC2626" />
            <StatCard label="Acknowledged" value={formatNumber(data.kpis.acknowledgedAlerts)} helper="Owned by reviewers" icon={CheckCircle2} tone="#F59E0B" />
            <StatCard label="Resolved Today" value={formatNumber(data.kpis.resolvedToday)} helper="Closed in the current day" icon={TrendingUp} tone="#16A34A" />
            <StatCard label="Unread Notifications" value={formatNumber(data.kpis.unreadNotifications)} helper="In-app action queue" icon={Bell} tone="#2563EB" />
            <StatCard label="Notification Success" value={formatPercent(data.kpis.notificationSuccessPercentage)} helper="All delivery channels" icon={Bell} tone="#16A34A" />
            <StatCard label="Email Success" value={formatPercent(data.kpis.emailDeliverySuccessPercentage)} helper="Email delivery reliability" icon={MailCheck} tone="#16A34A" />
            <StatCard label="Average MTTA" value={formatMinutes(data.kpis.averageMttaMinutes)} helper="Acknowledge SLA" icon={Timer} tone="#F59E0B" />
            <StatCard label="Average MTTR" value={formatMinutes(data.kpis.averageMttrMinutes)} helper="Resolution SLA" icon={Timer} tone="#DC2626" />
            <StatCard label="Monitoring Coverage" value={formatPercent(data.kpis.monitoringCoveragePercentage)} helper={`Productivity coverage ${formatPercent(data.kpis.productivityCoveragePercentage)}`} icon={Wifi} tone="#2563EB" />
          </SummaryCardsContainer>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.1fr 0.9fr' }, gap: 3 }}>
            <SectionCard title="Executive Summary" description="Weighted health score from real monitoring, alert, notification, productivity, and device metrics.">
              <Stack gap={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                  <Box>
                    <Typography variant="h1">{data.executiveSummary.score}</Typography>
                    <Typography variant="body2" color="text.secondary">Executive Health Score</Typography>
                  </Box>
                  <StatusChip label={data.executiveSummary.rating} tone={ratingTone(data.executiveSummary.rating)} />
                </Stack>
                <LinearProgress variant="determinate" value={clampPercent(data.executiveSummary.score)} sx={{ height: 12, borderRadius: 999, bgcolor: '#F3F4F6' }} />
                <Typography variant="body2" color="text.secondary">{data.executiveSummary.formula}</Typography>
              </Stack>
            </SectionCard>

            <SectionCard title="Monitoring Health" description="Device and policy coverage indicators.">
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
                <Metric label="Devices Online" value={formatNumber(data.monitoringHealth.devicesOnline)} />
                <Metric label="Devices Offline" value={formatNumber(data.monitoringHealth.devicesOffline)} />
                <Metric label="Devices Revoked" value={formatNumber(data.monitoringHealth.devicesRevoked)} />
                <Metric label="Healthy Heartbeats" value={formatNumber(data.monitoringHealth.heartbeatHealthy)} />
                <Metric label="Screenshot Healthy" value={formatNumber(data.monitoringHealth.screenshotHealthy)} />
                <Metric label="Policy Coverage" value={formatPercent(data.monitoringHealth.policyCoveragePercentage)} />
              </Box>
            </SectionCard>
          </Box>

          <SectionCard title="Alert Trend" description="Open, resolved, and severity trends for the selected period.">
            <TrendPanel data={data.trend} />
          </SectionCard>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
            <SlaCard title="MTTA" metric={data.sla.mtta} />
            <SlaCard title="MTTR" metric={data.sla.mttr} />
          </Box>

          <SectionCard title="Notification Analytics" description="Delivery reliability without exposing notification content or SMTP secrets.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <Metric label="In-App Sent" value={formatNumber(data.notificationAnalytics.inAppSent)} />
              <Metric label="Email Sent" value={formatNumber(data.notificationAnalytics.emailSent)} />
              <Metric label="Email Failed" value={formatNumber(data.notificationAnalytics.emailFailed)} />
              <Metric label="Pending Retry" value={formatNumber(data.notificationAnalytics.pendingRetry)} />
              <Metric label="Retry Success" value={formatPercent(data.notificationAnalytics.retrySuccessPercentage)} />
              <Metric label="Avg Delivery" value={formatSeconds(data.notificationAnalytics.averageDeliverySeconds)} />
              <Metric label="Failure Rate" value={formatPercent(data.notificationAnalytics.deliveryFailurePercentage)} />
            </Box>
          </SectionCard>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
            <SectionCard title="Heatmap: Hour of Day"><HeatmapList items={data.heatmaps.hourOfDay ?? []} /></SectionCard>
            <SectionCard title="Heatmap: Day of Week"><HeatmapList items={data.heatmaps.dayOfWeek ?? []} /></SectionCard>
            <SectionCard title="Heatmap: Department"><HeatmapList items={data.heatmaps.department ?? []} /></SectionCard>
            <SectionCard title="Heatmap: Branch"><HeatmapList items={data.heatmaps.branch ?? []} /></SectionCard>
            <SectionCard title="Heatmap: Alert Type"><HeatmapList items={data.heatmaps.alertType ?? []} /></SectionCard>
            <SectionCard title="Heatmap: Device"><HeatmapList items={data.heatmaps.device ?? []} /></SectionCard>
            <SectionCard title="Heatmap: Employee"><HeatmapList items={data.heatmaps.employee ?? []} /></SectionCard>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
            <SectionCard title="Top Alert Types"><RankingList items={data.rankings.topAlertTypes ?? []} emptyText="No alert types found." /></SectionCard>
            <SectionCard title="Top Devices"><RankingList items={data.rankings.topDevices ?? []} emptyText="No device alerts found." /></SectionCard>
            <SectionCard title="Top Employees"><RankingList items={data.rankings.topEmployees ?? []} emptyText="No employee alert concentration found." /></SectionCard>
            <SectionCard title="Top Departments"><RankingList items={data.rankings.topDepartments ?? []} emptyText="No department alerts found." /></SectionCard>
            <SectionCard title="Frequently Offline Devices"><RankingList items={data.rankings.mostFrequentlyOfflineDevices ?? []} emptyText="No repeated offline devices found." /></SectionCard>
            <SectionCard title="Screenshot Missing Devices"><RankingList items={data.rankings.mostScreenshotMissingDevices ?? []} emptyText="No screenshot missing device alerts found." /></SectionCard>
            <SectionCard title="Most Idle Employees"><RankingList items={data.rankings.mostIdleEmployees ?? []} emptyText="No excessive idle alerts found." /></SectionCard>
            <SectionCard title="Repeated Alerts"><RankingList items={data.rankings.mostRepeatedAlerts ?? []} emptyText="No repeated alerts found." /></SectionCard>
          </Box>
        </>
      )}
    </PageLayout>
  );
}
