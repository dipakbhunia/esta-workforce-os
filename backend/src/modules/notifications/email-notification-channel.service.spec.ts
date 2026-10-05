import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertSeverity, NotificationType } from '@prisma/client';
import {
  EmailNotificationChannel,
  renderEmailHtml,
  renderEmailText,
  safeEmailErrorEvidence,
} from './email-notification-channel.service';

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

  it('keeps plain text readable and escapes every hostile HTML value', () => {
    const notification = {
      type: NotificationType.ALERT_OPENED,
      title: `<script data-x="a&b">'title'</script>`,
      message: `<img src=x onerror="alert('x')"> & message`,
      severity: MonitoringAlertSeverity.CRITICAL,
      detailsPath: '/monitoring/alerts/11111111-1111-4111-8111-111111111111',
    };
    const text = renderEmailText(notification);
    const html = renderEmailHtml(notification);
    assert.match(text, /<script data-x="a&b">'title'<\/script>/);
    assert.doesNotMatch(html, /<script|<img|onerror="/);
    assert.match(html, /&lt;script data-x=&quot;a&amp;b&quot;&gt;&#39;title&#39;&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(&#39;x&#39;\)&quot;&gt; &amp; message/);
    assert.doesNotMatch(html, /&amp;lt;script/);
  });

  it('fails closed rather than rendering an unsafe persisted details path', () => {
    assert.throws(() => renderEmailHtml({
      type: NotificationType.ALERT_OPENED,
      title: 'Alert',
      message: 'Message',
      severity: MonitoringAlertSeverity.WARNING,
      detailsPath: 'https://example.test/steal',
    }));
  });

  it('preserves long legacy text while escaping only the HTML envelope', () => {
    const title = `<legacy>&'"${'t'.repeat(220)}`;
    const message = `<legacy-message>&'"${'m'.repeat(4_100)}`;
    const notification = {
      type: NotificationType.ALERT_OPENED,
      title,
      message,
      severity: MonitoringAlertSeverity.WARNING,
      detailsPath: '/monitoring/alerts/11111111-1111-4111-8111-111111111111',
    };
    const text = renderEmailText(notification);
    const html = renderEmailHtml(notification);
    assert.ok(text.includes(title));
    assert.ok(text.includes(message));
    assert.ok(html.includes(`&lt;legacy&gt;&amp;&#39;&quot;${'t'.repeat(220)}`));
    assert.ok(html.includes(`&lt;legacy-message&gt;&amp;&#39;&quot;${'m'.repeat(4_100)}`));
    assert.doesNotMatch(html, /<legacy(?:-message)?>/);
  });
});
