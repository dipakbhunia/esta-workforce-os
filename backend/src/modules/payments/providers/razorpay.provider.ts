import { Inject, Injectable } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
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
  verifyWebhookSignature(context: PaymentProviderContext, rawBody: Buffer, signature: string): boolean {
    this.assertContext(context);
    if (!/^[a-f0-9]{64}$/.test(signature)) return false;
    const expected = createHmac('sha256', context.credentials.webhookSecret).update(rawBody).digest();
    const submitted = Buffer.from(signature, 'hex');
    return submitted.length === expected.length && timingSafeEqual(submitted, expected);
  }

  normalizeWebhookEvent(rawBody: Buffer, providerEventId?: string, normalizationTime = new Date()): VerifiedProviderWebhook {
    let value: unknown;
    try { value = JSON.parse(rawBody.toString('utf8')); } catch { throw new Error('Webhook payload is malformed'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Webhook payload is malformed');
    const envelope = value as Record<string, unknown>;
    const sourceEventType = typeof envelope.event === 'string' ? envelope.event : '';
    if (!sourceEventType || envelope.entity !== 'event') throw new Error('Webhook payload is malformed');
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const supported = ['payment.authorized', 'payment.captured', 'payment.failed'].includes(sourceEventType);
    if (!supported) {
      return {
        providerEventId: this.optionalEventId(providerEventId), sourceEventType, truth: 'IGNORED',
        providerOrderId: null, providerPaymentId: null, providerPaymentStatus: null, captured: null,
        amountMinor: null, currency: null, occurredAt: this.optionalTimestamp(envelope.created_at, normalizationTime),
        safeFailureCode: null, safeFailureMessage: null, payloadHash, normalizedPayloadVersion: 1,
        normalizedPayload: { sourceEventType, truth: 'IGNORED' },
      };
    }
    const payload = envelope.payload;
    const payment = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).payment : null;
    const entity = payment && typeof payment === 'object' && !Array.isArray(payment)
      ? (payment as Record<string, unknown>).entity : null;
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) throw new Error('Webhook payment evidence is malformed');
    const p = entity as Record<string, unknown>;
    const providerPaymentId = this.providerId(p.id, /^pay_[A-Za-z0-9]+$/);
    const providerOrderId = this.providerId(p.order_id, /^order_[A-Za-z0-9]+$/);
    if (!Number.isSafeInteger(p.amount) || (p.amount as number) <= 0) throw new Error('Webhook payment amount is invalid');
    const amountMinor = BigInt(p.amount as number);
    const currency = typeof p.currency === 'string' ? p.currency : '';
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Webhook payment currency is invalid');
    const status = typeof p.status === 'string' ? p.status : '';
    const captured = p.captured;
    let truth: VerifiedProviderWebhook['truth'];
    if (sourceEventType === 'payment.authorized') {
      if (status !== 'authorized' || typeof captured !== 'boolean') throw new Error('Webhook authorization evidence is invalid');
      truth = 'PAYMENT_AUTHORIZED';
    } else if (sourceEventType === 'payment.captured') {
      if (status !== 'captured' || captured !== true) throw new Error('Webhook capture evidence is invalid');
      truth = 'PAYMENT_CAPTURED';
    } else {
      if (status !== 'failed' || captured !== false) throw new Error('Webhook failure evidence is invalid');
      truth = 'PAYMENT_FAILED';
    }
    const safeFailureCode = truth === 'PAYMENT_FAILED' ? this.safeText(p.error_code, 80) : null;
    const safeFailureMessage = truth === 'PAYMENT_FAILED' ? this.safeText(p.error_description, 240) : null;
    const occurredAt = this.optionalTimestamp(envelope.created_at, normalizationTime);
    return {
      providerEventId: this.optionalEventId(providerEventId), sourceEventType, truth,
      providerOrderId, providerPaymentId, providerPaymentStatus: status, captured,
      amountMinor, currency, occurredAt, safeFailureCode, safeFailureMessage,
      payloadHash, normalizedPayloadVersion: 1,
      normalizedPayload: {
        sourceEventType, truth, providerOrderId, providerPaymentId, providerPaymentStatus: status,
        captured, amountMinor: amountMinor.toString(), currency,
        occurredAt: occurredAt?.toISOString() ?? null, safeFailureCode, safeFailureMessage,
      },
    };
  }

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
  private providerId(value: unknown, pattern: RegExp): string { if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Webhook provider identity is invalid'); return value; }
  private optionalEventId(value?: string): string | null { if (value === undefined) return null; const result = value.trim(); if (!result || result.length > 255) throw new Error('Webhook event identity is invalid'); return result; }
  private optionalTimestamp(value: unknown, normalizationTime: Date): Date | null {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || (value as number) <= 0 || !Number.isFinite(normalizationTime.getTime())) throw new Error('Webhook timestamp is invalid');
    const timestampMs = (value as number) * 1000;
    const result = new Date(timestampMs);
    if (!Number.isFinite(result.getTime()) || result.getTime() > normalizationTime.getTime() + 5 * 60_000) throw new Error('Webhook timestamp is invalid');
    return result;
  }
  private safeText(value: unknown, max: number): string | null { if (typeof value !== 'string') return null; const result = value.trim().replace(/[\r\n\t]+/g, ' ').slice(0, max); return result || null; }
  private deferred<T>(): Promise<T> { return Promise.reject(new Error('Provider operation is outside the E1.4 scope')); }
}
