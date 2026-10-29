import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulerExecutionGuard } from '../../common/scheduling/scheduler-execution.guard';
import { InvoiceGenerationRecoveryService } from './invoice-generation-recovery.service';

@Injectable()
export class InvoiceGenerationRecoveryScheduler {
  private readonly logger = new Logger(InvoiceGenerationRecoveryScheduler.name);
  private running = false;

  constructor(
    private readonly recovery: InvoiceGenerationRecoveryService,
    private readonly schedulerGuard: SchedulerExecutionGuard,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverMissingInvoices(): Promise<void> {
    if (!this.schedulerGuard.shouldExecute()) return;
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.recovery.recoverDue();
      if (result.scanned) {
        this.logger.log(`Invoice generation recovery processed ${result.scanned}; succeeded ${result.succeeded}; failed ${result.failed}.`);
      }
    } catch {
      this.logger.warn('Invoice generation recovery pass failed.');
    } finally {
      this.running = false;
    }
  }
}
