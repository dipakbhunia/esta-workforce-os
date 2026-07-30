import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock, History, Monitor, ShieldAlert, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { acknowledgeMonitoringAlert, getMonitoringAlert, resolveMonitoringAlert } from '../services/monitoring-api';
import type { MonitoringAlert, MonitoringAlertSeverity, MonitoringAlertStatus } from '../types/monitoring.types';

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

function fullName(user?: { firstName: string; lastName: string; email: string } | null) {
  if (!user) return 'Not available';
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function employeeName(alert: MonitoringAlert) {
  return alert.employee ? fullName(alert.employee.user) : 'Company alert';
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  );
}

export default function MonitoringAlertDetailsPage() {
  const { alertId } = useParams();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const [action, setAction] = useState<'ACK' | 'RESOLVE' | null>(null);
  const canManage = roles.some((role) => ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER'].includes(role));
  const alertQuery = useQuery({
    queryKey: ['monitoring-alert', alertId],
    queryFn: () => getMonitoringAlert(alertId ?? '').then((response) => response.data),
    enabled: Boolean(alertId),
  });
  const acknowledgeMutation = useMutation({
    mutationFn: () => acknowledgeMonitoringAlert(alertId ?? ''),
    onSuccess: async () => {
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monitoring-alert', alertId] }),
        queryClient.invalidateQueries({ queryKey: ['monitoring-alerts'] }),
      ]);
    },
  });
  const resolveMutation = useMutation({
    mutationFn: () => resolveMonitoringAlert(alertId ?? '', { resolutionNote: 'Resolved from Alert Details' }),
    onSuccess: async () => {
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monitoring-alert', alertId] }),
        queryClient.invalidateQueries({ queryKey: ['monitoring-alerts'] }),
      ]);
    },
  });

  if (!alertId) {
    return <PageLayout><EmptyState title="Alert not found" description="A valid alert ID is required." /></PageLayout>;
  }
  if (alertQuery.isLoading) {
    return <PageLayout><LoadingSkeleton rows={10} /></PageLayout>;
  }
  if (alertQuery.isError) {
    return (
      <PageLayout>
        <PageHeader title="Alert unavailable" description="The alert could not be loaded or is outside your visibility." breadcrumbs={['Admin', 'Monitoring', 'Alerts', 'Details']} />
        <Alert severity="error" action={<Button color="inherit" onClick={() => void alertQuery.refetch()}>Retry</Button>}>Unable to load alert details.</Alert>
      </PageLayout>
    );
  }

  const alert = alertQuery.data;
  if (!alert) return <PageLayout><EmptyState title="Alert not found" description="No alert was returned for this request." /></PageLayout>;
  const isActive = alert.status !== 'RESOLVED';

  return (
    <PageLayout>
      <Stack spacing={2.5}>
        <Button component={RouterLink} to="/monitoring/alerts" startIcon={<ArrowLeft size={17} />} sx={{ alignSelf: 'flex-start' }}>Back to Alert Center</Button>
        <PageHeader title={alert.title} description={alert.message} breadcrumbs={['Admin', 'Monitoring', 'Alerts', alert.title]} />
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
          <Stack direction="row" gap={1} flexWrap="wrap">
            <StatusChip label={alert.status} tone={statusTone(alert.status)} />
            <StatusChip label={alert.severity} tone={severityTone(alert.severity)} />
            <StatusChip label={alert.type.replaceAll('_', ' ')} tone="info" />
          </Stack>
          {canManage && isActive && (
            <Stack direction="row" gap={1}>
              <Button variant="outlined" onClick={() => setAction('ACK')}>Acknowledge</Button>
              <Button variant="contained" color="success" onClick={() => setAction('RESOLVE')}>Resolve</Button>
            </Stack>
          )}
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <Box>
          <SectionCard title="Alert Information" description="Detection and lifecycle state.">
            <Stack spacing={2}>
              <DetailItem label="Detected" value={formatDate(alert.detectedAt)} />
              <DetailItem label="Last detected" value={formatDate(alert.lastDetectedAt)} />
              <DetailItem label="Acknowledged" value={formatDate(alert.acknowledgedAt)} />
              <DetailItem label="Acknowledged by" value={fullName(alert.acknowledgedBy)} />
              <DetailItem label="Resolved" value={formatDate(alert.resolvedAt)} />
              <DetailItem label="Resolved by" value={fullName(alert.resolvedBy)} />
              <DetailItem label="Resolution note" value={alert.resolutionNote ?? 'Not available'} />
            </Stack>
          </SectionCard>
        </Box>
        <Box>
          <SectionCard title="Condition Details" description="Related employee, device, and safe metadata.">
            <Stack spacing={2}>
              <DetailItem label="Employee" value={employeeName(alert)} />
              <DetailItem label="Employee code" value={alert.employee?.employeeCode ?? 'Not available'} />
              <DetailItem label="Department" value={alert.employee?.department?.name ?? 'Not available'} />
              <DetailItem label="Branch" value={alert.employee?.branch?.name ?? 'Not available'} />
              <DetailItem label="Device" value={alert.device?.deviceName ?? 'Not available'} />
              <DetailItem label="Platform" value={alert.device?.platform ?? 'Not available'} />
              <DetailItem label="Last heartbeat" value={formatDate(alert.device?.lastSeenAt)} />
              <Typography variant="caption" color="text.secondary">Sensitive fields such as tokens, URLs, keyboard values, and screenshot object keys are not shown.</Typography>
            </Stack>
          </SectionCard>
        </Box>
      </Box>

      <SectionCard title="Lifecycle History" description="Every detection, acknowledgement, and resolution event for this alert.">
        {alert.events.length === 0 ? <EmptyState title="No lifecycle events" description="Alert history will appear here as the condition changes." /> : (
          <Stack spacing={1.5}>
            {alert.events.map((event, index) => (
              <Card key={event.id} variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Stack direction="row" gap={1.5} alignItems="flex-start">
                    <Box sx={{ width: 34, height: 34, borderRadius: '12px', bgcolor: '#EEF2FF', color: 'primary.main', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                      {event.type.includes('RESOLVED') ? <CheckCircle2 size={18} /> : event.type === 'ACKNOWLEDGED' ? <Clock size={18} /> : event.type === 'DETECTED' ? <ShieldAlert size={18} /> : <History size={18} />}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                        <Typography fontWeight={850}>{event.type.replaceAll('_', ' ')}</Typography>
                        <Typography variant="caption" color="text.secondary">{formatDate(event.occurredAt)}</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{event.note ?? `Event ${index + 1} recorded by ${fullName(event.actor)}.`}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Linked Monitoring Areas" description="Use these modules to investigate the source condition.">
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.25}>
          {alert.deviceId && <Button component={RouterLink} to={`/monitoring/devices/${alert.deviceId}`} variant="outlined" startIcon={<Monitor size={17} />}>Open Device</Button>}
          <Button component={RouterLink} to="/monitoring/activity" variant="outlined" startIcon={<UserRound size={17} />}>Open Activity</Button>
          <Button component={RouterLink} to="/monitoring/screenshots" variant="outlined">Open Screenshots</Button>
        </Stack>
      </SectionCard>

      <ConfirmDialog
        open={Boolean(action)}
        title={action === 'ACK' ? 'Acknowledge alert?' : 'Resolve alert?'}
        description={action === 'ACK' ? 'This records that the alert is being reviewed.' : 'This closes the alert lifecycle with a resolution note.'}
        confirmLabel={action === 'ACK' ? 'Acknowledge' : 'Resolve'}
        loading={acknowledgeMutation.isPending || resolveMutation.isPending}
        onClose={() => setAction(null)}
        onConfirm={() => {
          if (action === 'ACK') acknowledgeMutation.mutate();
          if (action === 'RESOLVE') resolveMutation.mutate();
        }}
      />
    </PageLayout>
  );
}
