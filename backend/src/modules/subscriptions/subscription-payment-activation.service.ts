import { Injectable } from '@nestjs/common';
import {
  BillingInterval, PaymentPurpose, PaymentStatus, Prisma, RecurringPriceBasis,
  SubscriptionActivationSource, SubscriptionStatus, TrialStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CURRENT_ENTITLEMENTS, PLAN_LIMIT_KEYS } from '../plans/plan-catalog.registry';
import { assertPaymentAmount, assertPaymentCurrency } from '../payments/payment-money.util';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { subscriptionPeriodFromCapture } from './subscription-period.util';

export const SUBSCRIPTION_ACTIVATION_BLOCKED = 'SUBSCRIPTION_PAYMENT_ACTIVATION_BLOCKED';
export const SUBSCRIPTION_ACTIVATED_BY_PAYMENT = 'SUBSCRIPTION_ACTIVATED_BY_PAYMENT';
export type ActivationBlockReason = 'wrong_purpose' | 'ownership_mismatch' | 'missing_capture_evidence' |
  'commercial_snapshot_mismatch' | 'invalid_entitlement_snapshot' | 'subscription_cancelled' |
  'subscription_superseded' | 'subscription_expired' | 'different_activation_payment' | 'existing_live_subscription';
export type PaymentActivationResult = { outcome: 'ACTIVATED' | 'ALREADY_ACTIVATED'; subscriptionId: string } |
  { outcome: 'NOT_READY'; paymentStatus: PaymentStatus } |
  { outcome: 'PERMANENTLY_BLOCKED'; reason: ActivationBlockReason; subscriptionId: string };

@Injectable()
export class SubscriptionPaymentActivationService {
  constructor(private readonly prisma: PrismaService, private readonly seatUsage: SeatUsageService) {}

