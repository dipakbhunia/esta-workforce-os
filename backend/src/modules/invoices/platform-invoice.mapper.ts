import { Prisma } from '@prisma/client';

export const platformInvoiceListSelect = {
  id: true,
  invoiceNumber: true,
  companyId: true,
  sourcePaymentId: true,
  sourceSubscriptionId: true,
  issuedAt: true,
  dueAt: true,
  servicePeriodStart: true,
  servicePeriodEnd: true,
  currency: true,
  subtotalMinor: true,
  totalMinor: true,
} satisfies Prisma.InvoiceSelect;

export const platformInvoiceDetailsSelect = {
  ...platformInvoiceListSelect,
  sourcePaymentPurpose: true,
  sourceCapturedAt: true,
  numberPrefix: true,
  numberResetPolicy: true,
  numberResetBucket: true,
  numberSequence: true,
  sellerLegalName: true,
  sellerBillingEmail: true,
  sellerAddressLine1: true,
  sellerAddressLine2: true,
  sellerCity: true,
  sellerState: true,
  sellerStateCode: true,
  sellerPostalCode: true,
  sellerCountry: true,
  billToName: true,
  billToBillingEmail: true,
  billToAddressLine1: true,
  billToAddressLine2: true,
  billToCity: true,
  billToState: true,
  billToPostalCode: true,
  billToCountry: true,
  billToPhone: true,
  lines: {
    orderBy: { lineSequence: 'asc' },
    select: {
      id: true,
      sourcePlanId: true,
      planCodeSnapshot: true,
      planNameSnapshot: true,
      lineSequence: true,
      description: true,
      quantity: true,
      unitAmountMinor: true,
      lineSubtotalMinor: true,
      currency: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

type InvoiceListRow = Prisma.InvoiceGetPayload<{ select: typeof platformInvoiceListSelect }>;
type InvoiceDetailsRow = Prisma.InvoiceGetPayload<{ select: typeof platformInvoiceDetailsSelect }>;

export function mapPlatformInvoiceSummary(invoice: InvoiceListRow) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    companyId: invoice.companyId,
    sourcePaymentId: invoice.sourcePaymentId,
    subscriptionId: invoice.sourceSubscriptionId,
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt?.toISOString() ?? null,
    currency: invoice.currency,
    subtotalMinor: invoice.subtotalMinor.toString(),
    totalMinor: invoice.totalMinor.toString(),
    servicePeriodStart: invoice.servicePeriodStart.toISOString(),
    servicePeriodEnd: invoice.servicePeriodEnd.toISOString(),
  };
}

export function mapPlatformInvoiceDetails(invoice: InvoiceDetailsRow) {
  return {
    ...mapPlatformInvoiceSummary(invoice),
    sourcePaymentPurpose: invoice.sourcePaymentPurpose,
    sourceCapturedAt: invoice.sourceCapturedAt.toISOString(),
    numbering: {
      prefix: invoice.numberPrefix,
      resetPolicy: invoice.numberResetPolicy,
      resetBucket: invoice.numberResetBucket,
      sequence: invoice.numberSequence.toString(),
    },
    seller: {
      legalName: invoice.sellerLegalName,
      billingEmail: invoice.sellerBillingEmail,
      addressLine1: invoice.sellerAddressLine1,
      addressLine2: invoice.sellerAddressLine2,
      city: invoice.sellerCity,
      state: invoice.sellerState,
      stateCode: invoice.sellerStateCode,
      postalCode: invoice.sellerPostalCode,
      country: invoice.sellerCountry,
    },
    billTo: {
      name: invoice.billToName,
      billingEmail: invoice.billToBillingEmail,
      addressLine1: invoice.billToAddressLine1,
      addressLine2: invoice.billToAddressLine2,
      city: invoice.billToCity,
      state: invoice.billToState,
      postalCode: invoice.billToPostalCode,
      country: invoice.billToCountry,
      phone: invoice.billToPhone,
    },
    lines: invoice.lines.map((line) => ({
      id: line.id,
      planId: line.sourcePlanId,
      planCodeSnapshot: line.planCodeSnapshot,
      planNameSnapshot: line.planNameSnapshot,
      lineSequence: line.lineSequence,
      description: line.description,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor.toString(),
      subtotalMinor: line.lineSubtotalMinor.toString(),
      currency: line.currency,
    })),
  };
}
