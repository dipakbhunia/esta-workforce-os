import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { SmtpSecurityMode } from '@prisma/client';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SmtpConnectionTestAdapter } from '../platform-communication/smtp-connection-test.adapter';
import { SmtpDestinationPolicyService } from '../platform-communication/smtp-destination-policy.service';
import { QaSmtpCaptureDestinationPolicyService } from '../platform-communication/smtp-qa-capture-destination-policy.service';
import { createSmtpDestinationPolicy } from './smtp-destination-policy.provider';

const withQaConfig = async (run: (config: ConfigService) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), 'esta-qa-smtp-provider-'));
  const caPath = join(directory, 'qa-ca.pem');
  writeFileSync(caPath, rootCertificates[0], { encoding: 'utf8', mode: 0o600 });
  const values: Record<string, unknown> = {
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:55432/esta_qa_p13b2a_20261023_131805',
    SMTP_QA_CAPTURE_ENABLED: true, SMTP_QA_CAPTURE_TRUSTED_CA_PATH: caPath, NODE_EXTRA_CA_CERTS: caPath,
    SMTP_QA_CAPTURE_HOSTNAME: 'smtp-capture.qa.invalid', SMTP_QA_CAPTURE_ADDRESS: '127.0.0.1',
    SMTP_QA_CAPTURE_PORT: 587,
    SMTP_TEST_ALLOWED_HOSTS: 'smtp-capture.qa.invalid', EMAIL_NOTIFICATIONS_ENABLED: false,
    SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED: false, SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: false,
  };
  try { await run({ get: (key: string) => values[key] } as ConfigService); }
  finally { rmSync(directory, { recursive: true, force: true }); }
};

class RecordingAdapter extends SmtpConnectionTestAdapter {
  options?: SMTPTransport.Options;
  transportCreations = 0;
  sends = 0;
  protected override createTransport(options: SMTPTransport.Options) {
    this.transportCreations += 1;
    this.options = options;
    return { verify: async () => true, close: () => undefined, sendMail: async () => {
      this.sends += 1;
      return { messageId: 'captured-locally' };
    } } as never;
  }
}

