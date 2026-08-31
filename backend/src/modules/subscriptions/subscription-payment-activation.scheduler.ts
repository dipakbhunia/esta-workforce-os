import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPaymentActivationService } from './subscription-payment-activation.service';

@Injectable()
export class SubscriptionPaymentActivationScheduler {
  constructor(private readonly activation: SubscriptionPaymentActivationService) {}
  @Cron(CronExpression.EVERY_MINUTE)
  recover(): Promise<void> { return this.activation.recoverDue(); }
}
