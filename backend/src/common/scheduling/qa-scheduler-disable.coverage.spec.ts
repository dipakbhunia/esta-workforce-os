import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StaleAttendanceScheduler } from '../../modules/attendance/stale-attendance.scheduler';
import { InvoiceGenerationRecoveryScheduler } from '../../modules/invoices/invoice-generation-recovery.scheduler';
import { MonitoringAlertSchedulerService } from '../../modules/monitoring-alerts/monitoring-alert-scheduler.service';
import { NotificationDeliveryService } from '../../modules/notifications/notification-delivery.service';
import { PaymentProviderEventRecoveryScheduler } from '../../modules/payments/payment-provider-event-recovery.scheduler';
import { SubscriptionExpirationScheduler } from '../../modules/subscriptions/subscription-expiration.scheduler';
import { SubscriptionPaymentActivationScheduler } from '../../modules/subscriptions/subscription-payment-activation.scheduler';
import { TrialsScheduler } from '../../modules/trials/trials.scheduler';

const disabledScheduler = { shouldExecute: () => false } as never;
const enabledScheduler = { shouldExecute: () => true } as never;

describe('QA browser acceptance scheduler suppression coverage', () => {
  it('preserves delegation from every registered cron entry point when suppression is disabled', async () => {
    const calls: string[] = [];
    const called = (name: string, result: unknown = undefined) => async () => {
      calls.push(name);
      return result;
    };

    await new StaleAttendanceScheduler(
      { enforceStaleAttendanceSessions: called('attendance', 0) } as never,
      { get: (key: string) => key === 'ATTENDANCE_STALE_EVALUATION_INTERVAL_MINUTES' ? 1 : true } as never,
      enabledScheduler,
    ).evaluateOpenAttendance();

    const monitoring = new MonitoringAlertSchedulerService({
      evaluateHeartbeatAlerts: called('heartbeat', { detected: 0, resolved: 0 }),
      evaluateScreenshotAlerts: called('screenshots', { detected: 0, resolved: 0 }),
      evaluateIdleAlerts: called('idle', { detected: 0, resolved: 0 }),
      evaluateSecurityAlerts: called('security', { detected: 0, resolved: 0 }),
    } as never, enabledScheduler);
    await monitoring.evaluateHeartbeat();
    await monitoring.evaluateScreenshots();
    await monitoring.evaluateIdle();
    await monitoring.evaluateSecurity();

    await new PaymentProviderEventRecoveryScheduler(
      { recoverDue: called('payment-events') } as never,
      enabledScheduler,
    ).recover();

    const notification = new NotificationDeliveryService(
      {} as never,
      {} as never,
      {} as never,
      enabledScheduler,
    );
    notification.claimNextDelivery = called('notification-claim', null) as never;
    await notification.processPendingDeliveries();

    await new InvoiceGenerationRecoveryScheduler(
      { recoverDue: called('invoices', { scanned: 0, succeeded: 0, failed: 0 }) } as never,
      enabledScheduler,
    ).recoverMissingInvoices();
    await new TrialsScheduler(
      { reconcileExpired: called('trials', 0) } as never,
      enabledScheduler,
    ).expireTrials();
    await new SubscriptionExpirationScheduler(
      { recoverDue: called('renewal-preparation', 0) } as never,
      { recoverDue: called('subscription-expiration', 0) } as never,
      enabledScheduler,
    ).expireDueSubscriptions();
    await new SubscriptionPaymentActivationScheduler(
      { recoverDue: called('payment-activation') } as never,
      { recoverDue: called('renewal-application') } as never,
      enabledScheduler,
    ).recover();

    assert.deepEqual(calls, [
      'attendance',
      'heartbeat',
      'screenshots',
      'idle',
      'security',
      'payment-events',
      'notification-claim',
      'invoices',
      'trials',
      'renewal-preparation',
      'subscription-expiration',
      'payment-activation',
      'renewal-application',
    ]);
  });

  it('returns before every registered cron entry point invokes a business service', async () => {
    const calls: string[] = [];
    const called = (name: string, result: unknown = undefined) => async () => {
      calls.push(name);
      return result;
    };

    await new StaleAttendanceScheduler(
      { enforceStaleAttendanceSessions: called('attendance', 0) } as never,
      { get: () => true } as never,
      disabledScheduler,
    ).evaluateOpenAttendance();

    const monitoring = new MonitoringAlertSchedulerService({
      evaluateHeartbeatAlerts: called('heartbeat', { detected: 0, resolved: 0 }),
      evaluateScreenshotAlerts: called('screenshots', { detected: 0, resolved: 0 }),
      evaluateIdleAlerts: called('idle', { detected: 0, resolved: 0 }),
      evaluateSecurityAlerts: called('security', { detected: 0, resolved: 0 }),
    } as never, disabledScheduler);
    await monitoring.evaluateHeartbeat();
    await monitoring.evaluateScreenshots();
    await monitoring.evaluateIdle();
    await monitoring.evaluateSecurity();

    await new PaymentProviderEventRecoveryScheduler(
      { recoverDue: called('payment-events') } as never,
      disabledScheduler,
    ).recover();

    await new NotificationDeliveryService(
      { $transaction: called('notification-database') } as never,
      { send: called('notification-email') } as never,
      { resolveForClaim: called('smtp-runtime') } as never,
      disabledScheduler,
    ).processPendingDeliveries();

    await new InvoiceGenerationRecoveryScheduler(
      { recoverDue: called('invoices', { scanned: 0, succeeded: 0, failed: 0 }) } as never,
      disabledScheduler,
    ).recoverMissingInvoices();

    await new TrialsScheduler(
      { reconcileExpired: called('trials', 0) } as never,
      disabledScheduler,
    ).expireTrials();

    await new SubscriptionExpirationScheduler(
      { recoverDue: called('renewal-preparation', 0) } as never,
      { recoverDue: called('subscription-expiration', 0) } as never,
      disabledScheduler,
    ).expireDueSubscriptions();

    await new SubscriptionPaymentActivationScheduler(
      { recoverDue: called('payment-activation') } as never,
      { recoverDue: called('renewal-application') } as never,
      disabledScheduler,
    ).recover();

    assert.deepEqual(calls, []);
  });
});
