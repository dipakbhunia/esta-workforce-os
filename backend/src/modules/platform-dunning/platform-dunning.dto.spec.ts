import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlatformDunningQueryDto } from './platform-dunning.dto';

async function errors(input: Record<string, unknown>) {
  return validate(plainToInstance(PlatformDunningQueryDto, input), { whitelist: true, forbidNonWhitelisted: true });
}

describe('PlatformDunningQueryDto', () => {
  it('applies pagination defaults and accepts every locked filter', async () => {
    const value = plainToInstance(PlatformDunningQueryDto, {}); assert.equal(value.page, 1); assert.equal(value.limit, 20);
    const valid = { page: '2', limit: '100', companyId: '00000000-0000-4000-8000-000000000001',
      subscriptionId: '00000000-0000-4000-8000-000000000002', renewalId: '00000000-0000-4000-8000-000000000003',
      paymentId: '00000000-0000-4000-8000-000000000004', paymentStatus: PaymentStatus.FAILED,
      from: '2035-06-01T05:30:00+05:30', to: '2035-07-01T00:00:00Z' };
    assert.deepEqual(await errors(valid), []);
  });
  it('accepts decimal pagination through the real transformation path', async () => {
    for (const [field, values] of [['page', ['1', '2', '100']], ['limit', ['1', '20', '100']]] as const) {
      for (const input of values) {
        const dto = plainToInstance(PlatformDunningQueryDto, { [field]: input });
        assert.deepEqual(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }), []);
        assert.equal(dto[field], Number(input)); assert.equal(typeof dto[field], 'number');
      }
    }
    const leadingZero = plainToInstance(PlatformDunningQueryDto, { page: '001' });
    assert.deepEqual(await validate(leadingZero), []); assert.equal(leadingZero.page, 1);
  });
  it('rejects malformed and unsafe pagination before numeric coercion can validate it', async () => {
    const malformed = ['0x10', '0X10', '1e2', '1E2', '1.0', '1.5', '+1', '-1', 'NaN', 'Infinity', '-Infinity', '', ' 1', '1 ', ' 20 ', '9007199254740992', '999999999999999999999999999999'];
    for (const field of ['page', 'limit'] as const) for (const input of malformed) {
      const dto = plainToInstance(PlatformDunningQueryDto, { [field]: input });
      assert.ok((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length > 0, `${field}=${JSON.stringify(input)}`);
    }
  });
  it('accepts only active Payment statuses', async () => {
    for (const paymentStatus of [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED]) assert.deepEqual(await errors({ paymentStatus }), []);
    for (const paymentStatus of [PaymentStatus.CAPTURED, 'UNKNOWN']) assert.ok((await errors({ paymentStatus })).length > 0);
  });
  it('rejects invalid pagination, UUIDs, unsupported search and unknown properties', async () => {
    for (const input of [{ page: 0 }, { page: 1.5 }, { limit: 0 }, { limit: 101 }, { companyId: 'bad' }, { subscriptionId: 'bad' },
      { renewalId: 'bad' }, { paymentId: 'bad' }, { search: 'not-supported' }, { status: 'OPEN' }]) assert.ok((await errors(input)).length > 0);
  });
  it('requires paired strict offset datetimes with from before to', async () => {
    assert.deepEqual(await errors({ from: '2035-06-01T00:00:00Z', to: '2035-07-01T00:00:00Z' }), []);
    for (const input of [{ from: '2035-06-01T00:00:00Z' }, { to: '2035-07-01T00:00:00Z' },
      { from: '2035-06-01', to: '2035-07-01' }, { from: '2035-06-01T00:00:00', to: '2035-07-01T00:00:00' },
      { from: '2035-02-30T00:00:00Z', to: '2035-03-01T00:00:00Z' },
      { from: '2035-07-01T00:00:00Z', to: '2035-07-01T00:00:00Z' },
      { from: '2035-08-01T00:00:00Z', to: '2035-07-01T00:00:00Z' }]) assert.ok((await errors(input)).length > 0);
  });
});
