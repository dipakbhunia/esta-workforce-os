import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertSeverity, NotificationType } from '@prisma/client';
import { EmailCompositionError } from './email-composition.types';
import { EmailRendererRegistry } from './email-renderer.registry';
import { monitoringEmailRendererRegistrations } from './monitoring-email.renderer';
import { accountStatusChangedEmailRendererRegistration } from './account-status-changed-email.renderer';

describe('EmailRendererRegistry', () => {
  it('fails closed for duplicate and missing registrations', () => {
    assert.throws(
      () => new EmailRendererRegistry([
        monitoringEmailRendererRegistrations[0],
        monitoringEmailRendererRegistrations[0],
      ]),
      (error: unknown) => error instanceof EmailCompositionError && error.code === 'DUPLICATE_RENDERER',
    );
    const empty = new EmailRendererRegistry([]);
    assert.throws(
      () => (empty.render as (event: NotificationType, payload: unknown) => unknown)(NotificationType.ALERT_OPENED, {}),
      (error: unknown) => error instanceof EmailCompositionError && error.code === 'UNSUPPORTED_EVENT',
    );
  });

  it('resolves the account-status renderer through the typed registry', () => {
    const registry = new EmailRendererRegistry([accountStatusChangedEmailRendererRegistration]);
    assert.equal(registry.render(NotificationType.ACCOUNT_STATUS_CHANGED, {
      previousStatus: 'ACTIVE', status: 'INACTIVE',
    }).subject, 'Your account status changed');
  });

  it('rejects sensitive payload fields and resolves events exactly at runtime', () => {
    const registry = new EmailRendererRegistry(monitoringEmailRendererRegistrations);
    assert.throws(() => (registry.render as (event: NotificationType, payload: unknown) => unknown)(
      NotificationType.ALERT_RESOLVED,
      {
        alertId: '11111111-1111-4111-8111-111111111111',
        title: 'Alert',
        message: 'Message',
        severity: MonitoringAlertSeverity.CRITICAL,
        employeeDisplayName: null,
        deviceDisplayName: null,
        resetToken: 'must-not-cross-boundary',
      },
    ));
    assert.throws(
      () => (registry.render as (event: NotificationType, payload: unknown) => unknown)(
        'UNKNOWN_EVENT' as NotificationType,
        {},
      ),
      (error: unknown) => error instanceof EmailCompositionError && error.code === 'UNSUPPORTED_EVENT',
    );
  });
});
