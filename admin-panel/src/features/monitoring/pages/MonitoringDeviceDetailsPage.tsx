import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Camera,
  Clock,
  Globe,
  HardDrive,
  Keyboard,
  Laptop,
  Monitor,
  MousePointerClick,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ShieldX,
  ToggleLeft,
  UserRound,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/features/auth';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { DeviceActionDialogs, canManageMonitoringDevices, type DeviceActionMode, type DeviceActionTarget } from '../components/devices/DeviceActionDialogs';
import { DeviceHistoryTimeline } from '../components/devices/DeviceHistoryTimeline';
import { getMonitoringDeviceDetail } from '../services/monitoring-api';
import type { MonitoringDeviceDetail, MonitoringDeviceRecentActivityType } from '../types/monitoring.types';
import { deviceStatusTone, formatDateTime, formatDuration, formatEnum } from '../utils/monitoring-format';

export default function MonitoringDeviceDetailsPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canManageDevices = canManageMonitoringDevices(roles);
  const [actionMode, setActionMode] = useState<DeviceActionMode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'history'>('overview');
  const deviceQuery = useQuery({
    queryKey: ['monitoring-device-detail', deviceId],
    queryFn: () => getMonitoringDeviceDetail(deviceId ?? ''),
    enabled: Boolean(deviceId),
  });

  if (!deviceId) {
    return (
      <PageLayout>
        <EmptyState title="Device not found" description="A valid device ID is required to open device details." />
      </PageLayout>
    );
  }

  if (deviceQuery.isLoading) {
    return (
      <PageLayout>
        <LoadingSkeleton rows={10} />
      </PageLayout>
    );
  }

  if (deviceQuery.isError) {
    return (
      <PageLayout>
        <PageHeader title="Device unavailable" description="The device could not be loaded or is outside your monitoring visibility." breadcrumbs={['Admin', 'Monitoring', 'Devices', 'Details']} />
        <Alert severity="error" action={<Button color="inherit" onClick={() => void deviceQuery.refetch()}>Retry</Button>}>
          Device details could not be loaded.
        </Alert>
      </PageLayout>
    );
  }

  const device = deviceQuery.data?.data;
  if (!device) {
    return (
      <PageLayout>
        <EmptyState title="Device not found" description="No device details were returned for this request." />
      </PageLayout>
    );
  }

  const deviceName = device.identity.deviceName || device.identity.hostname || 'Unnamed device';
  const employeeLabel = device.assignment.employee?.name || 'Unassigned';
  const actionTarget: DeviceActionTarget = {
    id: device.id,
    deviceName,
    monitoringEnabled: device.monitoring.monitoringEnabled,
    securityStatus: device.monitoring.securityStatus,
    employee: device.assignment.employee
      ? {
          id: device.assignment.employee.id,
          name: device.assignment.employee.name,
          employeeCode: device.assignment.employee.employeeCode,
        }
      : null,
  };

  return (
    <PageLayout>
      <Stack spacing={2.5}>
        <Button
          component={RouterLink}
          to="/monitoring/devices/inventory"
          variant="text"
          startIcon={<ArrowLeft size={18} />}
          sx={{ alignSelf: 'flex-start' }}
        >
          Back to Device Inventory
        </Button>

        <PageHeader
          title={deviceName}
          description="Read-only desktop agent device profile with scoped monitoring signals."
          breadcrumbs={['Admin', 'Monitoring', 'Devices', deviceName]}
        />

        <DeviceActionDialogs
          mode={actionMode}
          target={actionTarget}
          open={Boolean(actionMode)}
          onClose={() => setActionMode(null)}
          onSuccess={(message) => {
            setToast(message);
            void deviceQuery.refetch();
          }}
        />
        {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tabs
            value={activeTab}
            onChange={(_, value) => setActiveTab(value)}
            aria-label="Device details tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab value="overview" label="Overview" />
            <Tab value="security" label="Security" />
            <Tab value="history" label="History" />
          </Tabs>
        </Box>

        {activeTab === 'history' ? (
          <DeviceHistoryTimeline deviceId={device.id} />
        ) : (
          <>

        <SectionCard
          title="Device Overview"
          description="Current identity, assignment and safe monitoring state."
          action={(
            <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end">
              <StatusChip label={device.monitoring.online ? 'Online' : 'Offline'} tone={device.monitoring.online ? 'success' : 'danger'} />
              <StatusChip label={device.monitoring.monitoringEnabled ? 'Monitoring Enabled' : 'Monitoring Disabled'} tone={device.monitoring.monitoringEnabled ? 'success' : 'neutral'} />
            </Stack>
          )}
        >
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box sx={{ width: 68, height: 68, borderRadius: '20px', bgcolor: '#EFF6FF', color: '#2563EB', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <Monitor size={34} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h3">{deviceName}</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {device.identity.hostname || 'Hostname not available'} • {device.identity.operatingSystem || device.identity.platform || 'OS not available'} • Agent {device.identity.agentVersion || 'not available'}
              </Typography>
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
                <Chip size="small" icon={<UserRound size={14} />} label={employeeLabel} />
                <Chip size="small" icon={<HardDrive size={14} />} label={device.identity.deviceType || 'Device type not available'} />
                <Chip size="small" icon={<ShieldCheck size={14} />} label={`Browser ${formatEnum(device.browserIntegration.status)}`} />
              </Stack>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}>
              {canManageDevices ? (
                <>
                  <Button size="small" variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setActionMode('rename')}>Rename</Button>
                  <Button size="small" variant="outlined" startIcon={<Laptop size={16} />} onClick={() => setActionMode('reassign')}>Reassign</Button>
                  <Button size="small" variant={device.monitoring.monitoringEnabled ? 'outlined' : 'contained'} startIcon={<ToggleLeft size={16} />} onClick={() => setActionMode('monitoring')}>
                    {device.monitoring.monitoringEnabled ? 'Disable Monitoring' : 'Enable Monitoring'}
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<ShieldCheck size={16} />} onClick={() => setActionMode('trust')}>Trust</Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<ShieldX size={16} />} onClick={() => setActionMode('revoke')}>Revoke</Button>
                  <Button size="small" variant="outlined" startIcon={<RotateCcw size={16} />} onClick={() => setActionMode('reset-registration')}>Reset Registration</Button>
                  <Button size="small" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => setActionMode('force-reregister')}>Force Re-register</Button>
                </>
              ) : (
                <Tooltip title="Your role can view device details but cannot manage devices.">
                  <span><Button size="small" variant="outlined" disabled>Read only</Button></span>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        </SectionCard>

        <SummaryCardsContainer>
          <StatCard label="Active Time" value={formatDuration(device.todayActivity.activeSeconds)} helper="Today, this device only" icon={Activity} tone="#16A34A" />
          <StatCard label="Idle Time" value={formatDuration(device.todayActivity.idleSeconds)} helper="Today, this device only" icon={Clock} tone="#F59E0B" />
          <StatCard label="Apps Used" value={String(device.todayActivity.appsUsed)} helper="Distinct apps today" icon={Laptop} tone="#2563EB" />
          <StatCard label="Websites Used" value={String(device.todayActivity.websitesUsed)} helper="Distinct domains today" icon={Globe} tone="#7C3AED" />
        </SummaryCardsContainer>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.05fr 0.95fr' }, gap: 2.5 }}>
          <SectionCard title="Device Information" description="Persisted registration metadata from the desktop agent.">
            <InfoGrid>
              <InfoRow label="Device Name" value={device.identity.deviceName} />
              <InfoRow label="Hostname" value={device.identity.hostname} />
              <InfoRow label="Device Identifier" value={device.identity.deviceIdentifier} />
              <InfoRow label="Device Type" value={device.identity.deviceType} />
              <InfoRow label="Platform" value={device.identity.platform} />
              <InfoRow label="Operating System" value={device.identity.operatingSystem} />
              <InfoRow label="OS Version" value={device.identity.osVersion} />
              <InfoRow label="Architecture" value={device.identity.architecture} />
              <InfoRow label="Agent Version" value={device.identity.agentVersion} />
              <InfoRow label="Registered At" value={formatDateTime(device.identity.registeredAt)} />
            </InfoGrid>
          </SectionCard>

          <SectionCard title="Employee Assignment" description="Current employee and organization relation.">
            <InfoGrid>
              <InfoRow label="Employee" value={device.assignment.employee?.name ?? null} />
              <InfoRow label="Employee Code" value={device.assignment.employee?.employeeCode ?? null} />
              <InfoRow label="Department" value={device.assignment.department?.name ?? null} />
              <InfoRow label="Branch" value={device.assignment.branch?.name ?? null} />
              <InfoRow label="Company" value={device.assignment.company?.name ?? null} />
            </InfoGrid>
          </SectionCard>
        </Box>

        <SectionCard title="Device Security" description="Enterprise registration and trust state. Secrets are never displayed in the admin panel.">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <StatusMetric icon={ShieldCheck} label="Security Status" value={formatEnum(device.monitoring.securityStatus)} tone={statusToneColor(device.monitoring.securityStatus)} />
            <StatusMetric icon={device.monitoring.trusted ? ShieldCheck : ShieldX} label="Trusted" value={device.monitoring.trusted ? 'Trusted' : 'Not trusted'} tone={device.monitoring.trusted ? '#16A34A' : '#6B7280'} helper={formatDateTime(device.monitoring.trustedAt)} />
            <StatusMetric icon={ShieldX} label="Revoked" value={device.monitoring.revoked ? 'Revoked' : 'Not revoked'} tone={device.monitoring.revoked ? '#DC2626' : '#6B7280'} helper={formatDateTime(device.monitoring.revokedAt)} />
            <StatusMetric icon={RotateCcw} label="Registration" value={device.monitoring.registrationRequired ? 'Required' : 'Current'} tone={device.monitoring.registrationRequired ? '#F59E0B' : '#16A34A'} helper={`Version ${device.monitoring.registrationVersion}`} />
          </Box>
          <InfoGrid>
            <InfoRow label="Latest Registration" value={formatDateTime(device.identity.registeredAt)} />
            <InfoRow label="Registration Reset At" value={formatDateTime(device.monitoring.registrationResetAt)} />
            <InfoRow label="Re-registration Required At" value={formatDateTime(device.monitoring.reregistrationRequiredAt)} />
            <InfoRow label="Monitoring Enabled" value={device.monitoring.monitoringEnabled ? 'Yes' : 'No'} />
          </InfoGrid>
        </SectionCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2.5 }}>
          <SectionCard title="Monitoring Status" description="Online state reuses the backend heartbeat timeout policy.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <StatusMetric icon={device.monitoring.monitoringEnabled ? Wifi : WifiOff} label="Monitoring" value={device.monitoring.monitoringEnabled ? 'Enabled' : 'Disabled'} tone={device.monitoring.monitoringEnabled ? '#16A34A' : '#6B7280'} />
              <StatusMetric icon={device.monitoring.online ? Wifi : WifiOff} label="Status" value={device.monitoring.online ? 'Online' : 'Offline'} tone={device.monitoring.online ? '#16A34A' : '#DC2626'} />
              <StatusMetric icon={Radio} label="Last Heartbeat" value={formatDateTime(device.monitoring.lastHeartbeatAt)} helper={relativeTime(device.monitoring.lastHeartbeatAt)} />
              <StatusMetric icon={Activity} label="Last Activity" value={formatDateTime(device.monitoring.lastActivityAt)} helper={relativeTime(device.monitoring.lastActivityAt)} />
              <StatusMetric icon={Camera} label="Last Screenshot" value={formatDateTime(device.monitoring.lastScreenshotAt)} helper={relativeTime(device.monitoring.lastScreenshotAt)} />
              <StatusMetric icon={Clock} label="Last Seen" value={formatDateTime(device.monitoring.lastSeenAt)} helper={relativeTime(device.monitoring.lastSeenAt)} />
            </Box>
          </SectionCard>

          <SectionCard title="Browser Integration" description="Shown only from real persisted website activity. Browser Bridge status itself is not persisted yet.">
            <Stack spacing={2}>
              <StatusMetric
                icon={Globe}
                label="Browser Status"
                value={formatEnum(device.browserIntegration.status)}
                helper={device.browserIntegration.status === 'CONNECTED' ? 'Website usage has been received for this device.' : 'Browser Bridge connection state is not persisted yet.'}
                tone={device.browserIntegration.status === 'CONNECTED' ? '#16A34A' : '#6B7280'}
              />
              <InfoRow label="Last Connected At" value={formatDateTime(device.browserIntegration.lastConnectedAt)} />
            </Stack>
          </SectionCard>
        </Box>

        <SectionCard title="Today's Input Activity" description="Aggregate counts only. No key names, typed text, coordinates or raw events are stored or shown.">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <InputMetric icon={Keyboard} label="Keyboard" value={device.todayActivity.keyboardCount} />
            <InputMetric icon={MousePointerClick} label="Mouse Clicks" value={device.todayActivity.mouseClickCount} />
            <InputMetric icon={Activity} label="Mouse Movement" value={device.todayActivity.mouseMoveCount} />
            <InputMetric icon={ScrollText} label="Scroll" value={device.todayActivity.scrollCount} />
          </Box>
        </SectionCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '0.9fr 1.1fr' }, gap: 2.5 }}>
          <SectionCard
            title="Screenshot Summary"
            description="Screenshot metadata is device-scoped. Preview access remains controlled by the screenshot gallery."
            action={<Button size="small" variant="outlined" onClick={() => navigate('/monitoring/screenshots')}>View in Screenshot Gallery</Button>}
          >
            <Stack spacing={2}>
              <InfoRow label="Today's Screenshot Count" value={String(device.screenshots.todayCount)} />
              <InfoRow label="Last Screenshot Time" value={formatDateTime(device.screenshots.lastScreenshotAt)} />
              {device.screenshots.latestScreenshot ? (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, bgcolor: '#F8FAFC' }}>
                  <Typography variant="body2" fontWeight={800}>Latest screenshot metadata</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    Captured {formatDateTime(device.screenshots.latestScreenshot.capturedAt)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                    Preview opens through the authorized screenshot gallery.
                  </Typography>
                </Box>
              ) : (
                <EmptyState title="No screenshots for this device" description="Screenshots will appear after the desktop agent captures and uploads them." />
              )}
            </Stack>
          </SectionCard>

          <SectionCard title="Recent Device Activity" description="Latest privacy-safe monitoring events from existing device data.">
            {device.recentActivity.length ? (
              <Stack divider={<Divider flexItem />} spacing={0}>
                {device.recentActivity.map((item) => (
                  <Stack key={`${item.type}-${item.id}`} direction="row" gap={1.5} sx={{ py: 1.5 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: '12px', bgcolor: '#EFF6FF', color: '#2563EB', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                      {recentActivityIcon(item.type)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800}>{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatDateTime(item.occurredAt)}{item.description ? ` • ${item.description}` : ''}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <EmptyState title="No recent device activity" description="Recent activity will appear after heartbeats, sessions, screenshots, apps or website usage are recorded." />
            )}
          </SectionCard>
        </Box>          </>
        )}

      </Stack>
    </PageLayout>
  );
}

function InfoGrid({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
      {children}
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 1.5, bgcolor: '#FFFFFF' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 750, wordBreak: 'break-word' }}>{value || 'Not available'}</Typography>
    </Box>
  );
}

