import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MonitoringAlertPoliciesController } from './monitoring-alert-policies.controller';
import { MonitoringAlertPoliciesService } from './monitoring-alert-policies.service';
import { MonitoringAlertPolicyResolver } from './monitoring-alert-policy.resolver';
import { MonitoringAlertSchedulerService } from './monitoring-alert-scheduler.service';
import { MonitoringAlertsController } from './monitoring-alerts.controller';
import { MonitoringAlertsService } from './monitoring-alerts.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MonitoringAlertsController, MonitoringAlertPoliciesController],
  providers: [MonitoringAlertsService, MonitoringAlertPoliciesService, MonitoringAlertPolicyResolver, MonitoringAlertSchedulerService],
  exports: [MonitoringAlertsService, MonitoringAlertPolicyResolver, MonitoringAlertSchedulerService],
})
export class MonitoringAlertsModule {}
