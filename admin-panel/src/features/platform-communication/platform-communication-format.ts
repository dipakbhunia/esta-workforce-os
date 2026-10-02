import type { EmailDeliveryStatus, PlatformEmailDelivery } from './platform-communication.types';
export const emailDeliveryStatusLabel = (value: EmailDeliveryStatus) =>
  value.charAt(0) + value.slice(1).toLowerCase();

export const emailEventLabel = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/^./, character => character.toUpperCase());

export const formatEmailDeliveryDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        .format(new Date(value))
    : 'Not available';

export function claimLabel(value: Pick<PlatformEmailDelivery, 'isClaimed' | 'claimExpiresAt'>, now = Date.now()) {
  if (!value.isClaimed) return null;
  const expiry = value.claimExpiresAt ? Date.parse(value.claimExpiresAt) : Number.NaN;
  if (!Number.isFinite(expiry)) return 'Claimed; lease expiry unavailable';
  return expiry > now ? 'Claim lease active' : 'Claim lease expired; awaiting recovery';
}
