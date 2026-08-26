import type { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import type { MoneySnapshot } from '../payment.types';
import type { ProviderCredentialMaterial } from '../../billing-settings/provider-credential.types';

export interface PaymentProviderContext {
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  providerConfigurationId: string;
  credentialVersionId: string;
  credentials: ProviderCredentialMaterial;
}

export interface ProviderOrder extends MoneySnapshot {
  id: string;
  receipt: string;
  status: string;
  createdAt: Date | null;
  safeMetadata?: Record<string, unknown>;
}

export interface ProviderPayment extends MoneySnapshot {
  id: string;
  orderId: string;
  status: string;
  captured: boolean;
  createdAt: Date | null;
  safeFailureCode?: string | null;
  safeFailureMessage?: string | null;
}

export interface CreateProviderOrderInput extends MoneySnapshot {
  receipt: string;
  notes: Readonly<Record<string, string>>;
}

export interface CheckoutSignatureInput {
  storedProviderOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface VerifiedProviderWebhook {
  providerEventId: string | null;
  eventType: string;
  payloadHash: string;
  normalizedPayloadVersion: number;
  normalizedPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly type: PaymentProviderType;

  createOrder(context: PaymentProviderContext, input: CreateProviderOrderInput): Promise<ProviderOrder>;
  fetchOrder(context: PaymentProviderContext, providerOrderId: string): Promise<ProviderOrder>;
  fetchPayment(context: PaymentProviderContext, providerPaymentId: string): Promise<ProviderPayment>;
  listOrderPayments(context: PaymentProviderContext, providerOrderId: string): Promise<ProviderPayment[]>;
  verifyCheckoutSignature(context: PaymentProviderContext, input: CheckoutSignatureInput): Promise<boolean>;
  verifyAndNormalizeWebhook(
    context: PaymentProviderContext,
    rawBody: Buffer,
    signature: string,
    providerEventId?: string,
  ): Promise<VerifiedProviderWebhook>;
}
