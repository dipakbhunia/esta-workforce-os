import type { StatusTone } from '@/components/status-chip';
import type { StorageCapacityState } from './storage-usage.types';

const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'] as const;
const base = 1024n;

export function formatBytes(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return 'N/A';
  const bytes = BigInt(value);
  if (bytes < base) return `${bytes} B`;
  let unitIndex = 0;
  let divisor = 1n;
  while (unitIndex < units.length - 1 && bytes >= divisor * base) {
    divisor *= base;
    unitIndex += 1;
  }
  const hundredths = (bytes * 100n + divisor / 2n) / divisor;
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} ${units[unitIndex]}`;
}

export function exactBytes(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  return `${groupDecimal(value)} bytes`;
}

export function formatUtilization(value: string | null) {
  if (value === null) return 'N/A';
  return `${value}%`;
}

export function storageCapacityLabel(state: StorageCapacityState) {
  if (state === 'UNMEASURABLE') return 'Measurement incomplete';
  if (state === 'UNCONFIGURED') return 'Limit not configured';
  if (state === 'NO_ACCESS') return 'No commercial access';
  return state.replaceAll('_', ' ');
}

export function storageCapacityTone(state: StorageCapacityState): StatusTone {
  if (state === 'AVAILABLE') return 'success';
  if (state === 'AT_LIMIT' || state === 'UNCONFIGURED' || state === 'UNMEASURABLE') return 'warning';
  if (state === 'OVER_LIMIT') return 'danger';
  return 'neutral';
}

export function formatStorageDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function groupDecimal(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
