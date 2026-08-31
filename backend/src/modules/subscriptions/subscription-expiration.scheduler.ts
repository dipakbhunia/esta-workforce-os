import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionExpirationService } from './subscription-expiration.service';

@Injectable()
export class SubscriptionExpirationScheduler {
  private readonly logger = new Logger(SubscriptionExpirationScheduler.name);
  private running = false;

  constructor(private readonly expiration: SubscriptionExpirationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDueSubscriptions(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.expiration.recoverDue();
      if (expired) this.logger.log(`Expired ${expired} Subscription(s).`);
    } catch (error) {
      this.logger.warn(`Subscription expiration reconciliation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }
}
