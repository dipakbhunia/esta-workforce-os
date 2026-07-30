import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { RoleName } from '@/features/auth';
import { getEmployees } from '@/features/people/services/employees-api';
import type { Employee } from '@/features/people/types/employee.types';
import {
  forceMonitoringDeviceReregistration,
  reassignMonitoringDevice,
  renameMonitoringDevice,
  resetMonitoringDeviceRegistration,
  revokeMonitoringDevice,
  trustMonitoringDevice,
  updateMonitoringDeviceMonitoring,
} from '../../services/monitoring-api';

export type DeviceActionMode =
  | 'rename'
  | 'reassign'
  | 'monitoring'
  | 'trust'
  | 'revoke'
  | 'reset-registration'
  | 'force-reregister';

export interface DeviceActionTarget {
  id: string;
  deviceName: string;
  monitoringEnabled: boolean;
  securityStatus?: string | null;
  employee?: {
    id: string;
    name?: string | null;
    employeeCode?: string | null;
    email?: string | null;
  } | null;
}

interface DeviceActionDialogsProps {
  mode: DeviceActionMode | null;
  target: DeviceActionTarget | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const employeePageSize = 50;

export function canManageMonitoringDevices(roles: RoleName[]) {
  return roles.some((role) => ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR'].includes(role));
}

export function DeviceActionDialogs({ mode, target, open, onClose, onSuccess }: DeviceActionDialogsProps) {
  const queryClient = useQueryClient();
  const [deviceName, setDeviceName] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: ['monitoring-device-action-employees', employeeSearch],
    queryFn: () => getEmployees({ page: 1, limit: employeePageSize, search: employeeSearch || undefined }),
    enabled: open && mode === 'reassign',
  });