describe('SMTP destination-policy provider', () => {
  it('selects the unchanged production policy by default', () => {
    const policy = createSmtpDestinationPolicy({ get: () => undefined } as never);
    assert.ok(policy instanceof SmtpDestinationPolicyService);
    assert.equal(policy instanceof QaSmtpCaptureDestinationPolicyService, false);
  });

  it('selects the QA boundary only for the fully fenced runtime', async () => withQaConfig(async (config) => {
    const policy = createSmtpDestinationPolicy(config);
    assert.ok(policy instanceof QaSmtpCaptureDestinationPolicyService);
    const approved = await policy.approve('SMTP-CAPTURE.QA.INVALID.', 587, SmtpSecurityMode.STARTTLS);
    assert.deepEqual({ ...approved, trustedCa: undefined }, {
      hostname: 'smtp-capture.qa.invalid', address: '127.0.0.1', family: 4, trustedCa: undefined,
    });
    assert.ok(Buffer.isBuffer(approved.trustedCa));
    await assert.rejects(() => policy.approve('mail.estaproject.com', 587, SmtpSecurityMode.STARTTLS));
  }));

  it('uses the validated in-memory CA after the source file is replaced without a second read', async () => withQaConfig(async (config) => {
    const policy = createSmtpDestinationPolicy(config);
    const path = String(config.get('SMTP_QA_CAPTURE_TRUSTED_CA_PATH'));
    const original = await policy.approve('smtp-capture.qa.invalid', 587, SmtpSecurityMode.STARTTLS);
    assert.ok(Buffer.isBuffer(original.trustedCa));
    const validatedBytes = Buffer.from(original.trustedCa!);
    writeFileSync(path, 'replacement that is not a certificate', 'utf8');

    const adapter = new RecordingAdapter(policy);
    const result = await adapter.verify({ host: 'smtp-capture.qa.invalid', port: 587,
      securityMode: SmtpSecurityMode.STARTTLS, username: 'qa-capture' }, 'qa-only-password');
    assert.deepEqual(result, { success: true, category: 'SUCCESS' });
    assert.deepEqual(adapter.options?.tls?.ca, validatedBytes);
    assert.notEqual(Buffer.from(adapter.options?.tls?.ca as Buffer).toString('utf8'),
      'replacement that is not a certificate');
    assert.equal(adapter.options?.tls?.minVersion, 'TLSv1.2');
    assert.equal(adapter.options?.tls?.rejectUnauthorized, true);
    assert.equal(adapter.options?.tls?.servername, 'smtp-capture.qa.invalid');
  }));

  it('constrains both verify and delivery to authenticated STARTTLS through the same policy', async () => withQaConfig(async (config) => {
    const adapter = new RecordingAdapter(createSmtpDestinationPolicy(config));
    const snapshot = { host: 'smtp-capture.qa.invalid', port: 587,
      securityMode: SmtpSecurityMode.STARTTLS, username: 'qa-capture' };
    assert.deepEqual(await adapter.verify(snapshot, 'qa-only-password'), { success: true, category: 'SUCCESS' });
    assert.equal(adapter.options?.requireTLS, true);
    assert.equal(adapter.options?.ignoreTLS, false);
    assert.equal(adapter.options?.tls?.rejectUnauthorized, true);
    assert.equal(adapter.options?.tls?.servername, 'smtp-capture.qa.invalid');
    assert.ok(Buffer.isBuffer(adapter.options?.tls?.ca));
    assert.deepEqual(adapter.options?.auth, { user: 'qa-capture', pass: 'qa-only-password' });
    assert.equal((await adapter.sendEmail(snapshot, 'qa-only-password', {
      recipient: 'target@example.invalid', senderEmail: 'sender@example.invalid', senderDisplayName: 'QA',
      subject: 'Synthetic invitation', text: 'Synthetic', html: '<p>Synthetic</p>',
    })).messageId, 'captured-locally');
    assert.equal(adapter.sends, 1);
    const rejected = { ...snapshot, host: 'mail.estaproject.com' };
    assert.equal((await adapter.verify(rejected, 'qa-only-password')).category, 'DNS_REJECTED');
    await assert.rejects(() => adapter.sendEmail(rejected, 'qa-only-password', {
      recipient: 'target@example.invalid', senderEmail: 'sender@example.invalid', senderDisplayName: 'QA',
      subject: 'Blocked', text: 'Blocked', html: '<p>Blocked</p>',
    }));
  }));

  it('rejects every non-approved endpoint before transport creation for verify and delivery', async () => withQaConfig(async (config) => {
    const adapter = new RecordingAdapter(createSmtpDestinationPolicy(config));
    const approved = { host: 'smtp-capture.qa.invalid', port: 587,
      securityMode: SmtpSecurityMode.STARTTLS, username: 'qa-capture' };
    const rejected = [
      { ...approved, port: 465 },
      { ...approved, port: 2525 },
      { ...approved, port: Number.NaN },
      { ...approved, securityMode: SmtpSecurityMode.IMPLICIT_TLS },
      { ...approved, securityMode: undefined as unknown as SmtpSecurityMode },
      { ...approved, host: 'mail.estaproject.com' },
    ];
    for (const snapshot of rejected) {
      assert.equal((await adapter.verify(snapshot, 'qa-only-password')).category, 'DNS_REJECTED');
      await assert.rejects(() => adapter.sendEmail(snapshot, 'qa-only-password', {
        recipient: 'target@example.invalid', senderEmail: 'sender@example.invalid', senderDisplayName: 'QA',
        subject: 'Blocked', text: 'Blocked', html: '<p>Blocked</p>',
      }));
    }
    assert.equal(adapter.transportCreations, 0);
    assert.equal(adapter.sends, 0);
    assert.equal(adapter.options, undefined);
  }));
});
