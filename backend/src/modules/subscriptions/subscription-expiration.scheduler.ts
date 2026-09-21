import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { SubscriptionRenewalPreparationService } from './subscription-renewal-preparation.service';

@Injectable()
export class SubscriptionExpirationScheduler {
  private readonly logger = new Logger(SubscriptionExpirationScheduler.name);
  private running = false;

  constructor(
    private readonly renewal: SubscriptionRenewalPreparationService,
    private readonly expiration: SubscriptionExpirationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDueSubscriptions(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      try {
        const prepared = await this.renewal.recoverDue();
        if (prepared) this.logger.log(`Prepared ${prepared} Subscription renewal(s).`);
      } catch (error) {
        this.logger.warn(`Subscription renewal preparation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
      const expired = await this.expiration.recoverDue();
      if (expired) this.logger.log(`Expired ${expired} Subscription(s).`);
    } catch (error) {
      this.logger.warn(`Subscription expiration reconciliation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }
}
