import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import {
  Apple,
  Eye,
  HardDrive,
  Laptop,
  Monitor,
  MonitorDot,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  ToggleLeft,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { useAuth } from '@/features/auth';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { useBranches, useDepartments } from '@/features/organization/hooks';
import { getEmployees } from '@/features/people/services/employees-api';
import { DeviceActionDialogs, canManageMonitoringDevices, type DeviceActionMode } from '../components/devices/DeviceActionDialogs';
import { getMonitoringDevices } from '../services/monitoring-api';
import type { MonitoringDevice, MonitoringDeviceStatus } from '../types/monitoring.types';
import { deviceStatusTone, employeeName, formatDateTime, formatEnum } from '../utils/monitoring-format';

const pageSize = 20;
const deviceStatuses: MonitoringDeviceStatus[] = ['ACTIVE', 'INACTIVE', 'TRUSTED', 'REVOKED', 'REREGISTRATION_REQUIRED'];

export default function MonitoringDevicesPage() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canManageDevices = canManageMonitoringDevices(roles);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [online, setOnline] = useState('');
  const [monitoringEnabled, setMonitoringEnabled] = useState('');
  const [browserConnected, setBrowserConnected] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize });
  const [toast, setToast] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<DeviceActionMode | null>(null);
  const [actionTarget, setActionTarget] = useState<MonitoringDevice | null>(null);

  const params = {
    page: pagination.page + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    employeeId: employeeId || undefined,
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    status: status || undefined,
    online: booleanFilterValue(online),
    monitoringEnabled: booleanFilterValue(monitoringEnabled),
    browserConnected: booleanFilterValue(browserConnected),
  };

  const devicesQuery = useQuery({
    queryKey: ['monitoring-devices', params],
    queryFn: () => getMonitoringDevices(params),
  });
  const employeesQuery = useQuery({
    queryKey: ['monitoring-device-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();

  const rows = useMemo(() => devicesQuery.data?.data.data ?? [], [devicesQuery.data?.data.data]);
  const summary = devicesQuery.data?.data.summary ?? {
    totalDevices: 0,
    online: 0,
    offline: 0,
    monitoringDisabled: 0,
  };

  const columns = useMemo<GridColDef<MonitoringDevice>[]>(() => [
    {
      field: 'device',
      headerName: 'Device',
      minWidth: 260,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => <DeviceCell device={row} />,
    },
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 240,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => row.employee
        ? <AvatarCell name={employeeName(row.employee)} email={row.employee.employeeCode} />
        : <Typography variant="body2" color="text.secondary">Unassigned</Typography>,
    },
    {
      field: 'department',
      headerName: 'Department',
      minWidth: 170,
      valueGetter: (_, row) => row.department?.name ?? 'Unassigned',
    },
    {
      field: 'branch',
      headerName: 'Branch',
      minWidth: 170,
      valueGetter: (_, row) => row.branch?.name ?? 'Unassigned',
    },
    {
      field: 'os',
      headerName: 'OS',
      minWidth: 160,
      renderCell: ({ row }) => <OsCell device={row} />,
    },
    {
      field: 'agentVersion',
      headerName: 'Agent',
      minWidth: 160,
      renderCell: ({ row }) => (
        <Stack gap={0.5}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>{row.agentVersion || 'Not available'}</Typography>
          <Chip size="small" label="Latest unknown" variant="outlined" sx={{ height: 22, width: 'fit-content' }} />
        </Stack>
      ),
    },
    {
      field: 'browserExtensionConnected',
      headerName: 'Browser',
      minWidth: 170,
      renderCell: ({ row }) => <BrowserStatus connected={row.browserExtensionConnected} />,
    },
    {
      field: 'monitoringEnabled',
      headerName: 'Monitoring',
      minWidth: 145,
      renderCell: ({ row }) => <StatusChip label={row.monitoringEnabled ? 'Enabled' : 'Disabled'} tone={row.monitoringEnabled ? 'success' : 'neutral'} />,
    },
    {
      field: 'securityStatus',
      headerName: 'Security',
      minWidth: 185,
      renderCell: ({ row }) => <StatusChip label={formatEnum(row.securityStatus ?? row.status)} tone={deviceStatusTone(row.securityStatus ?? row.status)} />,
    },
    {
      field: 'lastHeartbeatAt',
      headerName: 'Last Seen',
      minWidth: 175,
      valueGetter: (_, row) => formatDateTime(row.lastHeartbeatAt),
    },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 150,
      renderCell: ({ row }) => <StatusChip label={row.online ? 'Online' : 'Offline'} tone={row.online ? 'success' : 'danger'} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 110,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <DeviceActions
          device={row}
          canManage={canManageDevices}
          onView={(id) => navigate(`/monitoring/devices/${id}`)}
          onAction={(mode, device) => {
            setActionMode(mode);
            setActionTarget(device);
          }}
        />
      ),
    },
  ], [canManageDevices, navigate]);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setBranchId('');
    setDepartmentId('');
    setStatus('');
    setOnline('');
    setMonitoringEnabled('');
    setBrowserConnected('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function resetPage() {
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader
        title="Device Inventory"
        description="Enterprise inventory of registered desktop agent devices and latest monitoring signals."
        breadcrumbs={['Admin', 'Monitoring', 'Devices', 'Inventory']}
      />

      <SummaryCardsContainer>
        <StatCard label="Total Devices" value={String(summary.totalDevices)} helper="Matching current filters" icon={HardDrive} tone="#2563EB" />
        <StatCard label="Online" value={String(summary.online)} helper="Fresh heartbeat" icon={Wifi} tone="#16A34A" />
        <StatCard label="Offline" value={String(summary.offline)} helper="Heartbeat missing or stale" icon={WifiOff} tone="#DC2626" />
        <StatCard label="Monitoring Disabled" value={String(summary.monitoringDisabled)} helper="Inactive or revoked devices" icon={ToggleLeft} tone="#F59E0B" />
      </SummaryCardsContainer>

      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void devicesQuery.refetch()} /><ExportButton onClick={() => setToast('Device export will be connected in the reporting phase.')} /></>}>
        <SearchFilter placeholder="Search device, employee, branch, department, OS, or agent" value={search} onChange={(value) => { setSearch(value); resetPage(); }} />
        <TextField select label="Employee" size="small" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 220 } }}>
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}</MenuItem>)}
        </TextField>
        <TextField select label="Branch" size="small" value={branchId} onChange={(event) => { setBranchId(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 190 } }}>
          <MenuItem value="">All branches</MenuItem>
          {(branchesQuery.data?.data.data ?? []).map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
        </TextField>
        <TextField select label="Department" size="small" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 200 } }}>
          <MenuItem value="">All departments</MenuItem>
          {(departmentsQuery.data?.data.data ?? []).map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
        </TextField>
        <TextField select label="Device Status" size="small" value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 165 } }}>
          <MenuItem value="">All statuses</MenuItem>
          {deviceStatuses.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
        </TextField>
        <TextField select label="Online" size="small" value={online} onChange={(event) => { setOnline(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 145 } }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Online</MenuItem>
          <MenuItem value="false">Offline</MenuItem>
        </TextField>
        <TextField select label="Monitoring" size="small" value={monitoringEnabled} onChange={(event) => { setMonitoringEnabled(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 165 } }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Enabled</MenuItem>
          <MenuItem value="false">Disabled</MenuItem>
        </TextField>
        <TextField select label="Browser" size="small" value={browserConnected} onChange={(event) => { setBrowserConnected(event.target.value); resetPage(); }} sx={{ minWidth: { xs: '100%', md: 180 } }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Connected</MenuItem>
          <MenuItem value="false">Missing/Unknown</MenuItem>
        </TextField>
      </FilterToolbar>

      <DataTable
        title="Device Inventory"
        rows={rows}
        columns={columns}
        toolbar={<></>}
        gridProps={{
          loading: devicesQuery.isFetching,
          rowHeight: 76,
          columnHeaderHeight: 48,
          paginationMode: 'server',
          rowCount: devicesQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          sortingMode: 'client',
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No registered devices found." description="Devices will appear after employees sign in through the desktop agent." />,
          },
        }}
      />

      <DeviceActionDialogs
        mode={actionMode}
        target={actionTarget}
        open={Boolean(actionMode && actionTarget)}
        onClose={() => {
          setActionMode(null);
          setActionTarget(null);
        }}
        onSuccess={setToast}
      />

      {devicesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void devicesQuery.refetch()}>Retry</Button>}>Devices could not be loaded.</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {(branchesQuery.isError || departmentsQuery.isError) && <Alert severity="warning">Organization filters could not be loaded.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}><Typography variant="body2">{toast}</Typography></Alert>}
    </PageLayout>
  );
}

