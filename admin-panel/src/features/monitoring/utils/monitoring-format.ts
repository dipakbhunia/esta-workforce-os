import type { StatusTone } from '@/components/status-chip';
import type {
  LiveHeartbeatState,
  LiveStatusValue,
  MonitoringDeviceStatus,
  MonitoringEmployee,
} from '../types/monitoring.types';

export function formatEnum(value?: string | null) {
  if (!value) return 'Not available';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDuration(seconds?: number | null) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

export function formatBytes(value?: number | null) {
  if (!value) return 'Not available';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function employeeName(employee?: MonitoringEmployee | null) {
  return employee?.name || employee?.email || 'Employee';
}

export function employeeEmail(employee?: MonitoringEmployee | null) {
  return employee?.email || undefined;
}

export function liveStatusTone(status?: LiveStatusValue | null): StatusTone {
  switch (status) {
    case 'ONLINE':
    case 'WORKING':
      return 'success';
    case 'ON_BREAK':
    case 'AWAY':
      return 'warning';
    case 'AUTO_PUNCHED_OUT':
      return 'danger';
    case 'OFFLINE':
    case 'PUNCHED_OUT':
    default:
      return 'neutral';
  }
}

export function heartbeatTone(status?: LiveHeartbeatState | null): StatusTone {
  switch (status) {
    case 'ONLINE':
      return 'success';
    case 'AWAY':
      return 'warning';
    case 'OFFLINE':
    default:
      return 'neutral';
  }
}

export function deviceStatusTone(status?: MonitoringDeviceStatus | string | null): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'REVOKED':
      return 'danger';
    case 'INACTIVE':
    default:
      return 'neutral';
  }
}
