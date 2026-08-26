import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import type { ProviderCredentialMaterial } from '../../billing-settings/provider-credential.types';
import type { PaymentProvider } from './payment-provider.interface';

export interface SecurePaymentProvider extends PaymentProvider {
  validateCredentials(mode: PaymentProviderMode, material: ProviderCredentialMaterial): ProviderCredentialMaterial;
  testConnection(material: ProviderCredentialMaterial): Promise<{ success: boolean; category: string }>;
}

@Injectable()
export class ProviderRegistryService {
  private readonly providers = new Map<PaymentProviderType, SecurePaymentProvider>();

  register(provider: SecurePaymentProvider): void {
    if (this.providers.has(provider.type)) throw new Error(`Payment provider ${provider.type} is already registered`);
    this.providers.set(provider.type, provider);
  }

  resolve(type: PaymentProviderType): SecurePaymentProvider {
    const provider = this.providers.get(type);
    if (!provider) throw new ServiceUnavailableException('Payment provider adapter is unavailable');
    return provider;
  }

  normalizeCredentialInput(type: PaymentProviderType, mode: PaymentProviderMode, material: ProviderCredentialMaterial): ProviderCredentialMaterial {
    try {
      return this.resolve(type).validateCredentials(mode, material);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadRequestException('Payment provider credentials are invalid');
    }
  }
}
