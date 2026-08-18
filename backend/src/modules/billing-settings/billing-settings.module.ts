import { Module } from '@nestjs/common';
import { BillingSettingsController } from './billing-settings.controller';
import { BillingSettingsService } from './billing-settings.service';

@Module({
  controllers: [BillingSettingsController],
  providers: [BillingSettingsService],
})
export class BillingSettingsModule {}
