import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';

describe('commercial email rendering', () => {
  it('preserves integer minor-unit precision and provides no unsafe link', () => {
    const result = emailRendererRegistry.render(NotificationType.PAYMENT_CAPTURED, { companyName: 'Acme <One>', paymentReference: 'PAY-1', amountMinor: '900719925474099301', currency: 'INR', occurredAt: '2026-10-09T00:00:00.000Z' });
    assert.match(result.message, /INR 9007199254740993\.01/);
    assert.equal(result.safeDetailsPath, null);
    assert.doesNotMatch(result.message, /https?:\/\//);
  });

  it('renders failure guidance and invoice facts without secret-bearing fields', () => {
    const failed = emailRendererRegistry.render(NotificationType.PAYMENT_FAILED, { companyName: 'Acme', paymentReference: 'PAY-2', amountMinor: '100', currency: 'INR', occurredAt: '2026-10-09T00:00:00.000Z' });
    assert.match(failed.message, /Status: FAILED/);
    const invoice = emailRendererRegistry.render(NotificationType.INVOICE_ISSUED, { companyName: 'Acme', invoiceNumber: 'INV\/1', totalMinor: '12345', currency: 'INR', issuedAt: '2026-10-09T00:00:00.000Z', dueAt: null });
    assert.match(invoice.message, /INR 123\.45/);
    assert.doesNotMatch(JSON.stringify(invoice), /signature|credential|webhook|token/i);
    assert.throws(() => emailRendererRegistry.render(NotificationType.PAYMENT_CAPTURED, { companyName: 'Acme', paymentReference: 'PAY-1', amountMinor: '100', currency: 'INR', occurredAt: '2026-10-09T00:00:00.000Z', signature: 'secret' } as never));
  });
});
