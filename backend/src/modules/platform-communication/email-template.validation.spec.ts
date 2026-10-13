import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { EMAIL_TEMPLATE_CATALOG, findEmailTemplateCatalogEntry } from './email-template-catalog';
import { EmailTemplateValidationError, validateEmailTemplateStructure } from './email-template.validation';

describe('Email Template catalog and structural validation', () => {
  it('contains exactly the current email-capable notification types', () => {
    assert.equal(EMAIL_TEMPLATE_CATALOG.length, 24);
    assert.equal(new Set(EMAIL_TEMPLATE_CATALOG.map(({ notificationType }) => notificationType)).size, 24);
    assert.equal(findEmailTemplateCatalogEntry(NotificationType.ALERT_ACKNOWLEDGED), null);
    assert.ok(findEmailTemplateCatalogEntry(NotificationType.ACCOUNT_INVITATION)?.systemManagedActionLink);
    assert.equal(findEmailTemplateCatalogEntry(NotificationType.PAYMENT_CAPTURED)?.systemManagedActionLink, false);
  });

  it('accepts only approved exact placeholders', () => {
    const result = validateEmailTemplateStructure({
      notificationType: NotificationType.PAYMENT_CAPTURED,
      subjectTemplate: 'Payment {{paymentReference}} received',
      textBodyTemplate: '{{companyName}} paid {{amountMinor}} {{currency}} at {{occurredAt}}.',
      placeholderContractVersion: 1,
    });
    assert.equal(result.code, 'VALID');
    assert.deepEqual(result.placeholders, ['amountMinor', 'companyName', 'currency', 'occurredAt', 'paymentReference']);
  });

  it('supports security templates with no editable action-link placeholder', () => {
    assert.doesNotThrow(() => validateEmailTemplateStructure({
      notificationType: NotificationType.PASSWORD_CHANGED,
      subjectTemplate: 'Your password changed', textBodyTemplate: 'If this was not you, contact support.',
      placeholderContractVersion: 1,
    }));
    assert.throws(() => validateEmailTemplateStructure({
      notificationType: NotificationType.ACCOUNT_INVITATION,
      subjectTemplate: 'Invitation', textBodyTemplate: 'Open {{actionLink}} before {{expiresAt}}.',
      placeholderContractVersion: 1,
    }), (error: unknown) => error instanceof EmailTemplateValidationError && error.code === 'UNAPPROVED_PLACEHOLDER');
  });

  it('rejects malformed placeholders, HTML, unsafe subjects, controls, and unsupported contracts', () => {
    const base = { notificationType: NotificationType.ACCOUNT_INVITATION,
      subjectTemplate: 'Invitation for {{organizationName}}', textBodyTemplate: 'Expires at {{expiresAt}}.',
      placeholderContractVersion: 1 };
    for (const input of [
      { ...base, subjectTemplate: 'Bad\nsubject' },
      { ...base, textBodyTemplate: '<script>alert(1)</script>' },
      { ...base, textBodyTemplate: '{{{organizationName}}}' },
      { ...base, textBodyTemplate: '{{organization.name}}' },
      { ...base, textBodyTemplate: '{{unknown}}' },
      { ...base, textBodyTemplate: 'bad\u0000body' },
      { ...base, placeholderContractVersion: 2 },
    ]) assert.throws(() => validateEmailTemplateStructure(input));
  });
});