  async activate(paymentId: string): Promise<PaymentActivationResult> {
    const identity = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { companyId: true } });
    if (!identity) return { outcome: 'PERMANENTLY_BLOCKED', reason: 'ownership_mismatch', subscriptionId: '' };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.seatUsage.lockCompany(tx, identity.companyId);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment || payment.companyId !== identity.companyId) return this.block(tx, paymentId, '', identity.companyId, 'ownership_mismatch');
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CompanySubscription" WHERE "id" = ${payment.subscriptionId}::uuid FOR UPDATE`);
        const subscription = await tx.companySubscription.findUnique({ where: { id: payment.subscriptionId } });
        if (!subscription || subscription.companyId !== payment.companyId) return this.block(tx, payment.id, payment.subscriptionId, payment.companyId, 'ownership_mismatch');

        if (subscription.activatedByPaymentId === payment.id &&
          (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.SUSPENDED)) {
          return { outcome: 'ALREADY_ACTIVATED' as const, subscriptionId: subscription.id };
        }
        if (payment.status !== PaymentStatus.CAPTURED) return { outcome: 'NOT_READY' as const, paymentStatus: payment.status };
        if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_ACTIVATION) return this.block(tx, payment.id, subscription.id, payment.companyId, 'wrong_purpose');
        if (!payment.capturedProviderPaymentId?.trim() || !payment.capturedAt) return this.block(tx, payment.id, subscription.id, payment.companyId, 'missing_capture_evidence');
        if (subscription.activationSource !== SubscriptionActivationSource.PAYMENT) return this.block(tx, payment.id, subscription.id, payment.companyId, 'ownership_mismatch');
        const terminalReason = this.terminalReason(subscription.status);
        if (terminalReason) return this.block(tx, payment.id, subscription.id, payment.companyId, terminalReason);
        if (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.SUSPENDED || subscription.activatedByPaymentId) {
          return this.block(tx, payment.id, subscription.id, payment.companyId, 'different_activation_payment');
        }
        const snapshotReason = this.snapshotReason(payment, subscription);
        if (snapshotReason) return this.block(tx, payment.id, subscription.id, payment.companyId, snapshotReason);
        if (subscription.startsAt || subscription.currentPeriodStart || subscription.currentPeriodEnd) {
          return this.block(tx, payment.id, subscription.id, payment.companyId, 'commercial_snapshot_mismatch');
        }
        const live = await tx.companySubscription.findFirst({ where: { companyId: payment.companyId, id: { not: subscription.id }, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } }, select: { id: true } });
        if (live) return this.block(tx, payment.id, subscription.id, payment.companyId, 'existing_live_subscription');

        const period = subscriptionPeriodFromCapture(payment.capturedAt, subscription.pricingInterval!);
        const usedSeats = await this.seatUsage.countUsedSeats(payment.companyId, tx);
        const activationTime = new Date();
        const effectiveTrial = await tx.companyTrial.findFirst({ where: { companyId: payment.companyId, status: TrialStatus.ACTIVE, startsAt: { lte: activationTime }, endsAt: { gt: activationTime } }, orderBy: { createdAt: 'desc' } });
        if (effectiveTrial) {
          const cancelledAt = new Date();
          await tx.companyTrial.update({ where: { id: effectiveTrial.id }, data: { status: TrialStatus.CANCELLED, cancelledAt } });
          await tx.auditLog.create({ data: { companyId: payment.companyId, action: 'TRIAL_ENDED_BY_PAID_SUBSCRIPTION', entityType: 'CompanyTrial', entityId: effectiveTrial.id, metadata: { subscriptionId: subscription.id, paymentId: payment.id, reason: 'paid_subscription_activated' } } });
        }
        await tx.companySubscription.update({ where: { id: subscription.id }, data: {
          status: SubscriptionStatus.ACTIVE, activatedByPaymentId: payment.id, startsAt: period.start,
          currentPeriodStart: period.start, currentPeriodEnd: period.end, suspendedAt: null,
        } });
        const overBy = Math.max(usedSeats - subscription.seatQuantity, 0);
        await tx.auditLog.create({ data: { companyId: payment.companyId, action: SUBSCRIPTION_ACTIVATED_BY_PAYMENT,
          entityType: 'CompanySubscription', entityId: subscription.id, metadata: {
            companyId: payment.companyId, subscriptionId: subscription.id, paymentId: payment.id, planId: subscription.planId,
            planCode: subscription.planCodeSnapshot, seatQuantity: subscription.seatQuantity, pricingInterval: subscription.pricingInterval!,
            periodStart: period.start.toISOString(), periodEnd: period.end.toISOString(), usedSeats, overLimit: overBy > 0, overBy,
          } } });
        return { outcome: 'ACTIVATED' as const, subscriptionId: subscription.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.recordBlock(paymentId, 'existing_live_subscription');
      }
      throw error;
    }
  }

  async recoverDue(limit = 25): Promise<void> {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT payment."id"
      FROM "Payment" payment
      INNER JOIN "CompanySubscription" subscription ON subscription."id" = payment."subscriptionId" AND subscription."companyId" = payment."companyId"
      WHERE payment."purpose" = 'SUBSCRIPTION_ACTIVATION' AND payment."status" = 'CAPTURED'
        AND payment."capturedProviderPaymentId" IS NOT NULL AND payment."capturedAt" IS NOT NULL
        AND subscription."activationSource" = 'PAYMENT' AND subscription."status" = 'PENDING' AND subscription."activatedByPaymentId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "AuditLog" audit WHERE audit."action" = ${SUBSCRIPTION_ACTIVATION_BLOCKED}
          AND audit."entityType" = 'Payment' AND audit."companyId" = payment."companyId"
          AND audit."entityId" = payment."id"::text
          AND audit."metadata"->>'subscriptionId' = payment."subscriptionId"::text)
      ORDER BY payment."capturedAt" ASC, payment."id" ASC LIMIT ${take}`);
    for (const row of rows) { try { await this.activate(row.id); } catch { /* durable state remains eligible for a later bounded scan */ } }
  }

  private snapshotReason(payment: { amountMinor: bigint; currency: string }, subscription: {
    seatQuantity: number; billingInterval: BillingInterval; pricingInterval: BillingInterval | null; pricingResolvedAt: Date | null;
    recurringPriceBasis: RecurringPriceBasis | null; recurringUnitPriceMinor: bigint | null; recurringTotalPriceMinor: bigint | null;
    recurringCurrency: string | null; currency: string; entitlementsSnapshot: string[]; limitsSnapshot: Prisma.JsonValue;
  }): ActivationBlockReason | null {
    if (!Number.isInteger(subscription.seatQuantity) || subscription.seatQuantity < 1 || !subscription.pricingResolvedAt ||
      !subscription.pricingInterval || !(subscription.pricingInterval === BillingInterval.MONTHLY || subscription.pricingInterval === BillingInterval.YEARLY) ||
      subscription.billingInterval !== subscription.pricingInterval || !subscription.recurringPriceBasis ||
      subscription.recurringTotalPriceMinor === null || !subscription.recurringCurrency) return 'commercial_snapshot_mismatch';
    try { assertPaymentAmount(payment.amountMinor); assertPaymentCurrency(payment.currency); assertPaymentCurrency(subscription.recurringCurrency); } catch { return 'commercial_snapshot_mismatch'; }
    if (payment.amountMinor !== subscription.recurringTotalPriceMinor || payment.currency !== subscription.recurringCurrency || subscription.currency !== subscription.recurringCurrency) return 'commercial_snapshot_mismatch';
    if (subscription.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT) {
      if (subscription.recurringUnitPriceMinor === null || subscription.recurringUnitPriceMinor < 0n || subscription.recurringUnitPriceMinor * BigInt(subscription.seatQuantity) !== subscription.recurringTotalPriceMinor) return 'commercial_snapshot_mismatch';
    } else if (subscription.recurringPriceBasis === RecurringPriceBasis.FIXED_TOTAL) {
      if (subscription.recurringUnitPriceMinor !== null) return 'commercial_snapshot_mismatch';
    } else return 'commercial_snapshot_mismatch';
    if (!Array.isArray(subscription.entitlementsSnapshot) || subscription.entitlementsSnapshot.some((value) => !CURRENT_ENTITLEMENTS.includes(value as never))) return 'invalid_entitlement_snapshot';
    const limits = subscription.limitsSnapshot;
    if (!limits || typeof limits !== 'object' || Array.isArray(limits) || Object.entries(limits).some(([key, value]) => !PLAN_LIMIT_KEYS.includes(key as never) || !Number.isSafeInteger(value) || (value as number) < 0)) return 'commercial_snapshot_mismatch';
    return null;
  }

  private terminalReason(status: SubscriptionStatus): ActivationBlockReason | null {
    if (status === SubscriptionStatus.CANCELLED) return 'subscription_cancelled';
    if (status === SubscriptionStatus.SUPERSEDED) return 'subscription_superseded';
    if (status === SubscriptionStatus.EXPIRED) return 'subscription_expired';
    return null;
  }

  private async recordBlock(paymentId: string, reason: ActivationBlockReason): Promise<PaymentActivationResult> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { companyId: true, subscriptionId: true } });
    if (!payment) return { outcome: 'PERMANENTLY_BLOCKED', reason: 'ownership_mismatch', subscriptionId: '' };
    return this.prisma.$transaction(async (tx) => { await this.seatUsage.lockCompany(tx, payment.companyId); return this.block(tx, paymentId, payment.subscriptionId, payment.companyId, reason); });
  }

  private async block(tx: Prisma.TransactionClient, paymentId: string, subscriptionId: string, companyId: string, reason: ActivationBlockReason): Promise<PaymentActivationResult> {
    const existing = await tx.auditLog.findFirst({ where: { action: SUBSCRIPTION_ACTIVATION_BLOCKED, entityType: 'Payment', entityId: paymentId } });
    if (!existing) await tx.auditLog.create({ data: { companyId, action: SUBSCRIPTION_ACTIVATION_BLOCKED, entityType: 'Payment', entityId: paymentId, metadata: { subscriptionId, reason } } });
    return { outcome: 'PERMANENTLY_BLOCKED', reason, subscriptionId };
  }
}
