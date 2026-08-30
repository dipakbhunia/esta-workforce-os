export type ProviderPaymentTruth = 'PAYMENT_AUTHORIZED' | 'PAYMENT_CAPTURED' | 'PAYMENT_FAILED' | 'IGNORED';

export interface StoredNormalizedProviderEvent {
  sourceEventType: string;
  truth: ProviderPaymentTruth;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  providerPaymentStatus?: string | null;
  captured?: boolean | null;
  amountMinor?: string | null;
  currency?: string | null;
  occurredAt?: string | null;
  safeFailureCode?: string | null;
  safeFailureMessage?: string | null;
}