function booleanFilterValue(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function DeviceCell({ device }: { device: MonitoringDevice }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
      <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#EFF6FF', color: '#2563EB', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Monitor size={19} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.deviceName || device.hostname || 'Unnamed device'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.hostname || device.deviceIdentifier}
        </Typography>
      </Box>
    </Stack>
  );
}

function OsCell({ device }: { device: MonitoringDevice }) {
  const Icon = osIcon(device.operatingSystem || device.platform);
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Icon size={18} />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{device.operatingSystem || device.platform || 'Unknown'}</Typography>
        <Typography variant="caption" color="text.secondary">{device.osVersion || 'Version unavailable'}</Typography>
      </Box>
    </Stack>
  );
}

function BrowserStatus({ connected }: { connected: boolean | null }) {
  if (connected === true) return <StatusChip label="Extension Connected" tone="success" />;
  if (connected === false) return <StatusChip label="Extension Missing" tone="warning" />;
  return <StatusChip label="Unknown" tone="neutral" />;
}

function DeviceActions({
  device,
  canManage,
  onView,
  onAction,
}: {
  device: MonitoringDevice;
  canManage: boolean;
  onView: (id: string) => void;
  onAction: (mode: DeviceActionMode, device: MonitoringDevice) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const monitoringLabel = device.monitoringEnabled ? 'Disable Monitoring' : 'Enable Monitoring';

  function chooseAction(mode: DeviceActionMode) {
    setAnchor(null);
    onAction(mode, device);
  }

  return (
    <>
      <Tooltip title="Device actions">
        <IconButton size="small" aria-label={`Actions for ${device.deviceName || device.hostname || 'device'}`} onClick={(event) => setAnchor(event.currentTarget)}>
          <MoreHorizontal size={18} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => {
          setAnchor(null);
          onView(device.id);
        }}>
          <ListItemIcon><Eye size={16} /></ListItemIcon>
          <ListItemText>View Details</ListItemText>
        </MenuItem>
        {canManage && [
          { label: 'Rename', icon: Pencil, mode: 'rename' as const },
          { label: 'Reassign', icon: Laptop, mode: 'reassign' as const },
          { label: monitoringLabel, icon: ToggleLeft, mode: 'monitoring' as const },
          { label: 'Trust', icon: ShieldCheck, mode: 'trust' as const },
          { label: 'Revoke', icon: ShieldX, mode: 'revoke' as const },
          { label: 'Reset Registration', icon: RotateCcw, mode: 'reset-registration' as const },
          { label: 'Force Re-register', icon: RefreshCw, mode: 'force-reregister' as const },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <MenuItem key={action.label} onClick={() => chooseAction(action.mode)}>
              <ListItemIcon><Icon size={16} /></ListItemIcon>
              <ListItemText>{action.label}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

function osIcon(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('mac')) return Apple;
  if (normalized.includes('linux')) return Laptop;
  return MonitorDot;
}
