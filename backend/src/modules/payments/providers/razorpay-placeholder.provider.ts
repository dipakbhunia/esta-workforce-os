import { Injectable } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import type { ProviderCredentialMaterial } from '../../billing-settings/provider-credential.types';
import type {
  CheckoutSignatureInput, CreateProviderOrderInput, PaymentProviderContext, ProviderOrder,
  ProviderPayment, VerifiedProviderWebhook,
} from './payment-provider.interface';
import type { SecurePaymentProvider } from './provider-registry.service';

@Injectable()
export class RazorpayPlaceholderProvider implements SecurePaymentProvider {
  readonly type = PaymentProviderType.RAZORPAY;

  validateCredentials(mode: PaymentProviderMode, material: ProviderCredentialMaterial): ProviderCredentialMaterial {
    const keyId = this.required(material.keyId);
    const keySecret = this.required(material.keySecret);
    const webhookSecret = this.required(material.webhookSecret);
    if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) throw new Error('Invalid key identifier');
    if (mode === PaymentProviderMode.TEST && !keyId.startsWith('rzp_test_')) throw new Error('Credential mode mismatch');
    if (mode === PaymentProviderMode.LIVE && !keyId.startsWith('rzp_live_')) throw new Error('Credential mode mismatch');
    return Object.freeze({ keyId, keySecret, webhookSecret });
  }

  async testConnection(material: ProviderCredentialMaterial) {
    const mode = material.keyId?.startsWith('rzp_live_') ? PaymentProviderMode.LIVE : PaymentProviderMode.TEST;
    this.validateCredentials(mode, material);
    return { success: true, category: 'STRUCTURAL_VALIDATION_ONLY' };
  }

  createOrder(_context: PaymentProviderContext, _input: CreateProviderOrderInput): Promise<ProviderOrder> { return this.deferred(); }
  fetchOrder(_context: PaymentProviderContext, _providerOrderId: string): Promise<ProviderOrder> { return this.deferred(); }
  fetchPayment(_context: PaymentProviderContext, _providerPaymentId: string): Promise<ProviderPayment> { return this.deferred(); }
  listOrderPayments(_context: PaymentProviderContext, _providerOrderId: string): Promise<ProviderPayment[]> { return this.deferred(); }
  verifyCheckoutSignature(_context: PaymentProviderContext, _input: CheckoutSignatureInput): Promise<boolean> { return this.deferred(); }
  verifyAndNormalizeWebhook(_context: PaymentProviderContext, _rawBody: Buffer, _signature: string, _providerEventId?: string): Promise<VerifiedProviderWebhook> { return this.deferred(); }

  private required(value: string | undefined): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Missing credential');
    return value.trim();
  }

  private deferred<T>(): Promise<T> {
    return Promise.reject(new Error('Provider network operations are deferred to E1.4'));
  }
}
