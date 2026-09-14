export type InvoiceNumberResetPolicy = 'NEVER' | 'CALENDAR_YEAR' | 'FINANCIAL_YEAR';
export type InvoiceSourcePaymentPurpose = 'SUBSCRIPTION_ACTIVATION';

export interface PlatformInvoiceListQuery {
  page: number;
  limit: number;
  companyId?: string;
  subscriptionId?: string;
  sourcePaymentId?: string;
  invoiceNumber?: string;
  from?: string;
  to?: string;
}

export interface PlatformInvoiceSummary {
  id: string;
  invoiceNumber: string;
  companyId: string;
  sourcePaymentId: string;
  subscriptionId: string;
  issuedAt: string;
  dueAt: string | null;
  currency: string;
  subtotalMinor: string;
  totalMinor: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
}

export interface PlatformInvoiceListResponse {
  data: PlatformInvoiceSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PlatformInvoicePartySnapshot {
  billingEmail: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
}

export interface PlatformInvoiceSellerSnapshot extends PlatformInvoicePartySnapshot {
  legalName: string;
  stateCode: string | null;
}

export interface PlatformInvoiceBillToSnapshot extends PlatformInvoicePartySnapshot {
  name: string;
  phone: string | null;
}

export interface PlatformInvoiceLine {
  id: string;
  planId: string;
  planCodeSnapshot: string;
  planNameSnapshot: string;
  lineSequence: number;
  description: string;
  quantity: number;
  unitAmountMinor: string;
  subtotalMinor: string;
  currency: string;
}

export interface PlatformInvoiceDetails extends PlatformInvoiceSummary {
  sourcePaymentPurpose: InvoiceSourcePaymentPurpose;
  sourceCapturedAt: string;
  numbering: {
    prefix: string;
    resetPolicy: InvoiceNumberResetPolicy;
    resetBucket: string;
    sequence: string;
  };
  seller: PlatformInvoiceSellerSnapshot;
  billTo: PlatformInvoiceBillToSnapshot;
  lines: PlatformInvoiceLine[];
}

export interface IssuePlatformInvoiceRequest { paymentId: string }

export interface IssuedPlatformInvoiceResult {
  id: string;
  companyId: string;
  sourcePaymentId: string;
  sourceSubscriptionId: string;
  invoiceNumber: string;
  issuedAt: string;
  dueAt: null;
  currency: string;
  subtotalMinor: string;
  totalMinor: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  line: {
    planId: string;
    planCodeSnapshot: string;
    planNameSnapshot: string;
    quantity: number;
    unitAmountMinor: string;
    subtotalMinor: string;
    currency: string;
  };
}
