import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertEventType, MonitoringAlertSeverity, NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService monitoring regression', () => {
  const alertId = '11111111-1111-4111-8111-111111111111';

  it('preserves lifecycle channel rules, preferences, and idempotency keys', async () => {
    const notifications: Array<Record<string, unknown>> = [];
    const deliveries: Array<Record<string, unknown>> = [];
    const prisma = {
      monitoringAlert: { findUnique: async () => ({ id: alertId, companyId: 'company', employeeId: 'employee',
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
      await service.handleAlertEvent(alertId, event);
    }
    assert.equal(notifications.length, 9);
    assert.equal(deliveries.length, 4);
    const acknowledged = notifications.filter((row) => row.type === NotificationType.ALERT_ACKNOWLEDGED);
    assert.deepEqual(acknowledged.map((row) => row.channel), [NotificationChannel.IN_APP]);
    assert.ok(notifications.every((row) => row.idempotencyKey === `${alertId}:${row.type}:user:${row.channel}`));
    assert.ok(notifications.every((row) => row.detailsPath === `/monitoring/alerts/${alertId}`));
  });

  it('keeps email and in-app preference suppression authoritative', async () => {
    const created: unknown[] = [];
    const prisma = { monitoringAlert: { findUnique: async () => ({ id: alertId, companyId: 'company', employeeId: null,
      severity: MonitoringAlertSeverity.CRITICAL, title: 'Alert', message: 'Summary', employee: null, device: null }) },
      notification: { create: async (value: unknown) => { created.push(value); return { id: 'n' }; } } };
    const service = new NotificationsService(prisma as never,
      { resolveForAlert: async () => [{ userId: 'user', email: 'user@example.test', companyId: 'company' }] } as never,
      { getEffective: async () => ({ inAppEnabled: false, emailEnabled: false }), allowsSeverity: () => true, allowsLifecycle: () => true } as never,
      {} as never);
    await service.handleAlertEvent(alertId, MonitoringAlertEventType.DETECTED);
    assert.equal(created.length, 0);
  });

  it('persists nothing when strict composition rejects the domain payload', async () => {
    let recipientCalls = 0;
    let persistenceCalls = 0;
    const prisma = {
      monitoringAlert: { findUnique: async () => ({
        id: 'invalid-alert-id', companyId: 'company', employeeId: null,
        severity: MonitoringAlertSeverity.CRITICAL, title: 'Alert', message: 'Summary', employee: null, device: null,
      }) },
      notification: { create: async () => { persistenceCalls += 1; } },
    };
    const service = new NotificationsService(
      prisma as never,
      { resolveForAlert: async () => { recipientCalls += 1; return []; } } as never,
      {} as never,
      {} as never,
    );
    await assert.rejects(() => service.handleAlertEvent('invalid-alert-id', MonitoringAlertEventType.DETECTED));
    assert.equal(recipientCalls, 0);
    assert.equal(persistenceCalls, 0);
  });

  it('persists legacy-compatible long Monitoring content without truncation', async () => {
    const title = `Legacy ${'t'.repeat(220)}`;
    const message = `Legacy ${'m'.repeat(4_100)}`;
    const firstName = `Employee ${'e'.repeat(210)}`;
    const deviceName = `Device ${'d'.repeat(210)}`;
    let persisted: Record<string, unknown> | undefined;
    const prisma = {
      monitoringAlert: { findUnique: async () => ({
        id: alertId,
        companyId: 'company',
        employeeId: 'employee',
        severity: MonitoringAlertSeverity.CRITICAL,
        title,
        message,
        employee: { user: { firstName, lastName: '' } },
        device: { deviceName },
      }) },
      notification: { create: async ({ data }: { data: Record<string, unknown> }) => {
        persisted = data;
        return { id: 'notification' };
      } },
    };
    const service = new NotificationsService(
      prisma as never,
      { resolveForAlert: async () => [{ userId: 'user', email: 'user@example.test', companyId: 'company' }] } as never,
      { getEffective: async () => ({ inAppEnabled: true, emailEnabled: false }), allowsSeverity: () => true, allowsLifecycle: () => true } as never,
      {} as never,
    );
    await service.handleAlertEvent(alertId, MonitoringAlertEventType.DETECTED);
    assert.equal(persisted?.title, title);
    assert.equal(persisted?.message, `Alert opened. ${message} Context: ${firstName} • ${deviceName}`);
  });

  it('delays non-critical resolved email during quiet hours while critical email bypasses them', async () => {
    const created: Array<Record<string, unknown>> = [];
    const now = new Date();
    const startDate = new Date(now.getTime() - 60_000);
    const start = `${String(startDate.getUTCHours()).padStart(2, '0')}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`;
    const endDate = new Date(now.getTime() + 60 * 60_000);
    const end = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;
    let severity = MonitoringAlertSeverity.WARNING;
    const prisma = { monitoringAlert: { findUnique: async () => ({ id: alertId, companyId: 'company', employeeId: null,
      severity, title: 'Alert', message: 'Summary', employee: null, device: null }) },
      notification: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'n', ...data }; } } };
    const service = new NotificationsService(prisma as never,
      { resolveForAlert: async () => [{ userId: 'user', email: 'user@example.test', companyId: 'company' }] } as never,
      { getEffective: async () => ({ inAppEnabled: false, emailEnabled: true, quietHoursStart: start, quietHoursEnd: end }),
        allowsSeverity: () => true, allowsLifecycle: () => true } as never, {} as never);
    await service.handleAlertEvent(alertId, MonitoringAlertEventType.RESOLVED);
    const warningDelivery = (created[0].deliveries as { create: { nextRetryAt: Date | null } }).create;
    assert.ok(warningDelivery.nextRetryAt && warningDelivery.nextRetryAt > now);
    severity = MonitoringAlertSeverity.CRITICAL;
    await service.handleAlertEvent(alertId, MonitoringAlertEventType.RESOLVED);
    const criticalDelivery = (created[1].deliveries as { create: { nextRetryAt: Date | null } }).create;
    assert.equal(criticalDelivery.nextRetryAt, null);
  });

  it('creates one mandatory password-changed email snapshot and treats its exact idempotency collision as success', async () => {
    const writes: Array<Record<string, unknown>> = [];
    let duplicate = false;
    const prisma = { notification: { create: async ({ data }: { data: Record<string, unknown> }) => {
      if (duplicate) {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'Notification', target: ['idempotencyKey'] },
        });
      }
      writes.push(data);
      return { id: 'notification' };
    } } };
    const service = new NotificationsService(
      prisma as never,
      { resolveAffectedUser: async () => ({ userId: 'target', email: 'target@example.test', companyId: null }) } as never,
      {} as never,
      {} as never,
    );
    assert.deepEqual(await service.createPasswordChangedEmail({
      passwordMutationEventId: '11111111-1111-4111-8111-111111111111', targetUserId: 'target', payload: {},
    }), { created: true });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      companyId: null, userId: 'target', alertId: null, type: NotificationType.PASSWORD_CHANGED,
      channel: NotificationChannel.EMAIL, title: 'Your password was changed',
      message: 'The password for your Esta Workforce OS account was changed. If you did not expect this change, contact your administrator or support immediately.',
      severity: null, status: 'PENDING', detailsPath: null,
      idempotencyKey: '11111111-1111-4111-8111-111111111111:PASSWORD_CHANGED:target:EMAIL',
      deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: 'target@example.test', status: 'PENDING', nextRetryAt: null } },
    });
    duplicate = true;
    assert.deepEqual(await service.createPasswordChangedEmail({
      passwordMutationEventId: '11111111-1111-4111-8111-111111111111', targetUserId: 'target', payload: {},
    }), { created: false });
  });

  it('propagates unrelated or unproven persistence failures', async (context) => {
    const serviceFor = (failure: Error) => new NotificationsService(
      { notification: { create: async () => { throw failure; } } } as never,
      { resolveAffectedUser: async () => ({ userId: 'target', email: 'target@example.test', companyId: null }) } as never,
      {} as never,
      {} as never,
    );
    const input = {
      passwordMutationEventId: '11111111-1111-4111-8111-111111111111',
      targetUserId: 'target',
      payload: {},
    };
    const p2002 = (meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('unique failure', {
      code: 'P2002', clientVersion: 'test', ...(meta ? { meta } : {}),
    });
    const cases: Array<[string, Error]> = [
      ['another unique target', p2002({ modelName: 'Notification', target: ['id'] })],
      ['missing target metadata', p2002()],
      ['malformed target metadata', p2002({ modelName: 'Notification', target: 'idempotencyKey' })],
      ['a multi-field target containing idempotencyKey', p2002({
        modelName: 'Notification', target: ['idempotencyKey', 'userId'],
      })],
      ['a non-P2002 Prisma failure', new Prisma.PrismaClientKnownRequestError('foreign-key failure', {
        code: 'P2003', clientVersion: 'test', meta: { modelName: 'Notification' },
      })],
      ['an ordinary persistence failure', new Error('persistence unavailable')],
    ];
    for (const [name, failure] of cases) {
      await context.test(name, async () => {
        await assert.rejects(() => serviceFor(failure).createPasswordChangedEmail(input), (error) => error === failure);
      });
    }
  });
});
