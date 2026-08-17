import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TrialsService } from './trials.service';

@Injectable()
export class TrialsScheduler {
  private readonly logger = new Logger(TrialsScheduler.name);
  private running = false;
  constructor(private readonly trials: TrialsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireTrials() {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.trials.reconcileExpired();
      if (expired) this.logger.log(`Expired ${expired} Trial(s).`);
    } catch (error) {
      this.logger.warn(`Trial expiry reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
