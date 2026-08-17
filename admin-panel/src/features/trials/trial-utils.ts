import axios from 'axios';
import type { StatusTone } from '@/components/status-chip';
import type { Trial, TrialStatus } from './trial.types';

export const trialDate = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not applicable';

export function trialTone(status: TrialStatus): StatusTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'CONVERTED') return 'info';
  if (status === 'CANCELLED') return 'danger';
  return 'neutral';
}

export function isEffectiveTrial(trial: Pick<Trial, 'status' | 'startsAt' | 'endsAt'>, now = Date.now()) {
  return trial.status === 'ACTIVE' && new Date(trial.startsAt).getTime() <= now && new Date(trial.endsAt).getTime() > now;
}

export function trialRemaining(endsAt: string, now = Date.now()) {
  const milliseconds = new Date(endsAt).getTime() - now;
  if (milliseconds <= 0) return 'Awaiting expiry reconciliation';
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (totalHours > 0) return `${totalHours}h remaining`;
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000));
  return `${minutes}m remaining`;
}

export function trialError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? fallback;
}

export function localInstant(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}
