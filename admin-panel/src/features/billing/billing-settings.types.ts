export type InvoiceNumberResetPolicy = 'NEVER' | 'CALENDAR_YEAR' | 'FINANCIAL_YEAR';
export type RenewalMode = 'MANUAL' | 'AUTOMATIC';
export type PaymentProviderType = 'RAZORPAY';
export type PaymentProviderMode = 'TEST' | 'LIVE';

export interface BillingSettings {
  id: string;
  scope: 'PLATFORM';
  invoicePrefix: string;
  invoiceNumberResetPolicy: InvoiceNumberResetPolicy;
  defaultPaymentTermsDays: number;
  defaultInvoiceNotes: string | null;
  sellerLegalName: string | null;
  sellerBillingEmail: string | null;
  sellerAddressLine1: string | null;
  sellerAddressLine2: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  sellerStateCode: string | null;
  sellerPostalCode: string | null;
  sellerCountry: string | null;
  gstEnabled: boolean;
  gstin: string | null;
  gstLegalName: string | null;
  gstRegisteredState: string | null;
  gstRegisteredStateCode: string | null;
  renewalMode: RenewalMode;
  renewalLeadDays: number;
  renewalGracePeriodDays: number;
  renewalReminderDays: number[];
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BillingSettingsPayload = Omit<
  BillingSettings,
  'id' | 'scope' | 'updatedById' | 'createdAt' | 'updatedAt'
>;

export interface BillingProviderConfiguration {
  id: string;
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  displayName: string | null;
  accountReference: string | null;
  enabled: boolean;
  isDefault: boolean;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  credentialsConfigured: boolean;
  credentialVersion: number | null;
  credentialUpdatedAt: string | null;
  credentialFingerprint: string | null;
}

export interface BillingCredentialPayload { keyId: string; keySecret: string; webhookSecret: string }
export interface BillingCredentialMetadata { credentialsConfigured: boolean; credentialVersion: number | null; credentialUpdatedAt: string | null; credentialFingerprint: string | null }
export interface CredentialValidationResult { provider: PaymentProviderType; mode: PaymentProviderMode; credentialVersion: number; success: boolean; category: string; validationType: 'STRUCTURAL'; networkConnectivityTested: false }

export interface BillingProviderPayload {
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  displayName?: string | null;
  accountReference?: string | null;
}

export type BillingProviderUpdatePayload = Omit<BillingProviderPayload, 'provider'>;
