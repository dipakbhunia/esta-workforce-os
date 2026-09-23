import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlatformRenewalsController } from './platform-renewals.controller';
import { PlatformRenewalsService } from './platform-renewals.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [PlatformRenewalsController],
  providers: [PlatformRenewalsService],
})
export class PlatformRenewalsModule {}
