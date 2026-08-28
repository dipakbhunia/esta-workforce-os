import { Inject, Injectable } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderCredentialMaterial } from '../../billing-settings/provider-credential.types';
import type {
  CheckoutSignatureInput, CreateProviderOrderInput, PaymentProviderContext, ProviderOrder,
  ProviderPayment, VerifiedProviderWebhook,
} from './payment-provider.interface';
import { ProviderOperationError } from './provider-operation.error';
import type { SecurePaymentProvider } from './provider-registry.service';
import { RazorpayHttpTransport, type RazorpayTransport } from './razorpay-http.transport';

interface RazorpayOrderBody {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  created_at: number;
  notes?: unknown;
}

@Injectable()
export class RazorpayProvider implements SecurePaymentProvider {
  readonly type = PaymentProviderType.RAZORPAY;
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  constructor(@Inject(RazorpayHttpTransport) private readonly transport: RazorpayTransport = new RazorpayHttpTransport()) {}

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

  async createOrder(context: PaymentProviderContext, input: CreateProviderOrderInput): Promise<ProviderOrder> {
    this.assertTestContext(context);
    const response = await this.request(context, 'POST', '/orders', {
      amount: this.safeAmountNumber(input.amountMinor), currency: input.currency,
      receipt: input.receipt, notes: input.notes,
    });
    return this.normalizeOrder(response);
  }

  async fetchOrder(context: PaymentProviderContext, providerOrderId: string): Promise<ProviderOrder> {
    this.assertTestContext(context);
    return this.normalizeOrder(await this.request(context, 'GET', `/orders/${encodeURIComponent(this.required(providerOrderId))}`));
  }

  async findOrdersByReceipt(context: PaymentProviderContext, receipt: string): Promise<ProviderOrder[]> {
    this.assertTestContext(context);
    const exact: ProviderOrder[] = [];
    for (let skip = 0; skip < 10_000; skip += 100) {
      const query = new URLSearchParams({ receipt, count: '100', skip: String(skip) });
      const body = await this.request(context, 'GET', `/orders?${query.toString()}`) as { items?: unknown };
      if (!body || !Array.isArray(body.items)) {
        throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_INVALID_RESPONSE', 'Payment provider response could not be verified');
      }
      for (const value of body.items) {
        const order = this.normalizeOrder(value);
        if (order.receipt === receipt) exact.push(order);
      }
      if (body.items.length < 100) return exact;
    }
    throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_RECONCILIATION_LIMIT', 'Payment provider reconciliation requires manual review');
  }

  fetchPayment(_context: PaymentProviderContext, _providerPaymentId: string): Promise<ProviderPayment> { return this.deferred(); }
  listOrderPayments(_context: PaymentProviderContext, _providerOrderId: string): Promise<ProviderPayment[]> { return this.deferred(); }
  async verifyCheckoutSignature(context: PaymentProviderContext, input: CheckoutSignatureInput): Promise<boolean> {
    this.assertContext(context);
    const orderId = this.required(input.storedProviderOrderId);
    const paymentId = this.required(input.providerPaymentId);
    if (!/^order_[A-Za-z0-9]+$/.test(orderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^[a-f0-9]{64}$/.test(input.signature)) return false;
    const expected = createHmac('sha256', context.credentials.keySecret).update(`${orderId}|${paymentId}`, 'utf8').digest();
    const submitted = Buffer.from(input.signature, 'hex');
    return submitted.length === expected.length && timingSafeEqual(submitted, expected);
  }
  verifyAndNormalizeWebhook(_context: PaymentProviderContext, _rawBody: Buffer, _signature: string, _providerEventId?: string): Promise<VerifiedProviderWebhook> { return this.deferred(); }

  private async request(context: PaymentProviderContext, method: 'GET' | 'POST', path: string, body?: Readonly<Record<string, unknown>>): Promise<unknown> {
    try {
      const response = await this.transport.request({
        method, url: `${this.baseUrl}${path}`,
        authorization: `Basic ${Buffer.from(`${context.credentials.keyId}:${context.credentials.keySecret}`, 'utf8').toString('base64')}`,
        body,
      });
      if (response.status >= 200 && response.status < 300) return response.body;
      if (response.status >= 400 && response.status < 500) {
        throw new ProviderOperationError('DEFINITE_FAILURE', 'PROVIDER_REJECTED', 'Payment provider rejected the order request');
      }
      throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_UNAVAILABLE', 'Payment provider result is unknown');
    } catch (error) {
      if (error instanceof ProviderOperationError) throw error;
      throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_TRANSPORT_UNKNOWN', 'Payment provider result is unknown');
    }
  }

  private normalizeOrder(value: unknown): ProviderOrder {
    if (!value || typeof value !== 'object') throw this.invalidResponse();
    const order = value as Partial<RazorpayOrderBody>;
    if (order.entity !== 'order' || typeof order.id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(order.id)) throw this.invalidResponse();
    if (!Number.isSafeInteger(order.amount) || (order.amount as number) <= 0) throw this.invalidResponse();
    if (typeof order.currency !== 'string' || !/^[A-Z]{3}$/.test(order.currency)) throw this.invalidResponse();
    if (typeof order.receipt !== 'string' || !order.receipt || order.receipt.length > 40) throw this.invalidResponse();
    if (!['created', 'attempted', 'paid'].includes(String(order.status))) throw this.invalidResponse();
    if (!Number.isSafeInteger(order.created_at) || (order.created_at as number) <= 0 || (order.created_at as number) > 8_640_000_000_000) throw this.invalidResponse();
    return {
      id: order.id, amountMinor: BigInt(order.amount as number), currency: order.currency,
      receipt: order.receipt, status: String(order.status), createdAt: new Date((order.created_at as number) * 1000),
    };
  }

  private safeAmountNumber(value: bigint): number {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ProviderOperationError('DEFINITE_FAILURE', 'INVALID_AMOUNT', 'Payment amount is invalid');
    return Number(value);
  }
  private assertTestContext(context: PaymentProviderContext): void {
    if (context.provider !== this.type || context.mode !== PaymentProviderMode.TEST) {
      throw new ProviderOperationError('DEFINITE_FAILURE', 'PROVIDER_MODE_UNSUPPORTED', 'Provider order execution is not available');
    }
    this.validateCredentials(context.mode, context.credentials);
  }
  private assertContext(context: PaymentProviderContext): void {
    if (context.provider !== this.type) throw new Error('Provider context mismatch');
    this.validateCredentials(context.mode, context.credentials);
  }
  private invalidResponse(): ProviderOperationError { return new ProviderOperationError('AMBIGUOUS', 'PROVIDER_INVALID_RESPONSE', 'Payment provider response could not be verified'); }
  private required(value: string | undefined): string { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing credential'); return value.trim(); }
  private deferred<T>(): Promise<T> { return Promise.reject(new Error('Provider operation is outside the E1.4 scope')); }
}
