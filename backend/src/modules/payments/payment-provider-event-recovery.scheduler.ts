import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulerExecutionGuard } from '../../common/scheduling/scheduler-execution.guard';
import { PaymentProviderEventsService } from './payment-provider-events.service';

@Injectable()
export class PaymentProviderEventRecoveryScheduler {
  constructor(
    private readonly events: PaymentProviderEventsService,
    private readonly schedulerGuard: SchedulerExecutionGuard,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async recover(): Promise<void> {
    if (!this.schedulerGuard.shouldExecute()) return;
    await this.events.recoverDue();
  }
}
