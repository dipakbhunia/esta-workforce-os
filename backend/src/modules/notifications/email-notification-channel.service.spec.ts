import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmailNotificationChannel, safeEmailErrorEvidence } from './email-notification-channel.service';

const service = new EmailNotificationChannel({ get: () => undefined } as never);

describe('EmailNotificationChannel error safety', () => {
  it('maps provider failures to allow-listed generic evidence', () => {
    const cases = [
      [{ code: 'EAUTH', message: 'password=secret' }, 'SMTP_AUTH_FAILED'],
      [{ code: 'ECONNREFUSED', message: 'smtp://user:secret@host' }, 'SMTP_CONNECTION_FAILED'],
      [{ code: 'ENOTFOUND', message: 'private.host' }, 'SMTP_DNS_FAILED'],
      [{ code: 'CERT_HAS_EXPIRED', message: 'certificate detail' }, 'SMTP_TLS_FAILED'],
      [{ code: 'ETIMEDOUT', message: 'private timeout detail' }, 'SMTP_TIMEOUT'],
      [{ responseCode: 421, message: 'provider detail' }, 'SMTP_RATE_LIMITED'],
      [{ responseCode: 550, message: 'recipient rejected detail' }, 'SMTP_REJECTED'],
      [{ message: 'token=secret' }, 'SMTP_UNKNOWN'],
    ] as const;
    for (const [error, code] of cases) {
      const safe = service.sanitizeError(error);
      assert.equal(safe.code, code);
      assert.ok(safe.message.length <= 160);
      assert.doesNotMatch(safe.message, /secret|private|token|smtp:\/\//i);
    }
  });

  it('returns capability booleans only', () => {
    assert.deepEqual(Object.keys(service.capability()).sort(), ['configured', 'enabled', 'fromEmailConfigured']);
    assert.equal(safeEmailErrorEvidence('SMTP_DISABLED').message, 'Email delivery is disabled or not configured.');
  });
});
