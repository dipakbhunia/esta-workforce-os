import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPaymentActivationService } from './subscription-payment-activation.service';
import { SubscriptionRenewalApplicationService } from './subscription-renewal-application.service';

@Injectable()
export class SubscriptionPaymentActivationScheduler {
  private readonly logger = new Logger(SubscriptionPaymentActivationScheduler.name);
  constructor(private readonly activation: SubscriptionPaymentActivationService, private readonly renewal: SubscriptionRenewalApplicationService) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async recover(): Promise<void> {
    try { await this.activation.recoverDue(); }
    catch { this.logger.warn('Subscription payment activation recovery failed'); }
    try { await this.renewal.recoverDue(); }
    catch { this.logger.warn('Subscription renewal application recovery failed'); }
  }
}
