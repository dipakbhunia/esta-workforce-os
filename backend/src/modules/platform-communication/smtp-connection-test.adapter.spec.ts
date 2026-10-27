import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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

type NegativeAdapterOptions = {
  approveError?: Error;
  createError?: Error;
  sendError?: Error;
  accepted?: string[];
  rejected?: string[];
  hang?: boolean;
};

class NegativeAdapter extends SmtpConnectionTestAdapter {
  transportCreations = 0;
  closeCount = 0;
  sendCount = 0;

  constructor(private readonly behavior: NegativeAdapterOptions = {}) {
    super({
      approve: async () => {
        if (behavior.approveError) throw behavior.approveError;
        return { hostname: 'smtp.example.com', address: '8.8.8.8', family: 4 };
      },
    } as never);
  }

  protected override createTransport(_options: SMTPTransport.Options) {
    this.transportCreations += 1;
    if (this.behavior.createError) throw this.behavior.createError;
    return {
      verify: async () => true,
      close: () => { this.closeCount += 1; },
      sendMail: async () => {
        this.sendCount += 1;
        if (this.behavior.hang) return new Promise(() => undefined);
        if (this.behavior.sendError) throw this.behavior.sendError;
        return {
          accepted: this.behavior.accepted ?? ['admin@example.test'],
          rejected: this.behavior.rejected ?? [],
        };
      },
    } as never;
  }
}

const testMessage = {
  recipient: 'admin@example.test',
  senderEmail: 'sender@example.test',
  senderDisplayName: 'Sender',
  subject: 'Fixed test',
  text: 'Fixed plain text',
};

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
    const result = await adapter.sendTestEmail(snapshot, 'secret-password', testMessage);
    assert.deepEqual(result, { accepted: true, category: 'ACCEPTED' });
    assert.deepEqual(adapter.message, {
      from: { name: 'Sender', address: 'sender@example.test' }, to: 'admin@example.test',
      subject: 'Fixed test', text: 'Fixed plain text',
    });
    assert.equal(adapter.options?.requireTLS, true); assert.equal(adapter.options?.ignoreTLS, false);
    assert.equal(adapter.options?.tls?.rejectUnauthorized, true); assert.equal(adapter.closed, true);
  });

  it('rejects a disallowed destination before creating a transport or exposing policy details', async () => {
    const adapter = new NegativeAdapter({
      approveError: new Error('SMTP destination rejected: private address 127.0.0.1 and credential secret-password'),
    });
    const result = await adapter.sendTestEmail(snapshot, 'secret-password', testMessage);
    assert.deepEqual(result, { accepted: false, category: 'DNS_REJECTED' });
    assert.equal(adapter.transportCreations, 0);
    assert.equal(adapter.sendCount, 0);
    assert.equal(adapter.closeCount, 0);
    assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|secret-password/);
  });

  it('sanitizes authentication, TLS, timeout, and unexpected send failures and closes exactly once', async () => {
    const cases = [
      { error: Object.assign(new Error('password=provider-secret'), { code: 'EAUTH' }), category: 'AUTH_FAILED' },
      { error: Object.assign(new Error('certificate hostname mismatch provider-secret'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), category: 'TLS_FAILED' },
      { error: Object.assign(new Error('certificate expired provider-secret'), { code: 'CERT_HAS_EXPIRED' }), category: 'TLS_FAILED' },
      { error: Object.assign(new Error('timed out with provider-secret'), { code: 'ETIMEDOUT' }), category: 'TIMEOUT' },
      { error: new Error('unexpected provider-secret transport failure'), category: 'UNKNOWN' },
    ] as const;
    for (const { error, category } of cases) {
      const adapter = new NegativeAdapter({ sendError: error });
      const result = await adapter.sendTestEmail(snapshot, 'secret-password', testMessage);
      assert.deepEqual(result, { accepted: false, category });
      assert.equal(adapter.transportCreations, 1);
      assert.equal(adapter.sendCount, 1);
      assert.equal(adapter.closeCount, 1);
      assert.doesNotMatch(JSON.stringify(result), /provider-secret|secret-password|password=/);
    }
  });

  it('bounds synchronous transport creation failures without attempting send or leaking credentials', async () => {
    const adapter = new NegativeAdapter({ createError: new Error('create failed with secret-password') });
    const result = await adapter.sendTestEmail(snapshot, 'secret-password', testMessage);
    assert.deepEqual(result, { accepted: false, category: 'UNKNOWN' });
    assert.equal(adapter.transportCreations, 1);
    assert.equal(adapter.sendCount, 0);
    assert.equal(adapter.closeCount, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret-password|create failed/);
  });

  it('does not claim success for rejected, empty, or unrelated accepted recipients', async () => {
    for (const behavior of [
      { accepted: [], rejected: ['admin@example.test'] },
      { accepted: [], rejected: [] },
      { accepted: ['other@example.test'], rejected: ['admin@example.test'] },
    ]) {
      const adapter = new NegativeAdapter(behavior);
      assert.deepEqual(await adapter.sendTestEmail(snapshot, 'secret-password', testMessage), {
        accepted: false,
        category: 'UNKNOWN',
      });
      assert.equal(adapter.closeCount, 1);
    }
  });

  it('accepts partial provider results only when the exact intended recipient was accepted', async () => {
    const accepted = new NegativeAdapter({
      accepted: ['other@example.test', ' ADMIN@EXAMPLE.TEST '],
      rejected: ['third@example.test'],
    });
    assert.deepEqual(await accepted.sendTestEmail(snapshot, 'secret-password', testMessage), {
      accepted: true,
      category: 'ACCEPTED',
    });
    assert.equal(accepted.closeCount, 1);
  });

  it('times out a non-settling SMTP send deterministically and closes the transport once', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const adapter = new NegativeAdapter({ hang: true });
      const pending = adapter.sendTestEmail(snapshot, 'secret-password', testMessage);
      await Promise.resolve();
      await Promise.resolve();
      mock.timers.tick(20_000);
      assert.deepEqual(await pending, { accepted: false, category: 'TIMEOUT' });
      assert.equal(adapter.sendCount, 1);
      assert.equal(adapter.closeCount, 1);
    } finally {
      mock.timers.reset();
    }
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
