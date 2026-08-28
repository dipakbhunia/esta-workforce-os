import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { ProviderOperationError } from './provider-operation.error';
import { RazorpayProvider } from './razorpay.provider';
import type { RazorpayHttpRequest, RazorpayHttpResponse, RazorpayTransport } from './razorpay-http.transport';

const context = {
  provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST,
  providerConfigurationId: 'config', credentialVersionId: 'credential-v1',
  credentials: { keyId: 'rzp_test_public', keySecret: 'top-secret', webhookSecret: 'webhook-secret' },
};
const rawOrder = { id: 'order_ABC123', entity: 'order', amount: 49500, currency: 'INR', receipt: 'pay_abc', status: 'created', created_at: 1_700_000_000 };

class FakeTransport implements RazorpayTransport {
  readonly calls: RazorpayHttpRequest[] = [];
  constructor(private readonly responses: Array<RazorpayHttpResponse | Error>) {}
  async request(input: RazorpayHttpRequest): Promise<RazorpayHttpResponse> {
    this.calls.push(input);
    const value = this.responses.shift();
    if (value instanceof Error) throw value;
    if (!value) throw new Error('No response');
    return value;
  }
}

describe('RazorpayProvider E1.4 orders', () => {
  it('verifies checkout signatures offline from the stored order ID and keySecret only', async () => {
    const transport = new FakeTransport([]);
    const provider = new RazorpayProvider(transport);
    const providerPaymentId = 'pay_ABC123';
    const signature = createHmac('sha256', context.credentials.keySecret).update(`order_STORED|${providerPaymentId}`).digest('hex');
    assert.equal(await provider.verifyCheckoutSignature(context, { storedProviderOrderId: 'order_STORED', providerPaymentId, signature }), true);
    assert.equal(await provider.verifyCheckoutSignature(context, { storedProviderOrderId: 'order_CLIENT', providerPaymentId, signature }), false);
    const webhookSignature = createHmac('sha256', context.credentials.webhookSecret).update(`order_STORED|${providerPaymentId}`).digest('hex');
    assert.equal(await provider.verifyCheckoutSignature(context, { storedProviderOrderId: 'order_STORED', providerPaymentId, signature: webhookSignature }), false);
    assert.equal(transport.calls.length, 0);
  });

  it('rejects malformed and noncanonical checkout signatures without transport', async () => {
    const transport = new FakeTransport([]);
    const provider = new RazorpayProvider(transport);
    for (const signature of ['', 'A'.repeat(64), 'g'.repeat(64), '0'.repeat(63), '0'.repeat(66)]) {
      assert.equal(await provider.verifyCheckoutSignature(context, { storedProviderOrderId: 'order_STORED', providerPaymentId: 'pay_ABC123', signature }), false);
    }
    assert.equal(transport.calls.length, 0);
  });

  it('creates an order through one HTTPS POST with exact safe integer money and Basic auth', async () => {
    const transport = new FakeTransport([{ status: 200, body: rawOrder }]);
    const provider = new RazorpayProvider(transport);
    const result = await provider.createOrder(context, { amountMinor: 49500n, currency: 'INR', receipt: 'pay_abc', notes: { payment_id: 'p' } });
    assert.equal(result.amountMinor, 49500n);
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.calls[0].method, 'POST');
    assert.equal(transport.calls[0].url, 'https://api.razorpay.com/v1/orders');
    assert.deepEqual(transport.calls[0].body, { amount: 49500, currency: 'INR', receipt: 'pay_abc', notes: { payment_id: 'p' } });
    assert.equal(transport.calls[0].authorization, `Basic ${Buffer.from('rzp_test_public:top-secret').toString('base64')}`);
    assert.equal('credentials' in result, false);
    assert.equal(Object.values(result).some((value) => value === 'top-secret'), false);
  });

  it('accepts the exact safe-integer money boundary and rejects the first over-limit amount before transport', async () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const transport = new FakeTransport([{ status: 200, body: { ...rawOrder, amount: maximum } }]);
    const result = await new RazorpayProvider(transport).createOrder(context, {
      amountMinor: BigInt(maximum), currency: 'INR', receipt: 'pay_abc', notes: {},
    });
    assert.equal(result.amountMinor, BigInt(maximum));
    assert.equal(transport.calls[0].body?.amount, maximum);

    const blockedTransport = new FakeTransport([]);
    await assert.rejects(
      () => new RazorpayProvider(blockedTransport).createOrder(context, {
        amountMinor: BigInt(maximum) + 1n, currency: 'INR', receipt: 'pay_abc', notes: {},
      }),
      (error: ProviderOperationError) => error.outcome === 'DEFINITE_FAILURE' && error.safeCode === 'INVALID_AMOUNT',
    );
    assert.equal(blockedTransport.calls.length, 0);
  });

  it('paginates receipt lookup and accepts only exact receipt matches', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ ...rawOrder, id: `order_A${index}`, receipt: `xpay_abc${index}` }));
    const transport = new FakeTransport([{ status: 200, body: { items: first } }, { status: 200, body: { items: [rawOrder] } }]);
    const matches = await new RazorpayProvider(transport).findOrdersByReceipt(context, 'pay_abc');
    assert.deepEqual(matches.map((value) => value.id), ['order_ABC123']);
    assert.match(transport.calls[0].url, /receipt=pay_abc/);
    assert.match(transport.calls[1].url, /skip=100/);
  });

  it('classifies 4xx as definite and 5xx/network outcomes as ambiguous without leaking bodies', async () => {
    for (const [response, outcome] of [
      [{ status: 400, body: { error: 'top-secret' } }, 'DEFINITE_FAILURE'],
      [{ status: 500, body: { error: 'top-secret' } }, 'AMBIGUOUS'],
      [new Error('top-secret'), 'AMBIGUOUS'],
    ] as const) {
      const provider = new RazorpayProvider(new FakeTransport([response]));
      await assert.rejects(() => provider.createOrder(context, { amountMinor: 1n, currency: 'INR', receipt: 'pay_abc', notes: {} }), (error: ProviderOperationError) => {
        assert.equal(error.outcome, outcome); assert.equal(error.message.includes('top-secret'), false); return true;
      });
    }
  });

  it('rejects LIVE execution and malformed order fields fail closed as ambiguous', async () => {
    await assert.rejects(() => new RazorpayProvider(new FakeTransport([])).createOrder({ ...context, mode: PaymentProviderMode.LIVE, credentials: { ...context.credentials, keyId: 'rzp_live_public' } }, { amountMinor: 1n, currency: 'INR', receipt: 'pay_abc', notes: {} }), ProviderOperationError);
    for (const patch of [{ id: '' }, { amount: 1.5 }, { currency: 'inr' }, { receipt: '' }, { status: 'unknown' }, { created_at: 0 }]) {
      const provider = new RazorpayProvider(new FakeTransport([{ status: 200, body: { ...rawOrder, ...patch } }]));
      await assert.rejects(() => provider.createOrder(context, { amountMinor: 49500n, currency: 'INR', receipt: 'pay_abc', notes: {} }), (error: ProviderOperationError) => error.outcome === 'AMBIGUOUS');
    }
  });
});
