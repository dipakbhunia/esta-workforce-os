import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, MailOpen, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { getNotifications, markAllNotificationsRead, markNotificationRead, markNotificationUnread } from '../services/notifications-api';
import type { NotificationRecord, NotificationSeverity, NotificationType } from '../types/notification.types';

function severityTone(severity?: NotificationSeverity | null): StatusTone {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const defaultRange = 'currentWeek' as const;

export default function NotificationCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [read, setRead] = useState<'all' | 'read' | 'unread'>('all');
  const [severity, setSeverity] = useState<NotificationSeverity | ''>('');
  const [type, setType] = useState<NotificationType | ''>('');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue(defaultRange));
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => ({
    page: pagination.page + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    read: read === 'all' ? undefined : read === 'read',
    severity: severity || undefined,
    type: type || undefined,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
  }), [dateRange.dateFrom, dateRange.dateTo, pagination.page, pagination.pageSize, read, search, severity, type]);

  const notificationsQuery = useQuery({ queryKey: ['notifications', params], queryFn: () => getNotifications(params).then((response) => response.data), refetchOnWindowFocus: true });
  const markReadMutation = useMutation({ mutationFn: markNotificationRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  const markUnreadMutation = useMutation({ mutationFn: markNotificationUnread, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  const markAllMutation = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: async () => { setToast('All notifications marked as read.'); await queryClient.invalidateQueries({ queryKey: ['notifications'] }); } });

  function resetFilters() {
    setSearch('');
    setRead('all');
    setSeverity('');
    setType('');
    setDateRange(createDateRangeValue(defaultRange));
    setPagination((current) => ({ ...current, page: 0 }));
  }

  const columns = useMemo<GridColDef<NotificationRecord>[]>(() => [
    { field: 'title', headerName: 'Notification', flex: 1.5, minWidth: 300, renderCell: ({ row }) => <Box sx={{ minWidth: 0 }}><Typography fontWeight={850} color={row.readAt ? 'text.primary' : 'primary.main'} noWrap>{row.title}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{row.message}</Typography></Box> },
    { field: 'severity', headerName: 'Severity', width: 130, renderCell: ({ row }) => <StatusChip label={row.severity ?? 'INFO'} tone={severityTone(row.severity)} /> },
    { field: 'alertId', headerName: 'Related Alert', minWidth: 170, valueGetter: (_, row) => row.alertStatus ? `${row.alertStatus}` : 'Not linked' },
    { field: 'createdAt', headerName: 'Created', minWidth: 180, valueGetter: (_, row) => formatDate(row.createdAt) },
    { field: 'readAt', headerName: 'Read Status', width: 150, renderCell: ({ row }) => <StatusChip label={row.readAt ? 'READ' : 'UNREAD'} tone={row.readAt ? 'neutral' : 'info'} /> },
    { field: 'actions', headerName: 'Actions', width: 260, sortable: false, renderCell: ({ row }) => <Stack direction="row" gap={1}>{row.detailsPath && <Button size="small" onClick={() => navigate(row.detailsPath ?? '/notifications')}>View</Button>}{row.readAt ? <Button size="small" onClick={() => markUnreadMutation.mutate(row.id)}>Mark unread</Button> : <Button size="small" onClick={() => markReadMutation.mutate(row.id)}>Mark read</Button>}</Stack> },
  ], [markReadMutation, markUnreadMutation, navigate]);

  const rows = notificationsQuery.data?.data ?? [];
  const summary = notificationsQuery.data?.summary;

  return (
    <PageLayout>
      <PageHeader title="Notification Center" description="Review in-app alert notifications and manage read status without changing the underlying alert lifecycle." breadcrumbs={['Admin', 'Notifications']} />
      <Stack direction="row" justifyContent="flex-end"><Button startIcon={<CheckCheck size={17} />} onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>Mark all read</Button></Stack>
      {toast && <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>}
      {notificationsQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void notificationsQuery.refetch()}>Retry</Button>}>Unable to load notifications.</Alert>}
      <SummaryCardsContainer minCardWidth={220}>
        <StatCard label="Unread" value={String(summary?.unread ?? 0)} helper="Needs your attention" icon={Bell} tone="#2563EB" />
        <StatCard label="Critical Unread" value={String(summary?.criticalUnread ?? 0)} helper="Highest priority" icon={ShieldAlert} tone="#DC2626" />
        <StatCard label="Total Notifications" value={String(summary?.totalFiltered ?? 0)} helper="Matching filters" icon={MailOpen} tone="#16A34A" />
      </SummaryCardsContainer>
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void notificationsQuery.refetch()} /><ExportButton onClick={() => setToast('Export will be connected in the reporting phase.')} /></>}>
        <DateRangePicker value={dateRange} defaultPreset={defaultRange} onChange={(value) => { setDateRange(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <SearchFilter placeholder="Search notifications" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Read status" size="small" value={read} onChange={(event) => { setRead(event.target.value as typeof read); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 160 }}><MenuItem value="all">All</MenuItem><MenuItem value="unread">Unread</MenuItem><MenuItem value="read">Read</MenuItem></TextField>
        <TextField select label="Severity" size="small" value={severity} onChange={(event) => { setSeverity(event.target.value as NotificationSeverity | ''); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 160 }}><MenuItem value="">All</MenuItem><MenuItem value="CRITICAL">Critical</MenuItem><MenuItem value="WARNING">Warning</MenuItem><MenuItem value="INFO">Info</MenuItem></TextField>
        <TextField select label="Type" size="small" value={type} onChange={(event) => { setType(event.target.value as NotificationType | ''); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 220 }}><MenuItem value="">All types</MenuItem><MenuItem value="ALERT_OPENED">Alert opened</MenuItem><MenuItem value="ALERT_REOPENED">Alert reopened</MenuItem><MenuItem value="ALERT_ACKNOWLEDGED">Acknowledged</MenuItem><MenuItem value="ALERT_RESOLVED">Resolved</MenuItem><MenuItem value="ALERT_AUTO_RESOLVED">Auto resolved</MenuItem></TextField>
      </FilterToolbar>
      {notificationsQuery.isLoading ? <LoadingSkeleton rows={10} /> : rows.length === 0 ? <EmptyState title="No notifications found" description="No notifications match the selected filters." /> : <DataTable title="Notifications" rows={rows} columns={columns} gridProps={{ paginationMode: 'server', rowCount: notificationsQuery.data?.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 72 }} />}
    </PageLayout>
  );
}
