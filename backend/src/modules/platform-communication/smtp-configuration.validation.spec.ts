import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SmtpSecurityModeInput, validateAndNormalizeSmtpConfiguration } from './smtp-configuration.validation';

const valid = {
  host: 'SMTP.Example.COM.',
  port: 587,
  securityMode: SmtpSecurityModeInput.STARTTLS,
  username: 'mailer@example.com',
  password: 'secure-password',
  senderEmail: 'Notifications@Example.com',
  senderDisplayName: 'Esta Workforce OS',
};

describe('SMTP configuration structural validation', () => {
  it('normalizes valid host and sender values', () => {
    const result = validateAndNormalizeSmtpConfiguration(valid);
    assert.equal(result.host, 'smtp.example.com');
    assert.equal(result.senderEmail, 'notifications@example.com');
  });

  it('accepts only the approved TLS and port combinations', () => {
    assert.equal(validateAndNormalizeSmtpConfiguration({ ...valid, port: 465, securityMode: SmtpSecurityModeInput.IMPLICIT_TLS }).port, 465);
    for (const candidate of [
      { port: 0, securityMode: SmtpSecurityModeInput.STARTTLS },
      { port: 65536, securityMode: SmtpSecurityModeInput.STARTTLS },
      { port: 465, securityMode: SmtpSecurityModeInput.STARTTLS },
      { port: 587, securityMode: SmtpSecurityModeInput.IMPLICIT_TLS },
      { port: 587.5, securityMode: SmtpSecurityModeInput.STARTTLS },
    ]) assert.throws(() => validateAndNormalizeSmtpConfiguration({ ...valid, ...candidate }));
  });

  it('rejects URLs, embedded credentials, paths, IP literals, and malformed hosts', () => {
    for (const host of [
      'smtp://mail.example.com', 'user:pass@mail.example.com', 'mail.example.com/path',
      '127.0.0.1', '[::1]', '-mail.example.com', 'mail_.example.com', `a.${'b'.repeat(64)}.com`,
    ]) assert.throws(() => validateAndNormalizeSmtpConfiguration({ ...valid, host }));
  });

  it('rejects malformed sender and oversized or control-bearing fields', () => {
    for (const patch of [
      { senderEmail: 'not-an-email' }, { senderDisplayName: '' }, { senderDisplayName: 'x'.repeat(161) },
      { username: '' }, { username: 'x'.repeat(321) }, { password: 'short' },
      { password: 'x'.repeat(4097) }, { username: 'user\nname' },
    ]) assert.throws(() => validateAndNormalizeSmtpConfiguration({ ...valid, ...patch }));
  });

  it('rejects unknown or missing properties', () => {
    assert.throws(() => validateAndNormalizeSmtpConfiguration({ ...valid, extra: true }));
    const { username: _username, ...missing } = valid;
    assert.throws(() => validateAndNormalizeSmtpConfiguration(missing));
  });
});
