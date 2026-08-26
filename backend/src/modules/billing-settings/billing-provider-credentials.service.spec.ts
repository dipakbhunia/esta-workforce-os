import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType, RoleName, UserStatus } from '@prisma/client';
import { BillingProviderCredentialsService } from './billing-provider-credentials.service';
import { ProviderRegistryService } from '../payments/providers/provider-registry.service';
import { RazorpayPlaceholderProvider } from '../payments/providers/razorpay-placeholder.provider';

const configuration = { id: '00000000-0000-4000-8000-000000000010', provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, enabled: true };
const actor = { id: '00000000-0000-4000-8000-000000000001', companyId: null, email: 'admin@example.com', firstName: 'Super', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
const material = { keyId: 'rzp_test_public', keySecret: 'key-secret-value', webhookSecret: 'webhook-secret-value' };

function harness(config = configuration) {
  const credentials: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const events: string[] = [];
  const encryption = {
    encrypt: (value: object) => Uint8Array.from(Buffer.from(JSON.stringify(value))),
    decrypt: (value: Uint8Array) => JSON.parse(Buffer.from(value).toString('utf8')),
    fingerprint: () => 'a'.repeat(64), encryptionKeyVersion: () => 'key-v1',
  };
  const credentialStore = {
    findFirst: async ({ where }: { where: { retiredAt?: null } }) => credentials.filter((value) => where.retiredAt === null ? value.retiredAt === null : true).sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => { events.push('create'); const value = { ...data, id: `credential-${String(data.version)}`, createdAt: new Date(), retiredAt: null }; credentials.push(value); return value; },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { events.push('retire'); const value = credentials.find((item) => item.id === where.id)!; Object.assign(value, data); return value; },
  };
  const tx = {
    $queryRaw: async () => { events.push('lock'); return [{ id: config.id }]; },
    billingProviderConfiguration: { findUnique: async () => config }, billingProviderCredential: credentialStore,
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    billingProviderConfiguration: { findUnique: async () => config }, billingProviderCredential: credentialStore,
    auditLog: tx.auditLog,
  };
  const registry = new ProviderRegistryService(); registry.register(new RazorpayPlaceholderProvider());
  return { service: new BillingProviderCredentialsService(prisma as never, encryption as never, registry), credentials, audits, events, encryption };
}

describe('BillingProviderCredentialsService', () => {
  it('creates version 1, returns only redacted metadata, and audits no secrets', async () => {
    const h = harness(); const response = await h.service.configure(configuration.id, material, actor);
    assert.equal(response.credentialVersion, 1); assert.equal(response.credentialFingerprint, 'aaaaaaaaaaaa');
    assert.equal('encryptedPayload' in response, false); assert.equal(JSON.stringify(response).includes(material.keySecret), false);
    assert.equal(JSON.stringify(h.audits).includes(material.keySecret), false);
    assert.equal(h.audits[0].action, 'BILLING_PROVIDER_CREDENTIAL_CONFIGURED');
    assert.deepEqual(h.events.slice(0, 2), ['lock', 'create']);
  });

  it('rotates under the configuration lock, increments version, and retires the previous credential', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor); await h.service.configure(configuration.id, { ...material, keySecret: 'rotated-secret' }, actor);
    assert.equal(h.credentials.length, 2); assert.equal(h.credentials.filter((value) => value.retiredAt === null).length, 1);
    assert.equal(h.credentials[1].version, 2); assert.ok(h.credentials[0].retiredAt instanceof Date);
    assert.equal(h.audits[1].action, 'BILLING_PROVIDER_CREDENTIAL_ROTATED');
    assert.deepEqual(h.events, ['lock', 'create', 'lock', 'retire', 'create']);
  });

  it('enforces TEST/LIVE credential separation', async () => {
    await assert.rejects(() => harness().service.configure(configuration.id, { ...material, keyId: 'rzp_live_public' }, actor), BadRequestException);
    await assert.rejects(() => harness({ ...configuration, mode: PaymentProviderMode.LIVE }).service.configure(configuration.id, material, actor), BadRequestException);
  });

  it('rejects disabled configurations, mismatched snapshots, and missing effective credentials for operations', async () => {
    const disabled = harness({ ...configuration, enabled: false });
    await assert.rejects(() => disabled.service.resolveForOperation(configuration.id, configuration.provider, configuration.mode), ConflictException);
    const h = harness(); await h.service.configure(configuration.id, material, actor);
    await assert.rejects(() => h.service.resolveForOperation(configuration.id, configuration.provider, PaymentProviderMode.LIVE), ConflictException);
    h.credentials[0].retiredAt = new Date();
    await assert.rejects(() => h.service.resolveForOperation(configuration.id, configuration.provider, configuration.mode), ConflictException);
  });

  it('performs structural connection validation without a network call', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor);
    assert.deepEqual(await h.service.testConnection(configuration.id, actor), { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, credentialVersion: 1, success: true, category: 'STRUCTURAL_VALIDATION_ONLY', validationType: 'STRUCTURAL', networkConnectivityTested: false });
    assert.equal(h.audits.at(-1)?.action, 'BILLING_PROVIDER_CONNECTION_TESTED');
  });

  it('allows structural validation while disabled but still rejects real operations', async () => {
    const h = harness({ ...configuration, enabled: false });
    await h.service.configure(configuration.id, material, actor);
    assert.equal((await h.service.testConnection(configuration.id, actor)).networkConnectivityTested, false);
    await assert.rejects(() => h.service.resolveForOperation(configuration.id, configuration.provider, configuration.mode), ConflictException);
  });

  it('sanitizes connection failures and audits only a safe category', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor);
    h.encryption.decrypt = () => { throw new Error(material.keySecret); };
    await assert.rejects(() => h.service.testConnection(configuration.id, actor), /Payment provider connection test failed/);
    assert.equal(JSON.stringify(h.audits).includes(material.keySecret), false);
    assert.equal((h.audits.at(-1)?.metadata as { category: string }).category, 'PROVIDER_VALIDATION_FAILED');
  });
});
