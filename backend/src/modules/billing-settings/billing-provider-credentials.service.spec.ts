import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType, RoleName, UserStatus } from '@prisma/client';
import { BillingProviderCredentialsService } from './billing-provider-credentials.service';
import { ProviderRegistryService } from '../payments/providers/provider-registry.service';
import { RazorpayProvider } from '../payments/providers/razorpay.provider';

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
    findFirst: async ({ where }: { where: { id?: string; providerConfigurationId?: string; retiredAt?: unknown; webhookValidUntil?: { gt?: Date; gte?: Date } } }) => credentials.filter((value) =>
      (where.id === undefined || value.id === where.id) &&
      (where.providerConfigurationId === undefined || value.providerConfigurationId === where.providerConfigurationId) &&
      (where.retiredAt === undefined || (where.retiredAt === null ? value.retiredAt === null : value.retiredAt instanceof Date)) &&
      (!where.webhookValidUntil?.gt || value.webhookValidUntil instanceof Date && value.webhookValidUntil > where.webhookValidUntil.gt) &&
      (!where.webhookValidUntil?.gte || value.webhookValidUntil instanceof Date && value.webhookValidUntil >= where.webhookValidUntil.gte)
    ).sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null,
    findMany: async ({ where, take }: { where: { providerConfigurationId: string }; take: number }) => credentials.filter((value) => value.providerConfigurationId === where.providerConfigurationId && (value.retiredAt === null || value.webhookValidUntil instanceof Date && value.webhookValidUntil >= new Date())).sort((a, b) => valueCurrentFirst(a, b)).slice(0, take),
    create: async ({ data }: { data: Record<string, unknown> }) => { events.push('create'); const value = { ...data, id: `credential-${String(data.version)}`, createdAt: new Date(), retiredAt: null }; credentials.push(value); return value; },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { events.push('retire'); const value = credentials.find((item) => item.id === where.id)!; Object.assign(value, data); return value; },
  };
  const tx = {
    $queryRaw: async () => { events.push('lock'); return [{ id: config.id }]; },
    billingProviderConfiguration: { findUnique: async ({ where }: { where: { id: string } }) => where.id === config.id ? config : null }, billingProviderCredential: credentialStore,
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    billingProviderConfiguration: { findUnique: async ({ where }: { where: { id: string } }) => where.id === config.id ? config : null }, billingProviderCredential: credentialStore,
    auditLog: tx.auditLog,
  };
  const registry = new ProviderRegistryService(); registry.register(new RazorpayProvider());
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
    assert.equal(h.credentials[1].version, 2); assert.ok(h.credentials[0].retiredAt instanceof Date); assert.ok(h.credentials[0].webhookValidUntil instanceof Date);
    assert.equal((h.credentials[0].webhookValidUntil as Date).getTime() - (h.credentials[0].retiredAt as Date).getTime(), 25 * 60 * 60 * 1000);
    assert.equal(h.audits[1].action, 'BILLING_PROVIDER_CREDENTIAL_ROTATED');
    assert.deepEqual(h.events, ['lock', 'create', 'lock', 'retire', 'create']);
  });

  it('bounds webhook rotation to current plus one grace-valid predecessor', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor); await h.service.configure(configuration.id, { ...material, webhookSecret: 'rotated-webhook-secret' }, actor);
    const candidates = await h.service.resolveWebhookCandidates(configuration.id, configuration.provider);
    assert.deepEqual(candidates.map((value) => value.credentialVersion), [2, 1]);
    await assert.rejects(() => h.service.configure(configuration.id, { ...material, webhookSecret: 'third-secret' }, actor), ConflictException);
  });

  it('orders current before predecessor and rejects expired or cross-configuration webhook candidates', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor); await h.service.configure(configuration.id, { ...material, webhookSecret: 'rotated-webhook-secret' }, actor);
    assert.deepEqual((await h.service.resolveWebhookCandidates(configuration.id, configuration.provider)).map((value) => value.credentialVersion), [2, 1]);
    h.credentials[0].webhookValidUntil = new Date(Date.now() - 1);
    assert.deepEqual((await h.service.resolveWebhookCandidates(configuration.id, configuration.provider)).map((value) => value.credentialVersion), [2]);
    await assert.rejects(() => h.service.resolveWebhookCandidates('00000000-0000-4000-8000-000000000099', configuration.provider));
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

  it('resolves an exact retired credential for authorized historical recovery', async () => {
    const h = harness();
    await h.service.configure(configuration.id, material, actor);
    await h.service.configure(configuration.id, { ...material, keySecret: 'rotated-secret' }, actor);
    const resolved = await h.service.resolveBoundCredentialForRecovery(
      configuration.id, 'credential-1', configuration.provider, configuration.mode,
    );
    assert.equal(resolved.credentialVersion, 1);
    assert.equal(resolved.credentialVersionId, 'credential-1');
    assert.equal(resolved.material.keySecret, material.keySecret);
    assert.ok(h.credentials[0].retiredAt instanceof Date);
  });

  it('keeps current resolution effective-only while historical resolution is exact', async () => {
    const h = harness();
    await h.service.configure(configuration.id, material, actor);
    await h.service.configure(configuration.id, { ...material, keySecret: 'rotated-secret' }, actor);
    assert.equal((await h.service.resolveForOperation(configuration.id, configuration.provider, configuration.mode)).credentialVersion, 2);
    assert.equal((await h.service.resolveBoundCredentialForRecovery(configuration.id, 'credential-1', configuration.provider, configuration.mode)).credentialVersion, 1);
  });

  it('rejects cross-configuration, unknown, provider, and mode mismatches for historical resolution', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor);
    await assert.rejects(() => h.service.resolveBoundCredentialForRecovery('00000000-0000-4000-8000-000000000099', 'credential-1', configuration.provider, configuration.mode), ConflictException);
    await assert.rejects(() => h.service.resolveBoundCredentialForRecovery(configuration.id, 'credential-99', configuration.provider, configuration.mode), ConflictException);
    await assert.rejects(() => h.service.resolveBoundCredentialForRecovery(configuration.id, 'credential-1', 'FUTURE_PROVIDER' as PaymentProviderType, configuration.mode), ConflictException);
    await assert.rejects(() => h.service.resolveBoundCredentialForRecovery(configuration.id, 'credential-1', configuration.provider, PaymentProviderMode.LIVE), ConflictException);
  });

  it('fails closed for historical decryption/key-version failure and still validates through the adapter', async () => {
    const h = harness(); await h.service.configure(configuration.id, material, actor);
    h.encryption.decrypt = () => { throw new ServiceUnavailableException('Payment credential decryption failed'); };
    await assert.rejects(
      () => h.service.resolveBoundCredentialForRecovery(configuration.id, 'credential-1', configuration.provider, configuration.mode),
      /Payment credential decryption failed/,
    );
    h.encryption.decrypt = () => ({ ...material, keyId: 'rzp_live_invalid' });
    await assert.rejects(
      () => h.service.resolveBoundCredentialForRecovery(configuration.id, 'credential-1', configuration.provider, configuration.mode),
      BadRequestException,
    );
  });
});

function valueCurrentFirst(a: Record<string, unknown>, b: Record<string, unknown>): number {
  if (a.retiredAt === null && b.retiredAt !== null) return -1;
  if (a.retiredAt !== null && b.retiredAt === null) return 1;
  return Number(b.version) - Number(a.version);
}
