import { Alert, Box, Button, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCircle2, Clock, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { useAuth } from '@/features/auth';
import { getEmployees } from '@/features/people/services/employees-api';
import {
  acknowledgeMonitoringAlert,
  evaluateMonitoringAlerts,
  getMonitoringAlerts,
  resolveMonitoringAlert,
} from '../services/monitoring-api';
import type { MonitoringAlert, MonitoringAlertSeverity, MonitoringAlertStatus, MonitoringAlertType } from '../types/monitoring.types';

const alertTypes: Array<{ value: MonitoringAlertType; label: string }> = [
  { value: 'DEVICE_OFFLINE', label: 'Device offline' },
  { value: 'MISSING_HEARTBEAT', label: 'Missing heartbeat' },
  { value: 'MONITORING_DISABLED', label: 'Monitoring disabled' },
  { value: 'DEVICE_REVOKED', label: 'Device revoked' },
  { value: 'REREGISTRATION_REQUIRED', label: 'Re-registration required' },
  { value: 'EXCESSIVE_IDLE', label: 'Excessive idle' },
  { value: 'SCREENSHOT_MISSING', label: 'Screenshot missing' },
];
const defaultRange = 'today' as const;

function severityTone(severity: MonitoringAlertSeverity): StatusTone {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}

function statusTone(status: MonitoringAlertStatus): StatusTone {
  if (status === 'OPEN') return 'danger';
  if (status === 'ACKNOWLEDGED') return 'warning';
  return 'success';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function employeeName(alert: MonitoringAlert) {
  const user = alert.employee?.user;
  return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : 'Company alert';
}

export default function MonitoringAlertsPage() {
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const canManage = roles.some((role) => ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER'].includes(role));
  const canEvaluate = roles.some((role) => ['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MonitoringAlertStatus | ''>('OPEN');
  const [severity, setSeverity] = useState<MonitoringAlertSeverity | ''>('');
  const [type, setType] = useState<MonitoringAlertType | ''>('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue(defaultRange));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [action, setAction] = useState<{ kind: 'ACK' | 'RESOLVE'; alert: MonitoringAlert } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => ({
    page: pagination.page + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    status: status || undefined,
    severity: severity || undefined,
    type: type || undefined,
    employeeId: employeeId || undefined,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
  }), [dateRange.dateFrom, dateRange.dateTo, employeeId, pagination.page, pagination.pageSize, search, severity, status, type]);

  const alertsQuery = useQuery({ queryKey: ['monitoring-alerts', params], queryFn: () => getMonitoringAlerts(params).then((response) => response.data) });
  const employeesQuery = useQuery({ queryKey: ['employees-selector-alerts'], queryFn: () => getEmployees({ page: 1, limit: 100 }).then((response) => response.data.data), staleTime: 5 * 60_000 });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeMonitoringAlert(alertId),
    onSuccess: async () => {
      setToast('Alert acknowledged.');
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: ['monitoring-alerts'] });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => resolveMonitoringAlert(alertId, { resolutionNote: 'Resolved from Alert Center' }),
    onSuccess: async () => {
      setToast('Alert resolved.');
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: ['monitoring-alerts'] });
    },
  });
  const evaluateMutation = useMutation({
    mutationFn: evaluateMonitoringAlerts,
    onSuccess: async (response) => {
      setToast(`Evaluation completed. ${response.data.detected} new alerts detected, ${response.data.resolved} auto-resolved.`);
      await queryClient.invalidateQueries({ queryKey: ['monitoring-alerts'] });
    },
  });

  function resetFilters() {
    setSearch('');
    setStatus('OPEN');
    setSeverity('');
    setType('');
    setEmployeeId('');
    setDateRange(createDateRangeValue(defaultRange));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  const columns = useMemo<GridColDef<MonitoringAlert>[]>(() => [
    {
      field: 'title',
      headerName: 'Alert',
      flex: 1.4,
      minWidth: 260,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography component={RouterLink} to={`/monitoring/alerts/${row.id}`} sx={{ fontWeight: 850, color: 'primary.main', textDecoration: 'none' }}>
            {row.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{row.message}</Typography>
        </Box>
      ),
    },
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 220,
      flex: 1,
      renderCell: ({ row }) => (
        <Box>
          <Typography fontWeight={800}>{employeeName(row)}</Typography>
          <Typography variant="caption" color="text.secondary">{row.employee?.employeeCode ?? row.device?.deviceName ?? 'Company scope'}</Typography>
        </Box>
      ),
    },
    { field: 'severity', headerName: 'Severity', width: 130, renderCell: ({ row }) => <StatusChip label={row.severity} tone={severityTone(row.severity)} /> },
    { field: 'status', headerName: 'Status', width: 150, renderCell: ({ row }) => <StatusChip label={row.status} tone={statusTone(row.status)} /> },
    { field: 'type', headerName: 'Type', minWidth: 190, valueGetter: (_, row) => alertTypes.find((item) => item.value === row.type)?.label ?? row.type },
    { field: 'lastDetectedAt', headerName: 'Last detected', minWidth: 180, valueGetter: (_, row) => formatDate(row.lastDetectedAt) },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 230,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={1}>
          <Button size="small" component={RouterLink} to={`/monitoring/alerts/${row.id}`}>View</Button>
          {canManage && row.status !== 'RESOLVED' && <Button size="small" onClick={() => setAction({ kind: 'ACK', alert: row })}>Ack</Button>}
          {canManage && row.status !== 'RESOLVED' && <Button size="small" color="success" onClick={() => setAction({ kind: 'RESOLVE', alert: row })}>Resolve</Button>}
        </Stack>
      ),
    },
  ], [canManage]);

  const rows = alertsQuery.data?.data ?? [];
  const summary = alertsQuery.data?.summary;
  const loading = alertsQuery.isLoading;

  return (
    <PageLayout>
      <PageHeader title="Alert Center" description="Review monitoring alerts, acknowledge active issues, and track resolution history." breadcrumbs={['Admin', 'Monitoring', 'Alerts']} />

      {toast && <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>}
      {alertsQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void alertsQuery.refetch()}>Retry</Button>}>Unable to load monitoring alerts.</Alert>}

      <SummaryCardsContainer minCardWidth={190}>
        <StatCard label="Open" value={String(summary?.open ?? 0)} helper="Needs attention" icon={BellRing} tone="#DC2626" />
        <StatCard label="Acknowledged" value={String(summary?.acknowledged ?? 0)} helper="Owned by a reviewer" icon={Clock} tone="#F59E0B" />
        <StatCard label="Critical Open" value={String(summary?.criticalOpen ?? 0)} helper="Highest priority" icon={ShieldAlert} tone="#B91C1C" />
        <StatCard label="Warning Open" value={String(summary?.warningOpen ?? 0)} helper="Watch closely" icon={TriangleAlert} tone="#D97706" />
        <StatCard label="Resolved Today" value={String(summary?.resolvedToday ?? 0)} helper="Closed lifecycle" icon={CheckCircle2} tone="#16A34A" />
      </SummaryCardsContainer>

      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void alertsQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} />{canEvaluate && <Tooltip title="Run detection now"><Button variant="outlined" onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>Evaluate</Button></Tooltip>}</>}>
        <DateRangePicker value={dateRange} defaultPreset={defaultRange} onChange={(value) => { setDateRange(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <SearchFilter placeholder="Search alerts, employees, or devices" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Status" size="small" value={status} onChange={(event) => { setStatus(event.target.value as MonitoringAlertStatus | ''); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 170 }}>
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="OPEN">Open</MenuItem>
          <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
          <MenuItem value="RESOLVED">Resolved</MenuItem>
        </TextField>
        <TextField select label="Severity" size="small" value={severity} onChange={(event) => { setSeverity(event.target.value as MonitoringAlertSeverity | ''); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 170 }}>
          <MenuItem value="">All severities</MenuItem>
          <MenuItem value="CRITICAL">Critical</MenuItem>
          <MenuItem value="WARNING">Warning</MenuItem>
          <MenuItem value="INFO">Info</MenuItem>
        </TextField>
        <TextField select label="Type" size="small" value={type} onChange={(event) => { setType(event.target.value as MonitoringAlertType | ''); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 220 }}>
          <MenuItem value="">All types</MenuItem>
          {alertTypes.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 220 }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.user ? `${employee.user.firstName} ${employee.user.lastName}` : employee.employeeCode}</MenuItem>)}
        </TextField>
      </FilterToolbar>

      {loading ? <LoadingSkeleton rows={10} /> : rows.length === 0 ? <EmptyState title="No monitoring alerts found" description="No alerts match the selected filters." /> : (
        <DataTable
          title="Monitoring Alerts"
          rows={rows}
          columns={columns}
          toolbar={<Typography variant="body2" color="text.secondary">Showing alerts from server-side filters.</Typography>}
          gridProps={{
            paginationMode: 'server',
            rowCount: alertsQuery.data?.meta.total ?? 0,
            paginationModel: pagination,
            onPaginationModelChange: setPagination,
            getRowHeight: () => 72,
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(action)}
        title={action?.kind === 'ACK' ? 'Acknowledge alert?' : 'Resolve alert?'}
        description={action ? `${action.alert.title} will be ${action.kind === 'ACK' ? 'acknowledged' : 'resolved'}.` : undefined}
        confirmLabel={action?.kind === 'ACK' ? 'Acknowledge' : 'Resolve'}
        loading={acknowledgeMutation.isPending || resolveMutation.isPending}
        onClose={() => setAction(null)}
        onConfirm={() => {
          if (!action) return;
          if (action.kind === 'ACK') acknowledgeMutation.mutate(action.alert.id);
          else resolveMutation.mutate(action.alert.id);
        }}
      />
    </PageLayout>
  );
}
