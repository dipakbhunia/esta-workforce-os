import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SmtpSecurityMode } from '@prisma/client';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SmtpConnectionTestAdapter, SmtpDeliveryAttemptError } from './smtp-connection-test.adapter';

const snapshot = { host: 'smtp.example.com', port: 587, securityMode: SmtpSecurityMode.STARTTLS, username: 'mailer' };

class Adapter extends SmtpConnectionTestAdapter {
  options?: SMTPTransport.Options; closed = false; sent = false; message?: Record<string, unknown>;
  constructor(private readonly outcome: unknown = true, private readonly sendOutcome: unknown = true) { super({ approve: async () => ({ hostname: 'smtp.example.com', address: '8.8.8.8', family: 4 }) } as never); }
  protected override createTransport(options: SMTPTransport.Options) {
    this.options = options;
    return { verify: async () => { if (this.outcome instanceof Error) throw this.outcome; return true; },
      close: () => { this.closed = true; }, sendMail: async (message: Record<string, unknown>) => {
        this.sent = true; this.message = message;
        if (this.sendOutcome instanceof Error) throw this.sendOutcome;
        return { accepted: ['admin@example.test'], rejected: [] };
      } } as never;
  }
}

describe('SmtpConnectionTestAdapter', () => {
  it('requires STARTTLS, pins a validated address, preserves TLS hostname verification, and never sends email', async () => {
    const adapter = new Adapter();
    assert.deepEqual(await adapter.verify(snapshot, 'secret-password'), { success: true, category: 'SUCCESS' });
    assert.equal(adapter.options?.secure, false); assert.equal(adapter.options?.requireTLS, true);
    assert.equal(adapter.options?.ignoreTLS, false); assert.equal(adapter.options?.tls?.servername, snapshot.host);
    assert.equal(adapter.options?.tls?.rejectUnauthorized, true); assert.equal(typeof adapter.options?.getSocket, 'function');
    assert.equal(adapter.sent, false); assert.equal(adapter.closed, true);
  });

  it('requires implicit TLS on 465 and returns only bounded failure categories', async () => {
    const implicit = new Adapter();
    await implicit.verify({ ...snapshot, port: 465, securityMode: SmtpSecurityMode.IMPLICIT_TLS }, 'secret');
    assert.equal(implicit.options?.secure, true); assert.equal(implicit.options?.requireTLS, false);
    for (const [error, category] of [[Object.assign(new Error('secret'), { code: 'EAUTH' }), 'AUTH_FAILED'],
      [Object.assign(new Error('secret'), { code: 'CERT_HAS_EXPIRED' }), 'TLS_FAILED'],
      [Object.assign(new Error('secret'), { code: 'ETIMEDOUT' }), 'TIMEOUT'],
      [Object.assign(new Error('secret'), { code: 'ECONNREFUSED' }), 'CONNECTION_FAILED']] as const) {
      const adapter = new Adapter(error); const result = await adapter.verify(snapshot, 'password-do-not-expose');
      assert.equal(result.category, category); assert.equal(JSON.stringify(result).includes('secret'), false); assert.equal(adapter.closed, true);
    }
  });

  it('sends only the supplied fixed envelope with the same pinned TLS controls and reports provider acceptance', async () => {
    const adapter = new Adapter();
    const result = await adapter.sendTestEmail(snapshot, 'secret-password', {
      recipient: 'admin@example.test', senderEmail: 'sender@example.test', senderDisplayName: 'Sender',
      subject: 'Fixed test', text: 'Fixed plain text',
    });
    assert.deepEqual(result, { accepted: true, category: 'ACCEPTED' });
    assert.deepEqual(adapter.message, {
      from: { name: 'Sender', address: 'sender@example.test' }, to: 'admin@example.test',
      subject: 'Fixed test', text: 'Fixed plain text',
    });
    assert.equal(adapter.options?.requireTLS, true); assert.equal(adapter.options?.ignoreTLS, false);
    assert.equal(adapter.options?.tls?.rejectUnauthorized, true); assert.equal(adapter.closed, true);
  });

  it('classifies only structured definitive non-acceptance as retry-safe', async () => {
    const message = { recipient: 'admin@example.test', senderEmail: 'sender@example.test', senderDisplayName: 'Sender',
      subject: 'Verification', text: 'Text', html: '<p>Text</p>' };
    for (const error of [
      Object.assign(new Error('rejected'), { responseCode: 550, command: 'DATA' }),
      Object.assign(new Error('authentication failed'), { code: 'EAUTH' }),
      Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
    ]) {
      await assert.rejects(() => new Adapter(true, error).sendEmail(snapshot, 'secret', message),
        (caught: unknown) => caught instanceof SmtpDeliveryAttemptError && caught.definitivelyNotAccepted);
    }
    for (const error of [
      new Error('provider accepted but response was lost'),
      Object.assign(new Error('reset after DATA'), { code: 'ECONNRESET', command: 'DATA' }),
      Object.assign(new Error('generic timeout'), { code: 'ETIMEDOUT' }),
    ]) {
      await assert.rejects(() => new Adapter(true, error).sendEmail(snapshot, 'secret', message),
        (caught: unknown) => caught instanceof SmtpDeliveryAttemptError && !caught.definitivelyNotAccepted);
    }
  });
});
