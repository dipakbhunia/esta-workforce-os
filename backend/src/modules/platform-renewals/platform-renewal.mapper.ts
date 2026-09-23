import { Prisma } from '@prisma/client';
import { PlatformRenewalDetailsResponseDto, PlatformRenewalResponseDto } from './dto/platform-renewal-response.dto';

export const platformRenewalListSelect = {
  id: true, status: true, cycleStart: true, cycleEnd: true, billingInterval: true,
  recurringPriceBasis: true, recurringUnitPriceMinor: true, recurringTotalPriceMinor: true,
  currency: true, seatQuantity: true, applicationAttemptCount: true, lastApplicationAttemptAt: true,
  appliedAt: true, blockedAt: true, blockCode: true, safeBlockMessage: true, createdAt: true, updatedAt: true,
  company: { select: { id: true, name: true } },
  subscription: { select: { id: true, status: true, planId: true, planCodeSnapshot: true, planNameSnapshot: true } },
  payment: { select: { id: true, purpose: true, status: true, amountMinor: true, currency: true, provider: true, providerMode: true, capturedAt: true } },
  preparedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.SubscriptionRenewalSelect;

export const platformRenewalDetailsSelect = {
  ...platformRenewalListSelect,
  payment: { select: {
    ...platformRenewalListSelect.payment.select,
    taxSnapshot: { select: {
      treatment: true, decisionAt: true, currency: true, taxableSubtotalMinor: true, totalTaxMinor: true,
      grossTotalMinor: true, jurisdictionClassification: true, serviceClassification: true,
      placeOfSupplyState: true, placeOfSupplyStateCode: true,
      components: { orderBy: [{ type: 'asc' as const }, { id: 'asc' as const }], select: {
        type: true, rateBasisPoints: true, taxableAmountMinor: true, taxAmountMinor: true, currency: true,
      } },
    } },
    orders: { orderBy: [{ sequence: 'desc' as const }, { id: 'desc' as const }], take: 1, select: {
      id: true, sequence: true, providerOrderId: true, status: true, providerStatus: true, createdAt: true, updatedAt: true,
    } },
    invoice: { select: {
      id: true, invoiceNumber: true, issuedAt: true, servicePeriodStart: true, servicePeriodEnd: true,
      currency: true, subtotalMinor: true, totalTaxMinor: true, totalMinor: true,
    } },
  } },
} satisfies Prisma.SubscriptionRenewalSelect;

type ListRow = Prisma.SubscriptionRenewalGetPayload<{ select: typeof platformRenewalListSelect }>;
type DetailsRow = Prisma.SubscriptionRenewalGetPayload<{ select: typeof platformRenewalDetailsSelect }>;

export function mapPlatformRenewal(row: ListRow): PlatformRenewalResponseDto {
  return {
    id: row.id, status: row.status, cycleStart: row.cycleStart.toISOString(), cycleEnd: row.cycleEnd.toISOString(),
    billingInterval: row.billingInterval, recurringPriceBasis: row.recurringPriceBasis,
    recurringUnitPriceMinor: row.recurringUnitPriceMinor?.toString(10) ?? null,
    recurringTotalPriceMinor: row.recurringTotalPriceMinor.toString(10), currency: row.currency, seatQuantity: row.seatQuantity,
    company: row.company,
    subscription: { id: row.subscription.id, status: row.subscription.status,
      plan: { id: row.subscription.planId, code: row.subscription.planCodeSnapshot, name: row.subscription.planNameSnapshot } },
    payment: { id: row.payment.id, purpose: row.payment.purpose, status: row.payment.status,
      amountMinor: row.payment.amountMinor.toString(10), currency: row.payment.currency, provider: row.payment.provider,
      mode: row.payment.providerMode, capturedAt: iso(row.payment.capturedAt) },
    preparedBy: row.preparedBy, applicationAttemptCount: row.applicationAttemptCount,
    lastApplicationAttemptAt: iso(row.lastApplicationAttemptAt), appliedAt: iso(row.appliedAt), blockedAt: iso(row.blockedAt),
    blockCode: row.blockCode, safeBlockMessage: row.safeBlockMessage,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPlatformRenewalDetails(row: DetailsRow): PlatformRenewalDetailsResponseDto {
  const payment = row.payment;
  const base = mapPlatformRenewal(row);
  const tax = payment.taxSnapshot;
  const order = payment.orders[0] ?? null;
  const invoice = payment.invoice;
  return {
    ...base,
    tax: tax ? {
      treatment: tax.treatment, decisionAt: tax.decisionAt.toISOString(), currency: tax.currency,
      taxableSubtotalMinor: tax.taxableSubtotalMinor.toString(10), totalTaxMinor: tax.totalTaxMinor.toString(10),
      grossTotalMinor: tax.grossTotalMinor.toString(10), jurisdictionClassification: tax.jurisdictionClassification,
      serviceClassification: tax.serviceClassification, placeOfSupplyState: tax.placeOfSupplyState,
      placeOfSupplyStateCode: tax.placeOfSupplyStateCode,
      components: tax.components.map(component => ({ ...component,
        taxableAmountMinor: component.taxableAmountMinor.toString(10), taxAmountMinor: component.taxAmountMinor.toString(10) })),
    } : null,
    providerOrder: order ? { ...order, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() } : null,
    invoice: invoice ? { ...invoice, issuedAt: invoice.issuedAt.toISOString(),
      servicePeriodStart: invoice.servicePeriodStart.toISOString(), servicePeriodEnd: invoice.servicePeriodEnd.toISOString(),
      subtotalMinor: invoice.subtotalMinor.toString(10), totalTaxMinor: invoice.totalTaxMinor?.toString(10) ?? null,
      totalMinor: invoice.totalMinor.toString(10) } : null,
  };
}

function iso(value: Date | null): string | null { return value?.toISOString() ?? null; }
