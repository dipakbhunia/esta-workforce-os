import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  AppWindow,
  Eye,
  HardDrive,
  Laptop,
  MonitorDot,
  Radio,
  ShieldCheck,
  ToggleLeft,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getMonitoringDevicesOverview } from '../services/monitoring-api';
import type { MonitoringDeviceOverview } from '../types/monitoring.types';
import { employeeName, formatDateTime } from '../utils/monitoring-format';

type RecentDevice = MonitoringDeviceOverview['recentlyRegistered'][number];

export default function MonitoringDevicesOverviewPage() {
  const navigate = useNavigate();
  const overviewQuery = useQuery({
    queryKey: ['monitoring-devices-overview'],
    queryFn: getMonitoringDevicesOverview,
  });
  const overview = overviewQuery.data?.data;
  const totalDevices = overview?.totals.devices ?? 0;

  const recentColumns = useMemo<GridColDef<RecentDevice>[]>(() => [
    {
      field: 'deviceName',
      headerName: 'Device',
      minWidth: 230,
      flex: 1,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '12px', bgcolor: '#EFF6FF', color: '#2563EB', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
            <HardDrive size={18} />
          </Box>
          <Typography variant="body2" fontWeight={800} noWrap>{row.deviceName || 'Unnamed device'}</Typography>
        </Stack>
      ),
    },
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 230,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => row.employee
        ? <AvatarCell name={employeeName(row.employee)} email={row.employee.employeeCode} />
        : <Typography variant="body2" color="text.secondary">Unassigned</Typography>,
    },
    {
      field: 'registeredAt',
      headerName: 'Registered',
      minWidth: 180,
      valueGetter: (_, row) => formatDateTime(row.registeredAt),
    },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 140,
      renderCell: ({ row }) => <StatusChip label={row.online ? 'Online' : 'Offline'} tone={row.online ? 'success' : 'danger'} />,
    },
    {
      field: 'actions',
      headerName: 'Open Details',
      minWidth: 140,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Button size="small" startIcon={<Eye size={16} />} onClick={() => navigate(`/monitoring/devices/${row.id}`)}>
          Open
        </Button>
      ),
    },
  ], [navigate]);

  if (overviewQuery.isLoading) {
    return (
      <PageLayout>
        <LoadingSkeleton rows={10} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Device Overview"
        description="High-level health, distribution and registration signals for monitored desktop agent devices."
        breadcrumbs={['Admin', 'Monitoring', 'Devices', 'Overview']}
        primaryActionLabel="Open Inventory"
        primaryActionTo="/monitoring/devices/inventory"
      />

      {overviewQuery.isError && (
        <Alert severity="error" action={<Button color="inherit" onClick={() => void overviewQuery.refetch()}>Retry</Button>}>
          Device overview could not be loaded.
        </Alert>
      )}

      {overview && (
        <Stack spacing={2.5}>
          <SummaryCardsContainer>
            <StatCard label="Total Devices" value={String(overview.totals.devices)} helper="Visible devices" icon={HardDrive} tone="#2563EB" />
            <StatCard label="Online" value={String(overview.totals.online)} helper="Fresh heartbeat" icon={Wifi} tone="#16A34A" />
            <StatCard label="Offline" value={String(overview.totals.offline)} helper="Stale or missing heartbeat" icon={WifiOff} tone="#DC2626" />
            <StatCard label="Monitoring Disabled" value={String(overview.totals.monitoringDisabled)} helper="Inactive or revoked devices" icon={ToggleLeft} tone="#F59E0B" />
            <StatCard label="Unassigned Devices" value={String(overview.totals.unassigned)} helper="Not supported by current schema" icon={MonitorDot} tone="#6B7280" />
          </SummaryCardsContainer>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2.5 }}>
            <SectionCard title="Device Health" description="Real aggregate health signals from monitoring records.">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <HealthMetric icon={ShieldCheck} label="Browser Connected" value={overview.browserStatus.connected} helper="Devices with website usage" tone="#16A34A" />
                <HealthMetric icon={Radio} label="Browser Unknown" value={overview.browserStatus.unknown} helper="No website usage persisted" tone="#6B7280" />
                <HealthMetric icon={AppWindow} label="Agent Versions" value={overview.agentVersions.length} helper="Distinct versions reported" tone="#2563EB" />
                <HealthMetric icon={AlertTriangle} label="Attention Items" value={attentionTotal(overview)} helper="Real count categories" tone="#DC2626" />
              </Box>
            </SectionCard>

            <SectionCard title="Devices Requiring Attention" description="No invented health rules. Counts reuse current monitoring semantics.">
              <Stack spacing={1.25}>
                <AttentionRow label="Offline beyond heartbeat timeout" value={overview.attention.offlineLongTime} />
                <AttentionRow label="Never reported heartbeat" value={overview.attention.neverReported} />
                <AttentionRow label="Monitoring disabled" value={overview.attention.monitoringDisabled} />
                <AttentionRow label="No assigned employee" value={overview.attention.noEmployeeAssigned} />
              </Stack>
            </SectionCard>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2.5 }}>
            <SectionCard title="Operating System Distribution" description="Grouped from the persisted device platform.">
              <DistributionList items={overview.operatingSystems} total={totalDevices} emptyTitle="No operating system data" />
            </SectionCard>

            <SectionCard title="Agent Version Distribution" description="Reported desktop agent versions only. Update intelligence is not available yet.">
              <DistributionList items={overview.agentVersions} total={totalDevices} emptyTitle="No agent version data" />
            </SectionCard>
          </Box>

          <SectionCard title="Recently Registered Devices" description="Newest registered devices, limited to 10 records.">
            <DataTable
              title="Newest Devices"
              rows={overview.recentlyRegistered}
              columns={recentColumns}
              toolbar={<></>}
              gridProps={{
                getRowId: (row) => row.id,
                autoHeight: true,
                hideFooter: true,
                rowHeight: 68,
                slots: {
                  noRowsOverlay: () => <EmptyState title="No registered devices" description="Devices will appear after employees sign in through the desktop agent." />,
                },
              }}
            />
          </SectionCard>

          <SectionCard title="Quick Actions" description="Placeholders only. Mutations are reserved for Device Actions phase.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(5, 1fr)' }, gap: 1.5 }}>
              {['Inventory', 'Device Details', 'Assign Device', 'Trust Device', 'Device History'].map((label) => (
                <Card key={label} variant="outlined" sx={{ bgcolor: '#F8FAFC' }}>
                  <CardContent>
                    <Stack spacing={1}>
                      <Chip size="small" label="Placeholder" sx={{ alignSelf: 'flex-start' }} />
                      <Typography variant="body2" fontWeight={850}>{label}</Typography>
                      <Typography variant="caption" color="text.secondary">Available in a future device phase.</Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </SectionCard>
        </Stack>
      )}
    </PageLayout>
  );
}

