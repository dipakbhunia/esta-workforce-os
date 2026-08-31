import { BadRequestException } from '@nestjs/common';
import { BillingInterval } from '@prisma/client';

export interface SubscriptionPeriod {
  start: Date;
  end: Date;
}

export function subscriptionPeriodFromCapture(capturedAt: Date, interval: BillingInterval): SubscriptionPeriod {
  if (!Number.isFinite(capturedAt.getTime())) throw new BadRequestException('Payment capture timestamp is invalid');
  if (interval !== BillingInterval.MONTHLY && interval !== BillingInterval.YEARLY) {
    throw new BadRequestException('Subscription pricing interval is unsupported');
  }
  const start = new Date(capturedAt.getTime());
  const targetYear = start.getUTCFullYear() + (interval === BillingInterval.YEARLY ? 1 : 0);
  const targetMonth = start.getUTCMonth() + (interval === BillingInterval.MONTHLY ? 1 : 0);
  const normalizedYear = targetYear + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(normalizedYear, normalizedMonth + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(normalizedYear, normalizedMonth, Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  return { start, end };
}
