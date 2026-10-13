import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType } from '@prisma/client';
import { EMAIL_TEMPLATE_CATALOG } from './email-template-catalog';
import { compileEmailTemplate, EmailTemplateContractError, renderCompiledEmailTemplate } from './email-template.compiler';
import { emailTemplateSyntheticValues } from './email-template-synthetic-preview';
import { renderEmailHtml } from '../notifications/email-notification-channel.service';

function input(type: NotificationType, subjectTemplate: string, textBodyTemplate: string) {
  return { notificationType: type, subjectTemplate, textBodyTemplate, placeholderContractVersion: 1 };
}

describe('Email Template compiler and renderer', () => {
  it('compiles and deterministically renders every one of the 24 email event contracts', () => {
    assert.equal(EMAIL_TEMPLATE_CATALOG.length, 24);
    for (const catalog of EMAIL_TEMPLATE_CATALOG) {
      const body = catalog.allowedVariables.length
        ? catalog.allowedVariables.map((name) => `${name}: {{${name}}}`).join('\n')
        : 'No configurable values are required.';
      const compiled = compileEmailTemplate(input(catalog.notificationType, `Preview ${catalog.templateKey}`, body));
      const first = renderCompiledEmailTemplate(compiled, emailTemplateSyntheticValues(catalog.notificationType));
      const second = renderCompiledEmailTemplate(compiled, emailTemplateSyntheticValues(catalog.notificationType));
      assert.deepEqual(first, second);
      assert.equal(first.subject.includes('{{'), false);
      assert.equal(first.textBody.includes('{{'), false);
      assert.ok(Object.isFrozen(compiled));
      assert.ok(Object.isFrozen(compiled.subject));
      assert.ok(Object.isFrozen(compiled.textBody));
    }
  });

  it('uses the same strict grammar for malformed, nested, expression, HTML, and unknown placeholders', () => {
    const base = input(NotificationType.ACCOUNT_INVITATION, 'Invitation', 'Expires {{expiresAt}}');
    for (const textBodyTemplate of [
      '{{{expiresAt}}}', '{{expiresAt}}}', '{{ expiresAt }}', '{{user.email}}', '{{expiresAt | safe}}',
      '{{#if expiresAt}}x{{/if}}', '{{unknown}}', '<strong>{{expiresAt}}</strong>', 'x } y',
    ]) {
      assert.throws(() => compileEmailTemplate({ ...base, textBodyTemplate }), EmailTemplateContractError);
    }
    assert.throws(() => compileEmailTemplate({ ...base, textBodyTemplate: '{{actionLink}}' }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'UNAPPROVED_PLACEHOLDER');
  });

  it('fails closed on required, unknown, oversized, control, and subject newline values', () => {
    const compiled = compileEmailTemplate(input(NotificationType.PAYMENT_CAPTURED,
      'Payment {{paymentReference}}', '{{companyName}} paid {{amountMinor}} {{currency}} at {{occurredAt}}'));
    const values = emailTemplateSyntheticValues(NotificationType.PAYMENT_CAPTURED);
    assert.throws(() => renderCompiledEmailTemplate(compiled, { ...values, paymentReference: undefined }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'MISSING_REQUIRED_VALUE');
    assert.throws(() => renderCompiledEmailTemplate(compiled, { ...values, password: 'secret' }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'UNAPPROVED_VALUE');
    assert.throws(() => renderCompiledEmailTemplate(compiled, { ...values, paymentReference: 'x\nBcc: attacker' }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'INVALID_SUBJECT_VALUE');
    assert.throws(() => renderCompiledEmailTemplate(compiled, { ...values, companyName: `bad\u0000value` }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'INVALID_TEMPLATE_VALUE');
    assert.throws(() => renderCompiledEmailTemplate(compiled, { ...values, companyName: 'x'.repeat(10_001) }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'INVALID_TEMPLATE_VALUE');
  });

  it('preserves Unicode and safely normalizes body line endings while handling declared optional values', () => {
    const compiled = compileEmailTemplate(input(NotificationType.ALERT_OPENED, 'Alert {{title}}',
      '{{message}}\nEmployee: {{employeeDisplayName}}'));
    const rendered = renderCompiledEmailTemplate(compiled, {
      ...emailTemplateSyntheticValues(NotificationType.ALERT_OPENED),
      title: 'सुरक्षा चेतावनी 🔐', message: 'Line one\r\nLine two', employeeDisplayName: null,
    });
    assert.equal(rendered.subject, 'Alert सुरक्षा चेतावनी 🔐');
    assert.equal(rendered.textBody, 'Line one\nLine two\nEmployee: ');
  });

  it('keeps substituted HTML-like values inert in the trusted HTML envelope', () => {
    const compiled = compileEmailTemplate(input(NotificationType.ALERT_OPENED, 'Alert {{title}}', '{{message}}'));
    const rendered = renderCompiledEmailTemplate(compiled, {
      ...emailTemplateSyntheticValues(NotificationType.ALERT_OPENED), title: '<img src=x onerror=alert(1)>',
      message: '<script>steal()</script> & data',
    });
    const html = renderEmailHtml({ type: NotificationType.ALERT_OPENED, title: rendered.subject,
      message: rendered.textBody, severity: null, detailsPath: null });
    assert.doesNotMatch(html, /<script>|<img/i);
    assert.match(html, /&lt;script&gt;steal\(\)&lt;\/script&gt; &amp; data/);
  });

  it('enforces template and rendered output bounds', () => {
    assert.throws(() => compileEmailTemplate(input(NotificationType.PASSWORD_CHANGED, 'x'.repeat(999), 'Body')),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'INVALID_SUBJECT');
    const compiled = compileEmailTemplate(input(NotificationType.PAYMENT_CAPTURED, '{{paymentReference}}', 'Body'));
    assert.throws(() => renderCompiledEmailTemplate(compiled, { paymentReference: 'x'.repeat(999) }),
      (error: unknown) => error instanceof EmailTemplateContractError && error.code === 'RENDERED_SUBJECT_OUT_OF_BOUNDS');
  });
});
