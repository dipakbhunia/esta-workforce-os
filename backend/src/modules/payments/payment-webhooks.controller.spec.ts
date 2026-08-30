import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, HttpException, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import { PaymentWebhooksController } from './payment-webhooks.controller';

const configurationId = '00000000-0000-4000-8000-000000000010';

describe('PaymentWebhooksController', () => {
  it('passes exact raw bytes to unauthenticated provider ingress', async () => {
    let observed: Buffer | null = null;
    const controller = new PaymentWebhooksController({ ingest: async (_provider: unknown, _configuration: string, raw: Buffer) => { observed = raw; return { accepted: true, eventId: 'event-1' }; } } as never);
    const rawBody = Buffer.from('{ "b":2,"a":1 }');
    assert.deepEqual(await controller.receive('razorpay', configurationId, 'application/json; charset=utf-8', 'a'.repeat(64), 'evt-1', { rawBody } as never), { received: true, eventId: 'event-1' });
    assert.equal(observed, rawBody);
  });

  it('fails closed for missing raw body, content type, signature, and oversized input', async () => {
    const controller = new PaymentWebhooksController({ ingest: async () => ({ accepted: true, eventId: 'event-1' }) } as never);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'text/plain', 'a'.repeat(64), undefined, { rawBody: Buffer.from('{}') } as never), UnsupportedMediaTypeException);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'application/json-invalid', 'a'.repeat(64), undefined, { rawBody: Buffer.from('{}') } as never), UnsupportedMediaTypeException);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'application/json;', 'a'.repeat(64), undefined, { rawBody: Buffer.from('{}') } as never), UnsupportedMediaTypeException);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'application/json', 'a'.repeat(64), undefined, {} as never), BadRequestException);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'application/json', undefined, undefined, { rawBody: Buffer.from('{}') } as never), UnauthorizedException);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'application/json', 'a'.repeat(64), undefined, { rawBody: Buffer.alloc(256 * 1024 + 1) } as never), (error: HttpException) => error.getStatus() === 413);
  });

  it('returns generic unauthorized failure for a non-verifying signature', async () => {
    const controller = new PaymentWebhooksController({ ingest: async () => ({ accepted: false, reason: 'INVALID_SIGNATURE' }) } as never);
    await assert.rejects(() => controller.receive('razorpay', configurationId, 'application/json', '0'.repeat(64), undefined, { rawBody: Buffer.from('{}') } as never), UnauthorizedException);
  });
});
