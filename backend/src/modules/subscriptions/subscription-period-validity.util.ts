import { SubscriptionStatus } from '@prisma/client';

export function isSubscriptionPeriodDue(
  subscription: { currentPeriodEnd: Date | null },
  now: Date,
): boolean {
  return subscription.currentPeriodEnd !== null
    && subscription.currentPeriodEnd.getTime() <= now.getTime();
}

export function isCurrentSubscriptionAuthority(
  subscription: { status: SubscriptionStatus; currentPeriodEnd: Date | null },
  now: Date,
): boolean {
  return (
    subscription.status === SubscriptionStatus.ACTIVE
    || subscription.status === SubscriptionStatus.SUSPENDED
  ) && !isSubscriptionPeriodDue(subscription, now);
}
