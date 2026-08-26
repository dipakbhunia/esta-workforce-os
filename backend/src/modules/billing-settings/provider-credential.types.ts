import type { PaymentProviderMode, PaymentProviderType } from '@prisma/client';

export type ProviderCredentialMaterial = Readonly<Record<string, string>>;

export interface ProviderCredentialMetadata {
  credentialsConfigured: boolean;
  credentialVersion: number | null;
  credentialUpdatedAt: Date | null;
  credentialFingerprint: string | null;
}

export interface EffectiveProviderCredential {
  providerConfigurationId: string;
  provider: PaymentProviderType;
  mode: PaymentProviderMode;
  credentialVersionId: string;
  credentialVersion: number;
  material: ProviderCredentialMaterial;
}
