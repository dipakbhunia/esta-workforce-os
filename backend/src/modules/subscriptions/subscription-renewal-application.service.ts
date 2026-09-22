import { Injectable, Logger } from '@nestjs/common';
import {
  BillingInterval, PaymentPurpose, PaymentStatus, Prisma, RecurringPriceBasis,
  SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InvoiceGenerationService } from '../invoices/invoice-generation.service';
import { assertPaymentAmount, assertPaymentCurrency } from '../payments/payment-money.util';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { advanceRenewalPeriod } from './subscription-renewal-preparation.service';

export const SUBSCRIPTION_RENEWAL_APPLIED = 'SUBSCRIPTION_RENEWAL_APPLIED';
export const SUBSCRIPTION_RENEWAL_RECOVERED_AFTER_EXPIRATION = 'SUBSCRIPTION_RENEWAL_RECOVERED_AFTER_EXPIRATION';
export const SUBSCRIPTION_RENEWAL_BLOCKED = 'SUBSCRIPTION_RENEWAL_BLOCKED';

export type RenewalApplicationBlockCode =
  | 'OWNERSHIP_MISMATCH'
  | 'PAYMENT_EVIDENCE_MISMATCH'
  | 'COMMERCIAL_EVIDENCE_MISMATCH'
  | 'RENEWAL_PROVENANCE_INVALID'
  | 'SUBSCRIPTION_BOUNDARY_MISMATCH'
  | 'INCOMPATIBLE_SUBSCRIPTION_STATE'
  | 'EXISTING_LIVE_SUBSCRIPTION';

export type RenewalApplicationResult =
  | { outcome: 'APPLIED' | 'ALREADY_APPLIED'; renewalId: string; subscriptionId: string; recoveredAfterExpiration: boolean }
  | { outcome: 'NOT_READY'; renewalId: string; paymentStatus: PaymentStatus }
  | { outcome: 'BLOCKED'; renewalId: string; subscriptionId: string; code: RenewalApplicationBlockCode };

@Injectable()
export class SubscriptionRenewalApplicationService {
  private readonly logger = new Logger(SubscriptionRenewalApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatUsageService,
    private readonly invoices: InvoiceGenerationService,
  ) {}

  async apply(paymentId: string): Promise<RenewalApplicationResult> {
    const identity = await this.prisma.payment.findUnique({
      where: { id: paymentId }, select: { companyId: true, renewal: { select: { id: true } } },
    });
    if (!identity?.renewal) {
      return { outcome: 'BLOCKED', renewalId: '', subscriptionId: '', code: 'OWNERSHIP_MISMATCH' };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.seats.lockCompany(tx, identity.companyId);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SubscriptionRenewal" WHERE "id" = ${identity.renewal!.id}::uuid FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
      const renewal = await tx.subscriptionRenewal.findUnique({
        where: { id: identity.renewal!.id },
        include: { payment: { include: { taxSnapshot: { include: { components: true } } } } },
      });
      if (!renewal || renewal.paymentId !== paymentId || renewal.companyId !== identity.companyId) {
        return { outcome: 'BLOCKED' as const, renewalId: identity.renewal!.id, subscriptionId: '', code: 'OWNERSHIP_MISMATCH' as const };
      }
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CompanySubscription" WHERE "id" = ${renewal.subscriptionId}::uuid FOR UPDATE`);
      const subscription = await tx.companySubscription.findUnique({ where: { id: renewal.subscriptionId } });
      if (!subscription || subscription.companyId !== renewal.companyId || renewal.payment.subscriptionId !== renewal.subscriptionId ||
          renewal.payment.companyId !== renewal.companyId) {
        return this.block(tx, renewal, 'OWNERSHIP_MISMATCH', 'Renewal ownership evidence does not match');
      }

      if (renewal.status === SubscriptionRenewalStatus.APPLIED) {
        if (subscription.status === SubscriptionStatus.ACTIVE &&
            subscription.currentPeriodStart?.getTime() === renewal.cycleStart.getTime() &&
            subscription.currentPeriodEnd?.getTime() === renewal.cycleEnd.getTime()) {
          return { outcome: 'ALREADY_APPLIED' as const, renewalId: renewal.id, subscriptionId: subscription.id, recoveredAfterExpiration: false };
        }
        throw new Error('Applied renewal evidence conflicts with subscription state');
      }
      if (renewal.status === SubscriptionRenewalStatus.BLOCKED) {
        return { outcome: 'BLOCKED' as const, renewalId: renewal.id, subscriptionId: subscription.id,
          code: (renewal.blockCode as RenewalApplicationBlockCode) || 'INCOMPATIBLE_SUBSCRIPTION_STATE' };
      }
      if (renewal.payment.status !== PaymentStatus.CAPTURED) {
        return { outcome: 'NOT_READY' as const, renewalId: renewal.id, paymentStatus: renewal.payment.status };
      }

      const attemptedAt = new Date();
      await tx.subscriptionRenewal.update({ where: { id: renewal.id }, data: {
        applicationAttemptCount: { increment: 1 }, lastApplicationAttemptAt: attemptedAt,
      } });
      const evidenceCode = this.evidenceConflict(renewal);
      if (evidenceCode) return this.block(tx, renewal, evidenceCode, this.safeMessage(evidenceCode));

      const boundaryMatches = subscription.currentPeriodEnd?.getTime() === renewal.cycleStart.getTime();
      if (!boundaryMatches) return this.block(tx, renewal, 'SUBSCRIPTION_BOUNDARY_MISMATCH', this.safeMessage('SUBSCRIPTION_BOUNDARY_MISMATCH'));
      const recoveredAfterExpiration = subscription.status === SubscriptionStatus.EXPIRED;
      if (subscription.status !== SubscriptionStatus.ACTIVE && !recoveredAfterExpiration) {
        return this.block(tx, renewal, 'INCOMPATIBLE_SUBSCRIPTION_STATE', this.safeMessage('INCOMPATIBLE_SUBSCRIPTION_STATE'));
      }
      if (recoveredAfterExpiration && subscription.endedAt?.getTime() !== renewal.cycleStart.getTime()) {
        return this.block(tx, renewal, 'SUBSCRIPTION_BOUNDARY_MISMATCH', this.safeMessage('SUBSCRIPTION_BOUNDARY_MISMATCH'));
      }
      if (recoveredAfterExpiration && renewal.createdAt.getTime() > renewal.cycleStart.getTime()) {
        return this.block(tx, renewal, 'RENEWAL_PROVENANCE_INVALID', this.safeMessage('RENEWAL_PROVENANCE_INVALID'));
      }
      const live = await tx.companySubscription.findFirst({ where: {
        companyId: renewal.companyId, id: { not: subscription.id },
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] },
      }, select: { id: true } });
      if (live) return this.block(tx, renewal, 'EXISTING_LIVE_SUBSCRIPTION', this.safeMessage('EXISTING_LIVE_SUBSCRIPTION'));

