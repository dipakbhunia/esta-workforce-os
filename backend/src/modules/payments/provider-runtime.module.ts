import { Module } from '@nestjs/common';
import { BillingProviderCredentialsService } from '../billing-settings/billing-provider-credentials.service';
import { CredentialEncryptionService } from '../billing-settings/credential-encryption.service';
import { ProviderRegistryService } from './providers/provider-registry.service';
import { RazorpayPlaceholderProvider } from './providers/razorpay-placeholder.provider';

@Module({
  providers: [
    CredentialEncryptionService,
    BillingProviderCredentialsService,
    RazorpayPlaceholderProvider,
    {
      provide: ProviderRegistryService,
      inject: [RazorpayPlaceholderProvider],
      useFactory: (razorpay: RazorpayPlaceholderProvider) => {
        const registry = new ProviderRegistryService();
        registry.register(razorpay);
        return registry;
      },
    },
  ],
  exports: [CredentialEncryptionService, BillingProviderCredentialsService, ProviderRegistryService],
})
export class ProviderRuntimeModule {}