function StatusMetric({
  icon: Icon,
  label,
  value,
  helper,
  tone = '#2563EB',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper?: string;
  tone?: string;
}) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.75, bgcolor: '#FFFFFF' }}>
      <Stack direction="row" gap={1.25} alignItems="flex-start">
        <Box sx={{ width: 36, height: 36, borderRadius: '12px', bgcolor: `${tone}18`, color: tone, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
          <Icon size={18} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 850, mt: 0.25 }}>{value}</Typography>
          {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
        </Box>
      </Stack>
    </Box>
  );
}

function InputMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | null }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.75, bgcolor: '#FFFFFF' }}>
      <Stack direction="row" gap={1.25} alignItems="center">
        <Box sx={{ width: 36, height: 36, borderRadius: '12px', bgcolor: '#EEF2FF', color: '#2563EB', display: 'grid', placeItems: 'center' }}>
          <Icon size={18} />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
          <Typography variant="h4">{value === null ? 'Not available' : value.toLocaleString()}</Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function statusToneColor(status?: string | null) {
  switch (deviceStatusTone(status)) {
    case 'success':
      return '#16A34A';
    case 'warning':
      return '#F59E0B';
    case 'danger':
      return '#DC2626';
    default:
      return '#6B7280';
  }
}

function relativeTime(value?: string | null) {
  if (!value) return 'Never reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function recentActivityIcon(type: MonitoringDeviceRecentActivityType) {
  switch (type) {
    case 'HEARTBEAT':
      return <Radio size={17} />;
    case 'ACTIVITY':
      return <Activity size={17} />;
    case 'SCREENSHOT':
      return <Camera size={17} />;
    case 'APPLICATION':
      return <Laptop size={17} />;
    case 'WEBSITE':
      return <Globe size={17} />;
    default:
      return <Monitor size={17} />;
  }
}
