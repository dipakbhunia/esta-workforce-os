import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmailTemplateVersionLifecycle, NotificationType } from '@prisma/client';
import { EmailTemplateRuntimeResolver } from './email-template-runtime-resolver.service';

const payment = { companyName: 'Acme', paymentReference: 'PAY-1', amountMinor: '100', currency: 'INR',
  occurredAt: '2030-01-01T00:00:00.000Z' };
const reader = (activeVersion: unknown) => ({ emailTemplate: { findUnique: async () => activeVersion === undefined
  ? null : ({ notificationType: NotificationType.PAYMENT_CAPTURED, activeVersion }) } }) as never;

describe('EmailTemplateRuntimeResolver', () => {
  it('selects only a published active version and returns immutable provenance', async () => {
    const result = await new EmailTemplateRuntimeResolver().resolve(reader({ id: 'version-1',
      lifecycle: EmailTemplateVersionLifecycle.PUBLISHED, subjectTemplate: 'Paid {{paymentReference}}',
      textBodyTemplate: '{{companyName}} paid {{amountMinor}} {{currency}}.', placeholderContractVersion: 1,
    }), NotificationType.PAYMENT_CAPTURED, payment);
    assert.equal(result.composition.subject, 'Paid PAY-1');
    assert.equal(result.composition.message, 'Acme paid 100 INR.');
    assert.equal(result.emailTemplateVersionId, 'version-1');
  });

  it('falls back for absent, draft, incompatible, or malformed templates without provenance', async () => {
    for (const activeVersion of [undefined, { id: 'draft', lifecycle: EmailTemplateVersionLifecycle.DRAFT,
      subjectTemplate: 'Draft', textBodyTemplate: 'Draft', placeholderContractVersion: 1 },
    { id: 'invalid', lifecycle: EmailTemplateVersionLifecycle.PUBLISHED,
      subjectTemplate: 'Bad {{unknown}}', textBodyTemplate: 'Bad', placeholderContractVersion: 1 },
    { id: 'contract', lifecycle: EmailTemplateVersionLifecycle.PUBLISHED,
      subjectTemplate: 'Bad', textBodyTemplate: 'Bad', placeholderContractVersion: 2 }]) {
      const result = await new EmailTemplateRuntimeResolver().resolve(reader(activeVersion),
        NotificationType.PAYMENT_CAPTURED, payment);
      assert.equal(result.emailTemplateVersionId, null);
      assert.match(result.composition.subject, /Payment captured/);
    }
  });

  it('never applies managed overrides to system-owned identity-action content', async () => {
    let queried = false;
    const result = await new EmailTemplateRuntimeResolver().resolve({ emailTemplate: { findUnique: async () => {
      queried = true; throw new Error('must not query');
    } } } as never, NotificationType.ACCOUNT_INVITATION,
    { organizationName: 'Acme', expiresAt: '2030-01-01T00:00:00.000Z' });
    assert.equal(queried, false);
    assert.equal(result.emailTemplateVersionId, null);
    assert.match(result.composition.message, /secure one-time link/i);
  });

  it('does not conceal database failures as template absence', async () => {
    await assert.rejects(() => new EmailTemplateRuntimeResolver().resolve({ emailTemplate: {
      findUnique: async () => { throw new Error('database unavailable'); },
    } } as never, NotificationType.PAYMENT_CAPTURED, payment), /database unavailable/);
  });
});