function HealthMetric({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  helper: string;
  tone: string;
}) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.75, bgcolor: '#FFFFFF' }}>
      <Stack direction="row" gap={1.25} alignItems="center">
        <Box sx={{ width: 38, height: 38, borderRadius: '12px', bgcolor: `${tone}18`, color: tone, display: 'grid', placeItems: 'center' }}>
          <Icon size={19} />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
          <Typography variant="h4">{value.toLocaleString()}</Typography>
          <Typography variant="caption" color="text.secondary">{helper}</Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function AttentionRow({ label, value }: { label: string; value: number }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, px: 1.5, py: 1.25 }}>
      <Typography variant="body2" fontWeight={750}>{label}</Typography>
      <StatusChip label={String(value)} tone={value > 0 ? 'warning' : 'neutral'} />
    </Stack>
  );
}

function DistributionList({
  items,
  total,
  emptyTitle,
}: {
  items: Array<{ name: string; count: number }>;
  total: number;
  emptyTitle: string;
}) {
  if (!items.length) return <EmptyState title={emptyTitle} description="Distribution will appear after devices are registered." />;
  return (
    <Stack spacing={1.5}>
      {items.map((item) => {
        const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return (
          <Box key={item.name}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
              <Typography variant="body2" fontWeight={800}>{item.name}</Typography>
              <Typography variant="caption" color="text.secondary">{item.count} devices • {percentage}%</Typography>
            </Stack>
            <Box sx={{ mt: 0.75, height: 8, borderRadius: 99, bgcolor: '#E5E7EB', overflow: 'hidden' }}>
              <Box sx={{ width: `${percentage}%`, height: '100%', bgcolor: '#2563EB', borderRadius: 99 }} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

function attentionTotal(overview: MonitoringDeviceOverview) {
  return overview.attention.offlineLongTime +
    overview.attention.neverReported +
    overview.attention.monitoringDisabled +
    overview.attention.noEmployeeAssigned;
}
