import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { BillingInterval, SubscriptionRenewalStatus } from '@prisma/client';
import { PlatformRenewalQueryDto } from './platform-renewal-query.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (value: Record<string, unknown>) => pipe.transform(value, { type: 'query', metatype: PlatformRenewalQueryDto });

describe('PlatformRenewalQueryDto', () => {
  it('applies pagination defaults and accepts every locked filter', async () => {
    const dto = await validate({ companyId: ' 00000000-0000-4000-8000-000000000001 ',
      subscriptionId: '00000000-0000-4000-8000-000000000002', paymentId: '00000000-0000-4000-8000-000000000003',
      status: ` ${SubscriptionRenewalStatus.PREPARED} `, billingInterval: ` ${BillingInterval.MONTHLY} ` });
    assert.equal(dto.page, 1); assert.equal(dto.limit, 20); assert.equal(dto.status, SubscriptionRenewalStatus.PREPARED);
    assert.equal(dto.companyId, '00000000-0000-4000-8000-000000000001');
  });

  it('accepts the maximum and rejects invalid pagination, filters, search, and unknown fields', async () => {
    assert.equal((await validate({ limit: '100' })).limit, 100);
    for (const input of [{ page: '0' }, { limit: '101' }, { companyId: 'bad' }, { paymentId: '' },
      { status: 'UNKNOWN' }, { billingInterval: 'UNKNOWN' }, { search: 'x' }, { cycleStart: '2026-01-01' }]) {
      await assert.rejects(() => validate(input), BadRequestException);
    }
  });

  it('requires paired, real, offset datetimes in increasing order', async () => {
    assert.equal((await validate({ from: '2028-02-29T00:00:00Z', to: '2028-03-01T00:00:00+05:30' })).from,
      '2028-02-29T00:00:00Z');
    for (const input of [{ from: '2026-01-01T00:00:00Z' }, { to: '2026-01-02T00:00:00Z' },
      { from: '2026-02-29T00:00:00Z', to: '2026-03-01T00:00:00Z' },
      { from: '2026-02-30T00:00:00Z', to: '2026-03-01T00:00:00Z' },
      { from: '2026-01-01T00:00:00', to: '2026-01-02T00:00:00' },
      { from: '2026-01-02T00:00:00Z', to: '2026-01-01T00:00:00Z' }]) {
      await assert.rejects(() => validate(input), BadRequestException);
    }
  });
});
