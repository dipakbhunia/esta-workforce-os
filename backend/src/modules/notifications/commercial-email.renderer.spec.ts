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

  it('renders authoritative subscription and renewal lifecycle facts without links', () => {
    const activated = emailRendererRegistry.render(NotificationType.SUBSCRIPTION_ACTIVATED, { companyName: 'Acme <One>', subscriptionReference: 'SUB-1', planName: 'Growth & Scale', activatedAt: '2026-10-09T00:00:00.000Z', periodStart: '2026-10-09T00:00:00.000Z', periodEnd: '2026-11-09T00:00:00.000Z' });
    const expired = emailRendererRegistry.render(NotificationType.SUBSCRIPTION_EXPIRED, { companyName: 'Acme', subscriptionReference: 'SUB-1', expiredAt: '2026-11-09T00:00:00.000Z' });
    const prepared = emailRendererRegistry.render(NotificationType.RENEWAL_PREPARED, { companyName: 'Acme', renewalReference: 'REN-1', periodStart: '2026-11-09T00:00:00.000Z', periodEnd: '2026-12-09T00:00:00.000Z' });
    const applied = emailRendererRegistry.render(NotificationType.RENEWAL_APPLIED, { companyName: 'Acme', renewalReference: 'REN-1', periodStart: '2026-11-09T00:00:00.000Z', periodEnd: '2026-12-09T00:00:00.000Z' });
    const blocked = emailRendererRegistry.render(NotificationType.RENEWAL_BLOCKED, { companyName: 'Acme', renewalReference: 'REN-1', blockedReason: 'Stored billing evidence did not reconcile <unsafe>' });
    for (const result of [activated, expired, prepared, applied, blocked]) {
      assert.equal(result.safeDetailsPath, null);
      assert.doesNotMatch(result.message, /https?:\/\//);
    }
    assert.match(activated.message, /Growth & Scale/);
    assert.match(blocked.message, /Stored billing evidence/);
    assert.throws(() => emailRendererRegistry.render(NotificationType.RENEWAL_BLOCKED, { companyName: 'Acme', renewalReference: 'REN-1', blockedReason: '' }));
  });
});
