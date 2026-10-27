import assert from 'node:assert/strict';
import { rootCertificates } from 'node:tls';
import { describe, it } from 'node:test';
import {
  loadQaSmtpCaptureRuntime,
  QA_SMTP_CAPTURE_ADDRESS,
  QA_SMTP_CAPTURE_HOSTNAME,
  QA_SMTP_CAPTURE_PORT,
} from './smtp-qa-capture-runtime';

const caPath = 'C:\\protected\\qa-ca.pem';
const validCa = Buffer.from(rootCertificates[0]);
const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:55432/esta_qa_p13b2a_20261023_131805',
  SMTP_QA_CAPTURE_ENABLED: true,
  SMTP_QA_CAPTURE_TRUSTED_CA_PATH: caPath,
  NODE_EXTRA_CA_CERTS: caPath,
  SMTP_QA_CAPTURE_HOSTNAME: QA_SMTP_CAPTURE_HOSTNAME,
  SMTP_QA_CAPTURE_ADDRESS: QA_SMTP_CAPTURE_ADDRESS,
  SMTP_QA_CAPTURE_PORT: QA_SMTP_CAPTURE_PORT,
  SMTP_TEST_ALLOWED_HOSTS: QA_SMTP_CAPTURE_HOSTNAME,
  EMAIL_NOTIFICATIONS_ENABLED: false,
  SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED: false,
  SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED: false,
};

describe('QA SMTP capture trusted CA loader', () => {
  it('reads once, validates once, and retains an independent copy of the exact validated bytes', () => {
    let reads = 0;
    let parses = 0;
    const source = Buffer.from(validCa);
    const result = loadQaSmtpCaptureRuntime(valid, {
      stat: () => ({ isFile: () => true }),
      read: () => { reads += 1; return source; },
      parse: (bytes) => {
        parses += 1;
        assert.deepEqual(bytes, validCa);
        return { ca: true, validFrom: 'Jan 1 00:00:00 2020 GMT', validTo: 'Jan 1 00:00:00 2035 GMT' };
      },
      now: () => Date.parse('2026-10-26T00:00:00Z'),
    });
    assert.equal(result.error, null);
    assert.equal(reads, 1);
    assert.equal(parses, 1);
    assert.deepEqual(result.trustedCa, validCa);
    source.fill(0);
    assert.deepEqual(result.trustedCa, validCa, 'retained trust material must not alias the file-read buffer');
  });

  it('fails closed for missing, unreadable, empty, malformed, non-CA, expired, and not-yet-valid material', () => {
    const cases = [
      { stat: () => ({ isFile: () => false }) },
      { read: () => { throw new Error('unreadable'); } },
      { read: () => Buffer.alloc(0) },
      { parse: () => { throw new Error('malformed'); } },
      { parse: () => certificate(false, '2020', '2035') },
      { parse: () => certificate(true, '2020', '2025') },
      { parse: () => certificate(true, '2027', '2035') },
    ];
    for (const overrides of cases) {
      let reads = 0;
      const result = loadQaSmtpCaptureRuntime(valid, {
        stat: overrides.stat ?? (() => ({ isFile: () => true })),
        read: overrides.read ?? (() => { reads += 1; return validCa; }),
        parse: overrides.parse ?? (() => certificate(true, '2020', '2035')),
        now: () => Date.parse('2026-10-26T00:00:00Z'),
      });
      assert.equal(result.error, 'QA_CAPTURE_CA_INVALID');
      assert.equal(result.trustedCa, null);
      assert.ok(reads <= 1);
    }
  });

  it('rejects QA trust outside the fully fenced non-production runtime before loading the CA', () => {
    for (const change of [
      { NODE_ENV: 'production' },
      { DATABASE_URL: 'postgresql://qa:secret@127.0.0.1:5432/esta_workforce' },
      { SMTP_QA_CAPTURE_HOSTNAME: 'mail.example.test' },
      { SMTP_QA_CAPTURE_ADDRESS: '10.0.0.1' },
      { SMTP_QA_CAPTURE_PORT: 465 },
      { SMTP_TEST_ALLOWED_HOSTS: 'mail.example.test' },
      { EMAIL_NOTIFICATIONS_ENABLED: true },
    ]) {
      let reads = 0;
      const result = loadQaSmtpCaptureRuntime({ ...valid, ...change }, {
        stat: () => ({ isFile: () => true }),
        read: () => { reads += 1; return validCa; },
        parse: () => certificate(true, '2020', '2035'),
        now: () => Date.parse('2026-10-26T00:00:00Z'),
      });
      assert.notEqual(result.error, null);
      assert.equal(reads, 0);
    }
  });
});

function certificate(ca: boolean, fromYear: string, toYear: string) {
  return {
    ca,
    validFrom: `Jan 1 00:00:00 ${fromYear} GMT`,
    validTo: `Jan 1 00:00:00 ${toYear} GMT`,
  };
}
