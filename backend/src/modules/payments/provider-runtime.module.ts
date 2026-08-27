import { Module } from '@nestjs/common';
import { BillingProviderCredentialsService } from '../billing-settings/billing-provider-credentials.service';
import { CredentialEncryptionService } from '../billing-settings/credential-encryption.service';
import { ProviderRegistryService } from './providers/provider-registry.service';
import { RazorpayHttpTransport } from './providers/razorpay-http.transport';
import { RazorpayProvider } from './providers/razorpay.provider';

@Module({
  providers: [
    CredentialEncryptionService,
    BillingProviderCredentialsService,
    RazorpayHttpTransport,
    RazorpayProvider,
    {
      provide: ProviderRegistryService,
      inject: [RazorpayProvider],
      useFactory: (razorpay: RazorpayProvider) => {
        const registry = new ProviderRegistryService();
        registry.register(razorpay);
        return registry;
      },
    },
  ],
  exports: [CredentialEncryptionService, BillingProviderCredentialsService, ProviderRegistryService],
})
export class ProviderRuntimeModule {}
