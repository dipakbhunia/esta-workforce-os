import { Prisma } from '@prisma/client';
import { classifyDunning } from './platform-dunning-classification';
import { PlatformDunningDetails, PlatformDunningListItem } from './platform-dunning.types';

const paymentBaseSelect = {
  id: true, companyId: true, subscriptionId: true, purpose: true, status: true, amountMinor: true, currency: true,
  provider: true, providerMode: true, providerStatus: true, failedAt: true, failureCode: true, safeFailureMessage: true,
  authorizedAt: true, capturedAt: true, createdAt: true, updatedAt: true,
  orders: { orderBy: [{ sequence: 'desc' as const }, { id: 'desc' as const }], take: 1, select: {
    id: true, status: true, providerStatus: true, createdAt: true, updatedAt: true,
  } },
} satisfies Prisma.PaymentSelect;

export const platformDunningListSelect = {
  id: true, companyId: true, subscriptionId: true, paymentId: true, status: true, cycleStart: true, cycleEnd: true,
  billingInterval: true, createdAt: true, company: { select: { id: true, name: true } },
  subscription: { select: { id: true, companyId: true, status: true, planId: true, planCodeSnapshot: true, planNameSnapshot: true } },
  payment: { select: paymentBaseSelect },
} satisfies Prisma.SubscriptionRenewalSelect;

export const platformDunningDetailSelect = {
  ...platformDunningListSelect,
  recurringPriceBasis: true, recurringUnitPriceMinor: true, recurringTotalPriceMinor: true, currency: true, seatQuantity: true,
  preparedByUserId: true, applicationAttemptCount: true, lastApplicationAttemptAt: true, appliedAt: true, blockedAt: true,
  blockCode: true, safeBlockMessage: true,
  payment: { select: { ...paymentBaseSelect,
    attempts: { orderBy: [{ sequence: 'desc' as const }, { id: 'desc' as const }], take: 26, select: {
      id: true, sequence: true, operation: true, status: true, providerStatus: true, failureCode: true,
      safeFailureMessage: true, startedAt: true, completedAt: true,
    } },
    taxSnapshot: { select: { treatment: true, decisionAt: true, currency: true, taxableSubtotalMinor: true,
      totalTaxMinor: true, grossTotalMinor: true, jurisdictionClassification: true, serviceClassification: true,
      components: { orderBy: [{ type: 'asc' as const }, { id: 'asc' as const }], select: {
        type: true, rateBasisPoints: true, taxableAmountMinor: true, taxAmountMinor: true, currency: true,
      } },
    } },
    invoice: { select: { id: true, invoiceNumber: true, issuedAt: true, currency: true, subtotalMinor: true, totalTaxMinor: true, totalMinor: true } },
  } },
} satisfies Prisma.SubscriptionRenewalSelect;

type ListRow = Prisma.SubscriptionRenewalGetPayload<{ select: typeof platformDunningListSelect }>;
type DetailRow = Prisma.SubscriptionRenewalGetPayload<{ select: typeof platformDunningDetailSelect }>;

export function mapDunningListItem(row: ListRow, evaluationTime: Date): PlatformDunningListItem {
  const classification = classifyDunning({ renewal: row, payment: row.payment, subscription: row.subscription }, evaluationTime);
  const order = row.payment.orders[0] ?? null;
  return {
    ...classification, dueAt: row.cycleStart.toISOString(),
    renewal: { id: row.id, status: row.status, cycleStart: row.cycleStart.toISOString(), cycleEnd: row.cycleEnd.toISOString(), billingInterval: row.billingInterval, createdAt: row.createdAt.toISOString() },
    company: row.company,
    subscription: { id: row.subscription.id, status: row.subscription.status, plan: { id: row.subscription.planId, code: row.subscription.planCodeSnapshot, name: row.subscription.planNameSnapshot } },
    payment: { id: row.payment.id, purpose: row.payment.purpose, status: row.payment.status, amountMinor: row.payment.amountMinor.toString(10), currency: row.payment.currency, provider: row.payment.provider, mode: row.payment.providerMode, failedAt: iso(row.payment.failedAt), failureCode: row.payment.failureCode, safeFailureMessage: row.payment.safeFailureMessage },
    latestProviderOrder: order ? { id: order.id, status: order.status, providerStatus: order.providerStatus, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() } : null,
  };
}

export function mapDunningDetails(row: DetailRow, evaluationTime: Date): PlatformDunningDetails {
  const base = mapDunningListItem(row, evaluationTime);
  const tax = row.payment.taxSnapshot;
  const invoice = row.payment.invoice;
  return { ...base, evaluationTime: evaluationTime.toISOString(),
    renewal: { ...base.renewal, recurringPriceBasis: row.recurringPriceBasis, recurringUnitPriceMinor: row.recurringUnitPriceMinor?.toString(10) ?? null, recurringTotalPriceMinor: row.recurringTotalPriceMinor.toString(10), currency: row.currency, seatQuantity: row.seatQuantity, preparedByUserId: row.preparedByUserId, applicationAttemptCount: row.applicationAttemptCount, lastApplicationAttemptAt: iso(row.lastApplicationAttemptAt), appliedAt: iso(row.appliedAt), blockedAt: iso(row.blockedAt), blockCode: row.blockCode, safeBlockMessage: row.safeBlockMessage },
    payment: { ...base.payment, providerStatus: row.payment.providerStatus, authorizedAt: iso(row.payment.authorizedAt), capturedAt: iso(row.payment.capturedAt), createdAt: row.payment.createdAt.toISOString(), updatedAt: row.payment.updatedAt.toISOString() },
    tax: tax ? { treatment: tax.treatment, decisionAt: tax.decisionAt.toISOString(), currency: tax.currency, taxableSubtotalMinor: tax.taxableSubtotalMinor.toString(10), totalTaxMinor: tax.totalTaxMinor.toString(10), grossTotalMinor: tax.grossTotalMinor.toString(10), jurisdictionClassification: tax.jurisdictionClassification, serviceClassification: tax.serviceClassification, components: tax.components.map(c => ({ ...c, taxableAmountMinor: c.taxableAmountMinor.toString(10), taxAmountMinor: c.taxAmountMinor.toString(10) })) } : null,
    attempts: { data: row.payment.attempts.slice(0, 25).map(a => ({ ...a, startedAt: a.startedAt.toISOString(), completedAt: iso(a.completedAt) })), truncated: row.payment.attempts.length > 25 },
    invoice: invoice ? { ...invoice, issuedAt: invoice.issuedAt.toISOString(), subtotalMinor: invoice.subtotalMinor.toString(10), totalTaxMinor: invoice.totalTaxMinor?.toString(10) ?? null, totalMinor: invoice.totalMinor.toString(10) } : null,
  };
}

function iso(value: Date | null): string | null { return value?.toISOString() ?? null; }
