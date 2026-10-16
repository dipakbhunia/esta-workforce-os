import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MonitoringAlertEventType,
  MonitoringAlertSeverity,
  MonitoringAlertStatus,
  MonitoringAlertType,
  MonitoringDeviceStatus,
} from '@prisma/client';
import { MonitoringAlertsService } from './monitoring-alerts.service';

const companyId = '11111111-1111-4111-8111-111111111111';
const employeeId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';

type Alert = {
  id: string;
  companyId: string;
  employeeId: string;
  deviceId: string;
  type: MonitoringAlertType;
  severity: MonitoringAlertSeverity;
  status: MonitoringAlertStatus;
  deduplicationKey: string;
  detectedAt: Date;
  lastDetectedAt: Date;
  resolvedAt: Date | null;
};

function fixture(lastSeenAt = new Date(Date.now() - 60 * 60_000)) {
  const alerts: Alert[] = [];
  const events: Array<{ alertId: string; type: MonitoringAlertEventType }> = [];
  const notifications: Array<{ alertId: string; type: MonitoringAlertEventType }> = [];
  let sequence = 0;
  const device = {
    id: deviceId,
    companyId,
    employeeId,
    deviceName: 'Fixture device',
    status: MonitoringDeviceStatus.ACTIVE,
    deletedAt: null,
    registeredAt: new Date(Date.now() - 2 * 60 * 60_000),
    lastSeenAt,
    revokedAt: null,
    employee: { id: employeeId, employeeCode: 'E-1' },
  };
  const prisma = {
    monitoringDevice: { findMany: async () => [device] },
    monitoringAlert: {
      findFirst: async ({ where }: { where: { deduplicationKey: string; status: { in: MonitoringAlertStatus[] } } }) =>
        alerts.find((alert) => alert.deduplicationKey === where.deduplicationKey && where.status.in.includes(alert.status)) ?? null,
      create: async ({ data }: { data: Omit<Alert, 'id' | 'status' | 'resolvedAt'> }) => {
        const alert: Alert = { ...data, id: `alert-${++sequence}`, status: MonitoringAlertStatus.OPEN, resolvedAt: null };
        alerts.push(alert);
        events.push({ alertId: alert.id, type: MonitoringAlertEventType.DETECTED });
        return { id: alert.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Alert> }) => {
        const alert = alerts.find((entry) => entry.id === where.id);
        assert.ok(alert);
        Object.assign(alert, data);
        return alert;
      },
    },
    monitoringAlertEvent: {
      create: async ({ data }: { data: { alertId: string; type: MonitoringAlertEventType } }) => {
        events.push({ alertId: data.alertId, type: data.type });
        return data;
      },
    },
    auditLog: { create: async () => ({}) },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const settings = Object.fromEntries(Object.values(MonitoringAlertType).map((type) => [type, {
    enabled: true,
    severity: type === MonitoringAlertType.MISSING_HEARTBEAT ? MonitoringAlertSeverity.CRITICAL : MonitoringAlertSeverity.WARNING,
    thresholdMinutes: type === MonitoringAlertType.MISSING_HEARTBEAT ? 20 : 10,
    gracePeriodMinutes: 0,
  }]));
  const policy = { resolveForEmployee: async () => ({ settings, maintenance: { active: false } }) };
  const notificationService = {
    handleAlertEvent: async (alertId: string, type: MonitoringAlertEventType) => notifications.push({ alertId, type }),
  };
  const service = new MonitoringAlertsService(prisma as never, policy as never, notificationService as never);
  return { service, alerts, events, notifications, device };
}

describe('monitoring alert evaluator ownership', () => {
  it('keeps one active missing-heartbeat alert through heartbeat/security cycles and emits one opening', async () => {
    const state = fixture();

    assert.deepEqual(await state.service.evaluateHeartbeatAlerts(), { detected: 1, resolved: 0 });
    assert.deepEqual(await state.service.evaluateSecurityAlerts(), { detected: 0, resolved: 0 });
    assert.deepEqual(await state.service.evaluateHeartbeatAlerts(), { detected: 0, resolved: 0 });
    assert.deepEqual(await state.service.evaluateSecurityAlerts(), { detected: 0, resolved: 0 });

    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].status, MonitoringAlertStatus.OPEN);
    assert.equal(state.notifications.filter((event) => event.type === MonitoringAlertEventType.DETECTED).length, 1);
    assert.equal(state.events.filter((event) => event.type === MonitoringAlertEventType.AUTO_RESOLVED).length, 0);
  });

  it('does not let a security-first pass alter heartbeat-owned state', async () => {
    const state = fixture();

    assert.deepEqual(await state.service.evaluateSecurityAlerts(), { detected: 0, resolved: 0 });
    assert.equal(state.alerts.length, 0);
    assert.deepEqual(await state.service.evaluateHeartbeatAlerts(), { detected: 1, resolved: 0 });
    assert.equal(state.alerts.length, 1);
  });

  it('keeps cross-evaluator concurrency within the same heartbeat alert lifecycle', async () => {
    const state = fixture();

    await Promise.all([
      state.service.evaluateHeartbeatAlerts(),
      state.service.evaluateSecurityAlerts(),
    ]);

    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].type, MonitoringAlertType.MISSING_HEARTBEAT);
    assert.equal(state.alerts[0].status, MonitoringAlertStatus.OPEN);
    assert.equal(state.notifications.filter((event) => event.type === MonitoringAlertEventType.DETECTED).length, 1);
  });

  it('keeps heartbeat alert identities isolated by tenant', () => {
    const state = fixture();
    const otherCompanyId = '44444444-4444-4444-8444-444444444444';
    const keyForCompany = (state.service as unknown as {
      deviceKey: (tenantId: string, type: MonitoringAlertType, monitoredDeviceId: string) => string;
    }).deviceKey;

    assert.notEqual(
      keyForCompany.call(state.service, companyId, MonitoringAlertType.MISSING_HEARTBEAT, deviceId),
      keyForCompany.call(state.service, otherCompanyId, MonitoringAlertType.MISSING_HEARTBEAT, deviceId),
    );
  });

  it('preserves security-owned alert detection without allowing heartbeat cleanup to resolve it', async () => {
    const state = fixture();
    state.device.status = MonitoringDeviceStatus.INACTIVE;

    assert.deepEqual(await state.service.evaluateSecurityAlerts(), { detected: 1, resolved: 0 });
    assert.equal(state.alerts[0].type, MonitoringAlertType.MONITORING_DISABLED);
    assert.equal(state.alerts[0].status, MonitoringAlertStatus.OPEN);

    assert.deepEqual(await state.service.evaluateHeartbeatAlerts(), { detected: 0, resolved: 0 });
    assert.equal(state.alerts[0].status, MonitoringAlertStatus.OPEN);
    assert.equal(state.notifications.filter((event) => event.type === MonitoringAlertEventType.DETECTED).length, 1);
  });

  it('resolves through heartbeat recovery and opens exactly once on a genuine recurrence', async () => {
    const state = fixture();

    await state.service.evaluateHeartbeatAlerts();
    state.device.lastSeenAt = new Date();
    assert.deepEqual(await state.service.evaluateHeartbeatAlerts(), { detected: 0, resolved: 1 });
    assert.equal(state.alerts[0].status, MonitoringAlertStatus.RESOLVED);

    state.device.lastSeenAt = new Date(Date.now() - 60 * 60_000);
    assert.deepEqual(await state.service.evaluateHeartbeatAlerts(), { detected: 1, resolved: 0 });
    await state.service.evaluateSecurityAlerts();
    await state.service.evaluateHeartbeatAlerts();

    assert.equal(state.alerts.length, 2);
    assert.equal(state.alerts.filter((alert) => alert.status === MonitoringAlertStatus.OPEN).length, 1);
    assert.equal(state.notifications.filter((event) => event.type === MonitoringAlertEventType.DETECTED).length, 2);
    assert.equal(new Set(state.alerts.map((alert) => alert.companyId)).size, 1);
  });
});