      const appliedAt = new Date();
      await tx.companySubscription.update({ where: { id: subscription.id }, data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: renewal.cycleStart,
        currentPeriodEnd: renewal.cycleEnd,
        endedAt: null,
      } });
      await tx.subscriptionRenewal.update({ where: { id: renewal.id }, data: {
        status: SubscriptionRenewalStatus.APPLIED, appliedAt,
      } });
      await tx.auditLog.create({ data: {
        companyId: renewal.companyId,
        action: recoveredAfterExpiration ? SUBSCRIPTION_RENEWAL_RECOVERED_AFTER_EXPIRATION : SUBSCRIPTION_RENEWAL_APPLIED,
        entityType: 'SubscriptionRenewal', entityId: renewal.id,
        metadata: { companyId: renewal.companyId, subscriptionId: subscription.id, renewalId: renewal.id,
          paymentId: renewal.paymentId, cycleStart: renewal.cycleStart.toISOString(), cycleEnd: renewal.cycleEnd.toISOString() },
      } });
      return { outcome: 'APPLIED' as const, renewalId: renewal.id, subscriptionId: subscription.id, recoveredAfterExpiration };
    });

    if (result.outcome === 'APPLIED' || result.outcome === 'ALREADY_APPLIED') {
      try { await this.invoices.generate(paymentId); } catch { /* renewal application is already committed */ }
    }
    return result;
  }

  async recoverDue(limit = 25): Promise<void> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = await this.prisma.$queryRaw<Array<{ paymentId: string }>>(Prisma.sql`
      SELECT renewal."paymentId"
      FROM "SubscriptionRenewal" renewal
      INNER JOIN "Payment" payment ON payment."id" = renewal."paymentId"
       AND payment."companyId" = renewal."companyId" AND payment."subscriptionId" = renewal."subscriptionId"
      WHERE renewal."status" = 'PREPARED' AND payment."purpose" = 'SUBSCRIPTION_RENEWAL'
       AND payment."status" = 'CAPTURED' AND payment."capturedAt" IS NOT NULL
       AND payment."capturedProviderPaymentId" IS NOT NULL AND BTRIM(payment."capturedProviderPaymentId") <> ''
      ORDER BY payment."capturedAt" ASC, renewal."id" ASC LIMIT ${take}`);
    for (const row of rows) {
      try { await this.apply(row.paymentId); }
      catch (error) { this.logger.warn(`Subscription renewal application failed for Payment ${row.paymentId}: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
  }

  private evidenceConflict(renewal: {
    companyId: string; subscriptionId: string; paymentId: string; cycleStart: Date; cycleEnd: Date;
    billingInterval: BillingInterval; recurringPriceBasis: RecurringPriceBasis; recurringUnitPriceMinor: bigint | null;
    recurringTotalPriceMinor: bigint; currency: string; seatQuantity: number;
    payment: { id: string; companyId: string; subscriptionId: string; purpose: PaymentPurpose; status: PaymentStatus;
      amountMinor: bigint; currency: string; capturedAt: Date | null; capturedProviderPaymentId: string | null;
      taxSnapshot: { companyId: string; sourceSubscriptionId: string; currency: string; taxableSubtotalMinor: bigint;
        totalTaxMinor: bigint; grossTotalMinor: bigint; components: Array<{ taxableAmountMinor: bigint; taxAmountMinor: bigint; currency: string }> } | null };
  }): RenewalApplicationBlockCode | null {
    const payment = renewal.payment;
    if (payment.id !== renewal.paymentId || payment.companyId !== renewal.companyId || payment.subscriptionId !== renewal.subscriptionId) return 'OWNERSHIP_MISMATCH';
    if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_RENEWAL || payment.status !== PaymentStatus.CAPTURED ||
        !payment.capturedAt || !payment.capturedProviderPaymentId?.trim()) return 'PAYMENT_EVIDENCE_MISMATCH';
    try { assertPaymentAmount(payment.amountMinor); assertPaymentCurrency(payment.currency); assertPaymentCurrency(renewal.currency); }
    catch { return 'COMMERCIAL_EVIDENCE_MISMATCH'; }
    if (renewal.cycleStart >= renewal.cycleEnd || advanceRenewalPeriod(renewal.cycleStart, renewal.billingInterval).getTime() !== renewal.cycleEnd.getTime() ||
        renewal.seatQuantity < 1 || payment.currency !== renewal.currency) return 'COMMERCIAL_EVIDENCE_MISMATCH';
    if (renewal.recurringPriceBasis === RecurringPriceBasis.PER_USER_UNIT) {
      if (renewal.recurringUnitPriceMinor === null || renewal.recurringUnitPriceMinor * BigInt(renewal.seatQuantity) !== renewal.recurringTotalPriceMinor) return 'COMMERCIAL_EVIDENCE_MISMATCH';
    } else if (renewal.recurringPriceBasis !== RecurringPriceBasis.FIXED_TOTAL || renewal.recurringUnitPriceMinor !== null) return 'COMMERCIAL_EVIDENCE_MISMATCH';
    const tax = payment.taxSnapshot;
    if (!tax) return payment.amountMinor === renewal.recurringTotalPriceMinor ? null : 'COMMERCIAL_EVIDENCE_MISMATCH';
    const componentTotal = tax.components.reduce((sum, component) => sum + component.taxAmountMinor, 0n);
    if (tax.companyId !== renewal.companyId || tax.sourceSubscriptionId !== renewal.subscriptionId || tax.currency !== renewal.currency ||
        tax.taxableSubtotalMinor !== renewal.recurringTotalPriceMinor || tax.totalTaxMinor !== componentTotal ||
        tax.grossTotalMinor !== tax.taxableSubtotalMinor + tax.totalTaxMinor || tax.grossTotalMinor !== payment.amountMinor ||
        tax.components.some(component => component.currency !== tax.currency || component.taxableAmountMinor !== tax.taxableSubtotalMinor)) {
      return 'COMMERCIAL_EVIDENCE_MISMATCH';
    }
    return null;
  }

  private async block(tx: Prisma.TransactionClient, renewal: { id: string; companyId: string; subscriptionId: string; paymentId: string },
    code: RenewalApplicationBlockCode, safeBlockMessage: string): Promise<RenewalApplicationResult> {
    const blockedAt = new Date();
    await tx.subscriptionRenewal.update({ where: { id: renewal.id }, data: {
      status: SubscriptionRenewalStatus.BLOCKED, blockedAt, blockCode: code, safeBlockMessage,
    } });
    const existing = await tx.auditLog.findFirst({ where: { action: SUBSCRIPTION_RENEWAL_BLOCKED, entityType: 'SubscriptionRenewal', entityId: renewal.id } });
    if (!existing) await tx.auditLog.create({ data: { companyId: renewal.companyId, action: SUBSCRIPTION_RENEWAL_BLOCKED,
      entityType: 'SubscriptionRenewal', entityId: renewal.id,
      metadata: { subscriptionId: renewal.subscriptionId, paymentId: renewal.paymentId, blockCode: code },
    } });
    return { outcome: 'BLOCKED', renewalId: renewal.id, subscriptionId: renewal.subscriptionId, code };
  }

  private safeMessage(code: RenewalApplicationBlockCode): string {
    if (code === 'EXISTING_LIVE_SUBSCRIPTION') return 'Another live subscription prevents renewal application';
    if (code === 'SUBSCRIPTION_BOUNDARY_MISMATCH') return 'Subscription period does not match the prepared renewal cycle';
    if (code === 'COMMERCIAL_EVIDENCE_MISMATCH') return 'Renewal commercial evidence does not reconcile';
    if (code === 'PAYMENT_EVIDENCE_MISMATCH') return 'Captured payment evidence is incompatible with the renewal';
    if (code === 'RENEWAL_PROVENANCE_INVALID') return 'Renewal evidence was not established before the expired boundary';
    if (code === 'OWNERSHIP_MISMATCH') return 'Renewal ownership evidence does not match';
    return 'Subscription state is incompatible with renewal application';
  }
}
