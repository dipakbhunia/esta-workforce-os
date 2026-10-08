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

describe('EmailNotificationChannel identity authority', () => {
  const notification = {
    id: 'notification-1', userId: 'user-1', companyId: 'company-1',
    type: NotificationType.ACCOUNT_INVITATION, accountActionTokenId: 'token-1',
    title: 'Invitation', message: 'Message', severity: null, detailsPath: null,
  } as never;
  const token = {
    id: 'token-1', userId: 'user-1', companyId: 'company-1', purpose: 'INVITATION',
    expiresAt: new Date(Date.now() + 60_000), consumedAt: null, invalidatedAt: null,
    user: { id: 'user-1', companyId: 'company-1', email: 'owner@example.test', status: 'INACTIVE', deletedAt: null },
  };
  const persisted = { ...notification, deliveries: [{ id: 'delivery-1' }] };
  const channel = (tokenResult: unknown = token, notificationResult: unknown = persisted) => new EmailNotificationChannel(
    { get: (key: string) => key === 'IDENTITY_ACTION_TOKEN_SECRET' ? 'x'.repeat(32) : undefined, getOrThrow: (key: string) => key === 'PUBLIC_APP_ORIGIN' ? 'https://app.example.test' : 'x'.repeat(32) } as never,
    { accountActionToken: { findFirst: async () => tokenResult }, notification: { findUnique: async () => notificationResult } } as never,
  );

  it('accepts exact current authority and rejects recipient, owner, tenant, notification, purpose, and lifecycle mismatches', async () => {
    const invoke = (instance: EmailNotificationChannel, recipient = 'owner@example.test') => (instance as unknown as { withIdentityActionLink: (value: unknown, address: string) => Promise<unknown> }).withIdentityActionLink(notification, recipient);
    assert.match(JSON.stringify(await invoke(channel())), /activate-account/);
    assert.match(JSON.stringify(await invoke(channel())), /activate-account/);
    await assert.rejects(() => invoke(channel(), 'changed@example.test'), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, userId: 'user-2' })), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, companyId: 'company-2' })), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, purpose: 'PASSWORD_RESET' })), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, consumedAt: new Date() } as never)), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, invalidatedAt: new Date() } as never)), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, expiresAt: new Date(Date.now() - 60_000) } as never)), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, user: { ...token.user, companyId: 'company-2' } } as never)), /no longer eligible/i);
    await assert.rejects(() => invoke(channel({ ...token, user: { ...token.user, status: 'ACTIVE' } } as never)), /no longer eligible/i);
    await assert.rejects(() => invoke(channel(token, { ...persisted, userId: 'user-2' })), /no longer eligible/i);
    await assert.rejects(() => invoke(channel(token, { ...persisted, companyId: 'company-2' })), /no longer eligible/i);
    await assert.rejects(() => invoke(channel(token, { ...persisted, deliveries: [] })), /no longer eligible/i);
  });
});
