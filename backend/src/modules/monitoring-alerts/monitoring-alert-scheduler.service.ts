import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MonitoringAlertsService } from './monitoring-alerts.service';

@Injectable()
export class MonitoringAlertSchedulerService {
  private readonly logger = new Logger(MonitoringAlertSchedulerService.name);

  constructor(private readonly alerts: MonitoringAlertsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateHeartbeat() {
    await this.run('heartbeat', () => this.alerts.evaluateHeartbeatAlerts());
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async evaluateScreenshots() {
    await this.run('screenshots', () => this.alerts.evaluateScreenshotAlerts());
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateIdle() {
    await this.run('idle', () => this.alerts.evaluateIdleAlerts());
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateSecurity() {
    await this.run('security', () => this.alerts.evaluateSecurityAlerts());
  }

  private async run(name: string, job: () => Promise<{ detected: number; resolved: number }>) {
    try {
      const result = await job();
      this.logger.log(`Monitoring alert ${name} evaluation completed: detected=${result.detected}, resolved=${result.resolved}`);
    } catch (error) {
      this.logger.warn(`Monitoring alert ${name} evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
