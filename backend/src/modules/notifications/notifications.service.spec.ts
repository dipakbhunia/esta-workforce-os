import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertEventType, MonitoringAlertSeverity, NotificationChannel, NotificationType, Prisma, UserStatus } from '@prisma/client';
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

  it('creates the exact mandatory account-status snapshot for tenant and platform targets', async () => {
    const writes: Array<Record<string, unknown>> = [];
    let companyId: string | null = '22222222-2222-4222-8222-222222222222';
    const service = new NotificationsService(
      { notification: { create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data); return { id: `notification-${writes.length}` };
      } } } as never,
      { resolveAffectedUser: async (userId: string) => ({ userId, email: 'target@example.test', companyId }) } as never,
      {} as never,
      {} as never,
    );
    const first = await service.createAccountStatusChangedEmail({
      statusMutationEventId: '11111111-1111-4111-8111-111111111111',
      targetUserId: 'tenant-target',
      payload: { previousStatus: UserStatus.ACTIVE, status: UserStatus.INACTIVE },
    });
    companyId = null;
    const second = await service.createAccountStatusChangedEmail({
      statusMutationEventId: '22222222-2222-4222-8222-222222222222',
      targetUserId: 'platform-target',
      payload: { previousStatus: UserStatus.SUSPENDED, status: UserStatus.ACTIVE },
    });
    assert.deepEqual([first, second], [{ created: true }, { created: true }]);
    assert.deepEqual(writes[0], {
      companyId: '22222222-2222-4222-8222-222222222222', userId: 'tenant-target', alertId: null,
      type: NotificationType.ACCOUNT_STATUS_CHANGED, channel: NotificationChannel.EMAIL,
      title: 'Your account status changed',
      message: 'Your Esta Workforce OS account is now inactive. Access to your account may no longer be available.',
      severity: null, status: 'PENDING', detailsPath: null,
      idempotencyKey: '11111111-1111-4111-8111-111111111111:ACCOUNT_STATUS_CHANGED:tenant-target:EMAIL',
      deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: 'target@example.test', status: 'PENDING', nextRetryAt: null } },
    });
    assert.equal(writes[1].companyId, null);
    assert.equal(writes[1].userId, 'platform-target');
    assert.equal(writes[1].message,
      'Your Esta Workforce OS account is now active. Access remains subject to your assigned roles and permissions.');
  });

  it('rejects identity email enqueue unless token, purpose, owner, tenant, status, and recipient agree', async () => {
    const baseToken = {
      id: 'token-1', userId: 'target', companyId: 'company-1', purpose: 'INVITATION',
      expiresAt: new Date(Date.now() + 60_000), consumedAt: null, invalidatedAt: null,
      user: { id: 'target', companyId: 'company-1', email: 'target@example.test', status: 'INACTIVE', deletedAt: null },
    };
    const createService = (token: unknown, recipient: unknown) => new NotificationsService(
      { accountActionToken: { findFirst: async () => token }, notification: { create: async () => ({ id: 'notification' }) } } as never,
      { resolveAffectedUser: async () => recipient } as never, {} as never, {} as never,
    );
    const send = (service: NotificationsService) => service.createAccountInvitationEmail({ tokenId: 'token-1', targetUserId: 'target', organizationName: 'Acme' });
    const recipient = { userId: 'target', companyId: 'company-1', email: 'target@example.test' };
    assert.deepEqual(await send(createService(baseToken, recipient)), { created: true });
    for (const [token, resolved] of [
      [{ ...baseToken, userId: 'other' }, recipient],
      [{ ...baseToken, companyId: 'company-2' }, recipient],
      [{ ...baseToken, purpose: 'PASSWORD_RESET' }, recipient],
      [{ ...baseToken, consumedAt: new Date() }, recipient],
      [{ ...baseToken, invalidatedAt: new Date() }, recipient],
      [{ ...baseToken, expiresAt: new Date(Date.now() - 60_000) }, recipient],
      [{ ...baseToken, user: { ...baseToken.user, companyId: 'company-2' } }, recipient],
      [{ ...baseToken, user: { ...baseToken.user, status: 'ACTIVE' } }, recipient],
      [{ ...baseToken, user: { ...baseToken.user, deletedAt: new Date() } }, recipient],
      [baseToken, { ...recipient, userId: 'other' }],
      [baseToken, { ...recipient, companyId: 'company-2' }],
      [baseToken, { ...recipient, email: 'changed@example.test' }],
      [null, recipient],
    ] as const) await assert.rejects(() => send(createService(token, resolved)), /authority mismatch/i);
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
