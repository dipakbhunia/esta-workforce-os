import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentProviderEventsService } from './payment-provider-events.service';

@Injectable()
export class PaymentProviderEventRecoveryScheduler {
  constructor(private readonly events: PaymentProviderEventsService) {}
  @Cron(CronExpression.EVERY_MINUTE)
  recover(): Promise<void> { return this.events.recoverDue(); }
}
