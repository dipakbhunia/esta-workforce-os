import { Prisma } from '@prisma/client';
import { TRIAL_ELIGIBLE_ENTITLEMENTS } from '../plans/plan-catalog.registry';

export const DEFAULT_TRIAL_DURATION_HOURS = 7 * 24;
export const DEFAULT_TRIAL_SEAT_LIMIT = 10;
export const MAX_TRIAL_DURATION_HOURS = 365 * 24;
export const DEFAULT_TRIAL_LIMITS: Prisma.InputJsonObject = {};

export function trialEntitlementSnapshot(): string[] {
  return [...TRIAL_ELIGIBLE_ENTITLEMENTS].sort();
}