  const employees = useMemo(() => employeesQuery.data?.data.data ?? [], [employeesQuery.data?.data.data]);

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setDeviceName(target.deviceName);
    setEmployeeId(target.employee?.id ?? '');
    setEmployeeSearch('');
  }, [open, target]);

  const invalidateDeviceQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monitoring-devices'] }),
      queryClient.invalidateQueries({ queryKey: ['monitoring-devices-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['monitoring-device-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['monitoring-live-status'] }),
    ]);
  };

  const renameMutation = useMutation({
    mutationFn: () => renameMonitoringDevice(target?.id ?? '', { deviceName: deviceName.trim() }),
    onSuccess: async () => finish('Device name updated.'),
    onError: (mutationError) => setError(errorMessage(mutationError, 'Device name could not be updated.')),
  });

  const reassignMutation = useMutation({
    mutationFn: () => reassignMonitoringDevice(target?.id ?? '', { employeeId }),
    onSuccess: async () => finish('Device assignment updated. Historical activity remains attached to the original employee.'),
    onError: (mutationError) => setError(errorMessage(mutationError, 'Device could not be reassigned.')),
  });

  const monitoringMutation = useMutation({
    mutationFn: () => updateMonitoringDeviceMonitoring(target?.id ?? '', { enabled: !(target?.monitoringEnabled ?? false) }),
    onSuccess: async () => finish(target?.monitoringEnabled ? 'Monitoring disabled for this device.' : 'Monitoring enabled for this device.'),
    onError: (mutationError) => setError(errorMessage(mutationError, 'Monitoring state could not be changed.')),
  });

  const securityMutation = useMutation({
    mutationFn: () => runSecurityAction(mode, target?.id ?? ''),
    onSuccess: async () => finish(successMessage(mode)),
    onError: (mutationError) => setError(errorMessage(mutationError, 'Device security action could not be completed.')),
  });

  const loading = renameMutation.isPending || reassignMutation.isPending || monitoringMutation.isPending || securityMutation.isPending;
  const title = actionTitle(mode, target?.monitoringEnabled ?? false);

  async function finish(message: string) {
    await invalidateDeviceQueries();
    onSuccess(message);
    onClose();
  }

  function submit() {
    setError(null);
    if (!target || !mode) return;
    if (mode === 'rename') {
      if (deviceName.trim().length < 2) {
        setError('Device name must contain at least 2 characters.');
        return;
      }
      renameMutation.mutate();
      return;
    }
    if (mode === 'reassign') {
      if (!employeeId) {
        setError('Select an active employee.');
        return;
      }
      reassignMutation.mutate();
      return;
    }
    if (mode === 'monitoring') {
      monitoringMutation.mutate();
      return;
    }
    securityMutation.mutate();
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth={mode === 'reassign' ? 'sm' : 'xs'}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {target?.deviceName || 'Selected device'}
          </Typography>
          {mode === 'rename' && (
            <TextField
              label="Device name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              autoFocus
              inputProps={{ maxLength: 100 }}
              helperText="Use a clear display name, such as Dipak Workstation."
            />
          )}
          {mode === 'reassign' && (
            <Stack spacing={1.5}>
              <Alert severity="info">
                Reassignment affects future desktop uploads only. Historical activity remains with the employee who generated it.
              </Alert>
              <TextField
                label="Search employees"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                placeholder="Name, email, or employee code"
              />
              <TextField
                select
                label="Assign to employee"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                helperText="Only active employees visible to your role can be assigned."
                disabled={employeesQuery.isFetching}
              >
                <MenuItem value="">Select employee</MenuItem>
                {employees.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {employeeLabel(employee)}
                  </MenuItem>
                ))}
              </TextField>
              {employeesQuery.isError && (
                <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => void employeesQuery.refetch()}>Retry</Button>}>
                  Employees could not be loaded.
                </Alert>
              )}
              {!employeesQuery.isFetching && !employees.length && (
                <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" color="text.secondary">No employees matched your search.</Typography>
                </Box>
              )}
            </Stack>
          )}
          {mode && !['rename', 'reassign'].includes(mode) && (
            <Alert severity={confirmationSeverity(mode, target?.monitoringEnabled ?? false)}>
              {confirmationText(mode, target?.monitoringEnabled ?? false)}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={loading}>
          {loading ? 'Saving...' : title}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function runSecurityAction(mode: DeviceActionMode | null, deviceId: string) {
  switch (mode) {
    case 'trust':
      return trustMonitoringDevice(deviceId);
    case 'revoke':
      return revokeMonitoringDevice(deviceId);
    case 'reset-registration':
      return resetMonitoringDeviceRegistration(deviceId);
    case 'force-reregister':
      return forceMonitoringDeviceReregistration(deviceId);
    default:
      return Promise.reject(new Error('Unsupported security action'));
  }
}

function actionTitle(mode: DeviceActionMode | null, monitoringEnabled: boolean) {
  switch (mode) {
    case 'rename':
      return 'Rename device';
    case 'reassign':
      return 'Reassign device';
    case 'monitoring':
      return monitoringEnabled ? 'Disable monitoring' : 'Enable monitoring';
    case 'trust':
      return 'Trust device';
    case 'revoke':
      return 'Revoke device';
    case 'reset-registration':
      return 'Reset registration';
    case 'force-reregister':
      return 'Force re-registration';
    default:
      return 'Device action';
  }
}

function confirmationText(mode: DeviceActionMode, monitoringEnabled: boolean) {
  switch (mode) {
    case 'monitoring':
      return monitoringEnabled
        ? 'Disabling monitoring stops activity and screenshot uploads from this device. Minimal heartbeat can still report the device as seen.'
        : 'Enabling monitoring allows this device to upload monitoring activity again.';
    case 'trust':
      return 'This device will be explicitly marked as trusted and can continue monitoring normally.';
    case 'revoke':
      return 'Monitoring uploads will stop for this device. It remains visible and all history is preserved.';
    case 'reset-registration':
      return 'The current registration state is invalidated. The desktop agent must register again before uploads resume.';
    case 'force-reregister':
      return 'The current registration immediately becomes invalid. The desktop agent must reconnect and perform fresh registration.';
    default:
      return 'Confirm this device action.';
  }
}

function confirmationSeverity(mode: DeviceActionMode, monitoringEnabled: boolean): 'info' | 'warning' {
  if (mode === 'monitoring') return monitoringEnabled ? 'warning' : 'info';
  if (['revoke', 'reset-registration', 'force-reregister'].includes(mode)) return 'warning';
  return 'info';
}

function successMessage(mode: DeviceActionMode | null) {
  switch (mode) {
    case 'trust':
      return 'Device marked as trusted.';
    case 'revoke':
      return 'Device revoked. History remains available.';
    case 'reset-registration':
      return 'Device registration reset. Uploads are blocked until registration refreshes.';
    case 'force-reregister':
      return 'Device re-registration is required before uploads resume.';
    default:
      return 'Device security action completed.';
  }
}

function employeeLabel(employee: Employee) {
  const name = [employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee';
  const org = [employee.branch?.name, employee.department?.name].filter(Boolean).join(' / ');
  return `${employee.employeeCode} - ${name}${org ? ` (${org})` : ''}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string | string[] } } }).response;
    const message = response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
