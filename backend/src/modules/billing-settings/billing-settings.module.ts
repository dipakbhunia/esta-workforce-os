import { Module } from '@nestjs/common';
import { BillingSettingsController } from './billing-settings.controller';
import { BillingSettingsService } from './billing-settings.service';
import { ProviderRuntimeModule } from '../payments/provider-runtime.module';

@Module({
  imports: [ProviderRuntimeModule],
  controllers: [BillingSettingsController],
  providers: [BillingSettingsService],
  exports: [BillingSettingsService],
})
export class BillingSettingsModule {}
