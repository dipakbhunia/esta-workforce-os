import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertSeverity, NotificationType } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';
import { MONITORING_EMAIL_RENDERER_VERSION } from './monitoring-email.renderer';

const id = '11111111-1111-4111-8111-111111111111';
const payload = {
  alertId: id,
  title: 'Device offline',
  message: 'The device stopped reporting.',
  severity: MonitoringAlertSeverity.CRITICAL,
  employeeDisplayName: 'Jane Doe',
  deviceDisplayName: 'Laptop',
};

describe('Monitoring email renderer', () => {
  it('renders every live event deterministically with byte-compatible content', () => {
    const expected = new Map<NotificationType, [string, string]>([
      [NotificationType.ALERT_OPENED, ['Device offline', 'Alert opened. The device stopped reporting. Context: Jane Doe • Laptop']],
      [NotificationType.ALERT_REOPENED, ['Device offline', 'Alert opened. The device stopped reporting. Context: Jane Doe • Laptop']],
      [NotificationType.ALERT_ACKNOWLEDGED, ['Acknowledged: Device offline', 'Alert acknowledged. The device stopped reporting. Context: Jane Doe • Laptop']],
      [NotificationType.ALERT_RESOLVED, ['Resolved: Device offline', 'Alert resolved. The device stopped reporting. Context: Jane Doe • Laptop']],
      [NotificationType.ALERT_AUTO_RESOLVED, ['Resolved: Device offline', 'Alert resolved. The device stopped reporting. Context: Jane Doe • Laptop']],
    ]);
    for (const [event, [subject, message]] of expected) {
      const first = emailRendererRegistry.render(event, payload);
      assert.deepEqual(emailRendererRegistry.render(event, payload), first);
      assert.deepEqual(first, {
        subject,
        message,
        safeDetailsPath: `/monitoring/alerts/${id}`,
        rendererVersion: MONITORING_EMAIL_RENDERER_VERSION,
      });
    }
  });

  it('rejects missing, wrong, unexpected, and sensitive payload fields', () => {
    const renderRuntime = emailRendererRegistry.render.bind(emailRendererRegistry) as (event: NotificationType, value: unknown) => unknown;
    assert.throws(() => renderRuntime(NotificationType.ALERT_OPENED, { ...payload, title: undefined }));
    assert.throws(() => renderRuntime(NotificationType.ALERT_OPENED, { ...payload, severity: 1 }));
    assert.throws(() => renderRuntime(NotificationType.ALERT_OPENED, { ...payload, extra: true }));
    assert.throws(() => renderRuntime(NotificationType.ALERT_OPENED, { ...payload, password: 'secret' }));
    assert.throws(() => renderRuntime('UNKNOWN' as NotificationType, payload), /Unsupported email event/);
  });

  it('preserves legacy durable content beyond the removed PC-D thresholds without truncation', () => {
    const longTitle = `<legacy-title>&'"${'t'.repeat(220)}`;
    const longMessage = `<legacy-message>&'"${'m'.repeat(4_100)}`;
    const employeeDisplayName = `Employee ${'e'.repeat(210)}`;
    const deviceDisplayName = `Device ${'d'.repeat(210)}`;
    const result = emailRendererRegistry.render(NotificationType.ALERT_RESOLVED, {
      ...payload,
      title: longTitle,
      message: longMessage,
      employeeDisplayName,
      deviceDisplayName,
    });
    assert.equal(result.subject, `Resolved: ${longTitle}`);
    assert.equal(
      result.message,
      `Alert resolved. ${longMessage} Context: ${employeeDisplayName} • ${deviceDisplayName}`,
    );
    assert.ok(result.subject.length > 220);
    assert.ok(result.message.length > 4_500);
  });

  it('rejects payloads with inherited sensitive properties at the plain-object boundary', () => {
    const inherited = Object.assign(Object.create({ password: 'must-not-cross-boundary' }), payload);
    assert.throws(
      () => (emailRendererRegistry.render as (event: NotificationType, value: unknown) => unknown)(
        NotificationType.ALERT_OPENED,
        inherited,
      ),
      /plain object/,
    );
  });
});
