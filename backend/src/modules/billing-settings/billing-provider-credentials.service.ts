import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ProviderRegistryService } from '../payments/providers/provider-registry.service';
import { CredentialEncryptionService } from './credential-encryption.service';
import type { EffectiveProviderCredential, ProviderCredentialMaterial, ProviderCredentialMetadata } from './provider-credential.types';

const WEBHOOK_GRACE_MS = 25 * 60 * 60 * 1000;

@Injectable()
export class BillingProviderCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CredentialEncryptionService,
    private readonly registry: ProviderRegistryService,
  ) {}

  async configure(configurationId: string, material: ProviderCredentialMaterial, actor: AuthenticatedUser): Promise<ProviderCredentialMetadata> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockConfiguration(tx, configurationId);
      const configuration = await tx.billingProviderConfiguration.findUnique({ where: { id: configurationId } });
      if (!configuration) throw new NotFoundException('Payment provider configuration not found');
      const normalized = this.registry.normalizeCredentialInput(configuration.provider, configuration.mode, material);
      const current = await tx.billingProviderCredential.findFirst({
        where: { providerConfigurationId: configurationId, retiredAt: null },
        orderBy: { version: 'desc' },
      });
      const latest = await tx.billingProviderCredential.findFirst({
        where: { providerConfigurationId: configurationId }, orderBy: { version: 'desc' }, select: { version: true },
      });
      const now = new Date();
      const graceCredential = await tx.billingProviderCredential.findFirst({
        where: { providerConfigurationId: configurationId, retiredAt: { not: null }, webhookValidUntil: { gt: now } },
        orderBy: { version: 'desc' }, select: { id: true },
      });
      if (current && graceCredential) throw new ConflictException('Payment provider credential rotation is temporarily unavailable');
      if (current) await tx.billingProviderCredential.update({ where: { id: current.id }, data: { retiredAt: now, webhookValidUntil: new Date(now.getTime() + WEBHOOK_GRACE_MS) } });
      const fingerprint = this.encryption.fingerprint(configuration.provider, configuration.mode, normalized);
      const created = await tx.billingProviderCredential.create({
        data: {
          providerConfigurationId: configurationId,
          version: (latest?.version ?? 0) + 1,
          encryptedPayload: this.encryption.encrypt(normalized),
          encryptionKeyVersion: this.encryption.encryptionKeyVersion(),
          credentialFingerprint: fingerprint,
          createdByUserId: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: current ? 'BILLING_PROVIDER_CREDENTIAL_ROTATED' : 'BILLING_PROVIDER_CREDENTIAL_CONFIGURED',
          entityType: 'BillingProviderConfiguration', entityId: configurationId,
          metadata: { provider: configuration.provider, mode: configuration.mode, credentialVersion: created.version, fingerprint: this.safeFingerprint(fingerprint) },
        },
      });
      return this.metadata(created);
    });
  }

  async metadataFor(configurationId: string): Promise<ProviderCredentialMetadata> {
    const credential = await this.prisma.billingProviderCredential.findFirst({
      where: { providerConfigurationId: configurationId, retiredAt: null }, orderBy: { version: 'desc' },
    });
    return credential ? this.metadata(credential) : this.emptyMetadata();
  }

  async resolveForOperation(configurationId: string, expectedProvider: PaymentProviderType, expectedMode: PaymentProviderMode): Promise<EffectiveProviderCredential> {
    const configuration = await this.prisma.billingProviderConfiguration.findUnique({ where: { id: configurationId } });
    if (!configuration || !configuration.enabled) throw new ConflictException('Payment provider configuration is not eligible');
    if (configuration.provider !== expectedProvider || configuration.mode !== expectedMode) throw new ConflictException('Payment provider configuration mismatch');
    const credential = await this.prisma.billingProviderCredential.findFirst({
      where: { providerConfigurationId: configurationId, retiredAt: null }, orderBy: { version: 'desc' },
    });
    if (!credential) throw new ConflictException('Effective payment provider credential is unavailable');
    const material = this.encryption.decrypt(credential.encryptedPayload, credential.encryptionKeyVersion);
    const normalized = this.registry.normalizeCredentialInput(configuration.provider, configuration.mode, material);
    return { providerConfigurationId: configuration.id, provider: configuration.provider, mode: configuration.mode, credentialVersionId: credential.id, credentialVersion: credential.version, material: normalized };
  }

  async resolveBoundCredentialForRecovery(
    configurationId: string,
    credentialVersionId: string,
    expectedProvider: PaymentProviderType,
    expectedMode: PaymentProviderMode,
  ): Promise<EffectiveProviderCredential> {
    const configuration = await this.prisma.billingProviderConfiguration.findUnique({ where: { id: configurationId } });
    if (!configuration) throw new ConflictException('Payment provider configuration is unavailable');
    if (configuration.provider !== expectedProvider || configuration.mode !== expectedMode) {
      throw new ConflictException('Payment provider configuration mismatch');
    }
    const credential = await this.prisma.billingProviderCredential.findFirst({
      where: { id: credentialVersionId, providerConfigurationId: configurationId },
    });
    if (!credential) throw new ConflictException('Bound payment provider credential is unavailable');
    const material = this.encryption.decrypt(credential.encryptedPayload, credential.encryptionKeyVersion);
    const normalized = this.registry.normalizeCredentialInput(configuration.provider, configuration.mode, material);
    return {
      providerConfigurationId: configuration.id,
      provider: configuration.provider,
      mode: configuration.mode,
      credentialVersionId: credential.id,
      credentialVersion: credential.version,
      material: normalized,
    };
  }

  async resolveWebhookCandidates(configurationId: string, expectedProvider: PaymentProviderType): Promise<EffectiveProviderCredential[]> {
    const configuration = await this.prisma.billingProviderConfiguration.findUnique({ where: { id: configurationId } });
    if (!configuration || configuration.provider !== expectedProvider) throw new NotFoundException('Payment provider webhook is unavailable');
    const now = new Date();
    const [current, previous] = await Promise.all([
      this.prisma.billingProviderCredential.findFirst({ where: { providerConfigurationId: configurationId, retiredAt: null }, orderBy: { version: 'desc' } }),
      this.prisma.billingProviderCredential.findFirst({ where: { providerConfigurationId: configurationId, retiredAt: { not: null }, webhookValidUntil: { gte: now } }, orderBy: { version: 'desc' } }),
    ]);
    const rows = [current, previous].filter((value): value is NonNullable<typeof value> => value !== null);
    if (!rows.length) throw new ConflictException('Payment provider webhook is unavailable');
    const resolve = (credential: NonNullable<typeof current>): EffectiveProviderCredential => {
      const material = this.encryption.decrypt(credential.encryptedPayload, credential.encryptionKeyVersion);
      return {
        providerConfigurationId: configuration.id, provider: configuration.provider, mode: configuration.mode,
        credentialVersionId: credential.id, credentialVersion: credential.version,
        material: this.registry.normalizeCredentialInput(configuration.provider, configuration.mode, material),
      };
    };
    const result: EffectiveProviderCredential[] = [];
    if (current) result.push(resolve(current));
    if (previous) {
      try { result.push(resolve(previous)); }
      catch (error) { if (!current) throw error; }
    }
    return result;
  }

  async validateForEnable(configurationId: string, expectedProvider: PaymentProviderType, expectedMode: PaymentProviderMode): Promise<void> {
    const credential = await this.prisma.billingProviderCredential.findFirst({ where: { providerConfigurationId: configurationId, retiredAt: null }, orderBy: { version: 'desc' } });
    if (!credential) throw new ConflictException('Effective payment provider credential is unavailable');
    const material = this.encryption.decrypt(credential.encryptedPayload, credential.encryptionKeyVersion);
    this.registry.normalizeCredentialInput(expectedProvider, expectedMode, material);
  }

  async testConnection(configurationId: string, actor: AuthenticatedUser) {
    const configuration = await this.prisma.billingProviderConfiguration.findUnique({ where: { id: configurationId } });
    if (!configuration) throw new NotFoundException('Payment provider configuration not found');
    try {
      const resolved = await this.resolveForStructuralValidation(configuration);
      const result = await this.registry.resolve(configuration.provider).testConnection(resolved.material);
      await this.auditConnection(actor.id, configuration, resolved.credentialVersion, result.success, result.category);
      return {
        provider: configuration.provider,
        mode: configuration.mode,
        credentialVersion: resolved.credentialVersion,
        ...result,
        validationType: 'STRUCTURAL' as const,
        networkConnectivityTested: false,
      };
    } catch {
      await this.auditConnection(actor.id, configuration, null, false, 'PROVIDER_VALIDATION_FAILED');
      throw new ServiceUnavailableException('Payment provider connection test failed');
    }
  }

  private async resolveForStructuralValidation(configuration: { id: string; provider: PaymentProviderType; mode: PaymentProviderMode }): Promise<EffectiveProviderCredential> {
    const credential = await this.prisma.billingProviderCredential.findFirst({
      where: { providerConfigurationId: configuration.id, retiredAt: null }, orderBy: { version: 'desc' },
    });
    if (!credential) throw new ConflictException('Effective payment provider credential is unavailable');
    const material = this.encryption.decrypt(credential.encryptedPayload, credential.encryptionKeyVersion);
    const normalized = this.registry.normalizeCredentialInput(configuration.provider, configuration.mode, material);
    return { providerConfigurationId: configuration.id, provider: configuration.provider, mode: configuration.mode, credentialVersionId: credential.id, credentialVersion: credential.version, material: normalized };
  }

  private auditConnection(actorUserId: string, configuration: { id: string; provider: PaymentProviderType; mode: PaymentProviderMode }, credentialVersion: number | null, success: boolean, category: string) {
    return this.prisma.auditLog.create({ data: { actorUserId, action: 'BILLING_PROVIDER_CONNECTION_TESTED', entityType: 'BillingProviderConfiguration', entityId: configuration.id, metadata: { provider: configuration.provider, mode: configuration.mode, credentialVersion, success, category } } });
  }

  private async lockConfiguration(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "BillingProviderConfiguration" WHERE "id" = ${id}::uuid FOR UPDATE`);
    if (!rows.length) throw new NotFoundException('Payment provider configuration not found');
  }

  private metadata(value: { version: number; createdAt: Date; credentialFingerprint: string }): ProviderCredentialMetadata {
    return { credentialsConfigured: true, credentialVersion: value.version, credentialUpdatedAt: value.createdAt, credentialFingerprint: this.safeFingerprint(value.credentialFingerprint) };
  }
  private emptyMetadata(): ProviderCredentialMetadata { return { credentialsConfigured: false, credentialVersion: null, credentialUpdatedAt: null, credentialFingerprint: null }; }
  private safeFingerprint(value: string): string { return value.slice(-12); }
}
