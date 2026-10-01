import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertEventType, MonitoringAlertSeverity, NotificationChannel, NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService monitoring regression', () => {
  it('preserves lifecycle channel rules, preferences, and idempotency keys', async () => {
    const notifications: Array<Record<string, unknown>> = [];
    const deliveries: Array<Record<string, unknown>> = [];
    const prisma = {
      monitoringAlert: { findUnique: async () => ({ id: 'alert', companyId: 'company', employeeId: 'employee',
        severity: MonitoringAlertSeverity.CRITICAL, title: 'Alert', message: 'Summary', employee: null, device: null }) },
      notification: { create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data);
        if (data.deliveries) deliveries.push(data.deliveries as Record<string, unknown>);
        return { id: `n-${notifications.length}`, ...data };
      } },
    };
    const service = new NotificationsService(prisma as never,
      { resolveForAlert: async () => [{ userId: 'user', email: 'user@example.test', companyId: 'company' }] } as never,
      { getEffective: async () => ({ inAppEnabled: true, emailEnabled: true, criticalAlerts: true, warningAlerts: true,
        infoAlerts: true, alertOpened: true, alertResolved: true, quietHoursStart: null, quietHoursEnd: null }),
        allowsSeverity: () => true, allowsLifecycle: () => true } as never,
      {} as never);
    for (const event of [MonitoringAlertEventType.DETECTED, MonitoringAlertEventType.REOPENED,
      MonitoringAlertEventType.ACKNOWLEDGED, MonitoringAlertEventType.RESOLVED, MonitoringAlertEventType.AUTO_RESOLVED]) {
      await service.handleAlertEvent('alert', event);
    }
    assert.equal(notifications.length, 9);
    assert.equal(deliveries.length, 4);
    const acknowledged = notifications.filter((row) => row.type === NotificationType.ALERT_ACKNOWLEDGED);
    assert.deepEqual(acknowledged.map((row) => row.channel), [NotificationChannel.IN_APP]);
    assert.ok(notifications.every((row) => row.idempotencyKey === `alert:${row.type}:user:${row.channel}`));
  });

  it('keeps email and in-app preference suppression authoritative', async () => {
    const created: unknown[] = [];
    const prisma = { monitoringAlert: { findUnique: async () => ({ id: 'alert', companyId: 'company', employeeId: null,
      severity: MonitoringAlertSeverity.CRITICAL, title: 'Alert', message: 'Summary', employee: null, device: null }) },
      notification: { create: async (value: unknown) => { created.push(value); return { id: 'n' }; } } };
    const service = new NotificationsService(prisma as never,
      { resolveForAlert: async () => [{ userId: 'user', email: 'user@example.test', companyId: 'company' }] } as never,
      { getEffective: async () => ({ inAppEnabled: false, emailEnabled: false }), allowsSeverity: () => true, allowsLifecycle: () => true } as never,
      {} as never);
    await service.handleAlertEvent('alert', MonitoringAlertEventType.DETECTED);
    assert.equal(created.length, 0);
  });

  it('delays non-critical resolved email during quiet hours while critical email bypasses them', async () => {
    const created: Array<Record<string, unknown>> = [];
    const now = new Date();
    const startDate = new Date(now.getTime() - 60_000);
    const start = `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`;
    const endDate = new Date(now.getTime() + 60 * 60_000);
    const end = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;
    let severity = MonitoringAlertSeverity.WARNING;
    const prisma = { monitoringAlert: { findUnique: async () => ({ id: 'alert', companyId: 'company', employeeId: null,
      severity, title: 'Alert', message: 'Summary', employee: null, device: null }) },
      notification: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'n', ...data }; } } };
    const service = new NotificationsService(prisma as never,
      { resolveForAlert: async () => [{ userId: 'user', email: 'user@example.test', companyId: 'company' }] } as never,
      { getEffective: async () => ({ inAppEnabled: false, emailEnabled: true, quietHoursStart: start, quietHoursEnd: end }),
        allowsSeverity: () => true, allowsLifecycle: () => true } as never, {} as never);
    await service.handleAlertEvent('alert', MonitoringAlertEventType.RESOLVED);
    const warningDelivery = (created[0].deliveries as { create: { nextRetryAt: Date | null } }).create;
    assert.ok(warningDelivery.nextRetryAt && warningDelivery.nextRetryAt > now);
    severity = MonitoringAlertSeverity.CRITICAL;
    await service.handleAlertEvent('alert', MonitoringAlertEventType.RESOLVED);
    const criticalDelivery = (created[1].deliveries as { create: { nextRetryAt: Date | null } }).create;
    assert.equal(criticalDelivery.nextRetryAt, null);
  });
});
