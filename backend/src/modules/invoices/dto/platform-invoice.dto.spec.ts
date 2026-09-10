import assert from 'node:assert/strict';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, it } from 'node:test';
import { IssuePlatformInvoiceDto, PlatformInvoiceQueryDto } from './platform-invoice.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const metadata = { type: 'query' as const, metatype: PlatformInvoiceQueryDto, data: '' };

describe('Platform invoice DTOs', () => {
  it('accepts the minimal issuance body and rejects missing, invalid, or unknown input', async () => {
    const bodyMeta = { type: 'body' as const, metatype: IssuePlatformInvoiceDto, data: '' };
    const paymentId = '00000000-0000-4000-8000-000000000001';
    const result = await pipe.transform({ paymentId }, bodyMeta);
    assert.ok(result instanceof IssuePlatformInvoiceDto);
    assert.equal(result.paymentId, paymentId);
    await assert.rejects(() => pipe.transform({}, bodyMeta), BadRequestException);
    await assert.rejects(() => pipe.transform({ paymentId: 'invalid' }, bodyMeta), BadRequestException);
    await assert.rejects(() => pipe.transform({ paymentId, amountMinor: '1' }, bodyMeta), BadRequestException);
  });

  it('applies pagination defaults and accepts every narrow filter', async () => {
    const result = await pipe.transform({
      companyId: '00000000-0000-4000-8000-000000000001',
      subscriptionId: '00000000-0000-4000-8000-000000000002',
      sourcePaymentId: '00000000-0000-4000-8000-000000000003',
      invoiceNumber: ' INV/000001 ',
      from: '2026-09-01T00:00:00Z',
      to: '2026-10-01T00:00:00+05:30',
    }, metadata);
    assert.equal(result.page, 1);
    assert.equal(result.limit, 20);
    assert.equal(result.invoiceNumber, 'INV/000001');
  });

  it('rejects invalid pagination, UUID filters, unknown fields, and unsupported search', async () => {
    for (const query of [
      { page: 0 }, { limit: 0 }, { limit: 101 }, { companyId: 'bad' },
      { subscriptionId: 'bad' }, { sourcePaymentId: 'bad' }, { unknown: 'x' }, { search: 'x' },
    ]) await assert.rejects(() => pipe.transform(query, metadata), BadRequestException);
  });

  it('requires paired strict offset datetimes in increasing order', async () => {
    for (const query of [
      { from: '2026-09-01T00:00:00Z' },
      { to: '2026-09-02T00:00:00Z' },
      { from: '2026-09-01', to: '2026-09-02' },
      { from: '2026-09-02T00:00:00Z', to: '2026-09-01T00:00:00Z' },
      { from: '2026-09-01T00:00:00Z', to: '2026-09-01T00:00:00Z' },
      { from: '2026-02-30T00:00:00Z', to: '2026-03-02T00:00:00Z' },
    ]) await assert.rejects(() => pipe.transform(query, metadata), BadRequestException);
  });
});
