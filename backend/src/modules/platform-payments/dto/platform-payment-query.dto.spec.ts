import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus } from '@prisma/client';
import { PlatformPaymentQueryDto } from './platform-payment-query.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (value: Record<string, unknown>) => pipe.transform(value, { type: 'query', metatype: PlatformPaymentQueryDto });

describe('PlatformPaymentQueryDto', () => {
  it('applies defaults and trims the locked filters', async () => {
    const dto = await validate({
      companyId: ' 00000000-0000-4000-8000-000000000001 ',
      subscriptionId: ' 00000000-0000-4000-8000-000000000002 ',
      status: ` ${PaymentStatus.CAPTURED} `,
      provider: ` ${PaymentProviderType.RAZORPAY} `,
      mode: ` ${PaymentProviderMode.TEST} `,
      purpose: ` ${PaymentPurpose.SUBSCRIPTION_ACTIVATION} `,
    });
    assert.equal(dto.page, 1);
    assert.equal(dto.limit, 20);
    assert.equal(dto.companyId, '00000000-0000-4000-8000-000000000001');
    assert.equal(dto.status, PaymentStatus.CAPTURED);
  });

  it('accepts limit 100 and rejects invalid pagination, UUIDs, enums, empty strings, search, and unknown fields', async () => {
    assert.equal((await validate({ limit: '100' })).limit, 100);
    for (const input of [
      { limit: '101' }, { limit: '0' }, { page: '0' },
      { companyId: 'bad' }, { status: 'UNKNOWN' }, { provider: '' },
      { search: 'needle' }, { providerOrderId: 'order' },
    ]) await assert.rejects(() => validate(input), BadRequestException);
  });

  it('enforces paired offset datetimes and a strictly increasing range', async () => {
    const dto = await validate({ from: ' 2026-09-01T00:00:00+05:30 ', to: '2026-09-02T00:00:00Z' });
    assert.equal(dto.from, '2026-09-01T00:00:00+05:30');
    for (const input of [
      { from: '2026-09-01T00:00:00Z' },
      { to: '2026-09-02T00:00:00Z' },
      { from: '2026-09-01', to: '2026-09-02' },
      { from: '2026-02-30T00:00:00Z', to: '2026-03-02T00:00:00Z' },
      { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' },
      { from: '2026-09-02T00:00:00Z', to: '2026-09-01T00:00:00Z' },
      { from: '2026-09-01T00:00:00Z', to: '2026-09-01T00:00:00Z' },
    ]) await assert.rejects(() => validate(input), BadRequestException);
  });
});
