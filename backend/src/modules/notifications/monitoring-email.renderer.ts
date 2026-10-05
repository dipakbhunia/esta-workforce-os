import { MonitoringAlertSeverity, NotificationType } from '@prisma/client';
import {
  AnyEmailRendererRegistration,
  EmailCompositionError,
  EmailEnvelopePresentation,
  EmailEventKey,
  EmailRendererId,
  EmailRendererRegistration,
  MonitoringEmailPayload,
} from './email-composition.types';
import { buildMonitoringAlertDetailsPath } from './email-content-safety';

const monitoringEvents = [
  NotificationType.ALERT_OPENED,
  NotificationType.ALERT_REOPENED,
  NotificationType.ALERT_ACKNOWLEDGED,
  NotificationType.ALERT_RESOLVED,
  NotificationType.ALERT_AUTO_RESOLVED,
] as const satisfies readonly EmailEventKey[];

const allowedPayloadKeys = new Set([
  'alertId',
  'title',
  'message',
  'severity',
  'employeeDisplayName',
  'deviceDisplayName',
]);

const envelope: EmailEnvelopePresentation = {
  detailsLabel: 'Open alert details',
  textSafetyNotice: 'This notification contains alert summary metadata only. It does not include screenshots, typed text, secrets, or raw monitoring data.',
  htmlSafetyNotice: 'Summary metadata only. No screenshots, typed text, secrets, or raw monitoring data are included.',
};

export const MONITORING_EMAIL_RENDERER_VERSION = 'monitoring-alert-v1';

function requiredText(
  record: Record<string, unknown>,
  key: 'alertId' | 'title' | 'message',
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new EmailCompositionError('INVALID_PAYLOAD', `Monitoring email ${key} is invalid`);
  }
  return value;
}

function optionalText(record: Record<string, unknown>, key: 'employeeDisplayName' | 'deviceDisplayName'): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new EmailCompositionError('INVALID_PAYLOAD', `Monitoring email ${key} is invalid`);
  }
  return value;
}

export function validateMonitoringEmailPayload(payload: unknown): MonitoringEmailPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Monitoring email payload must be an object');
  }
  if (Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Monitoring email payload must be a plain object');
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== allowedPayloadKeys.size || keys.some((key) => !allowedPayloadKeys.has(key))) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Monitoring email payload contains missing or unapproved fields');
  }
  const severity = record.severity;
  if (typeof severity !== 'string' || !Object.values(MonitoringAlertSeverity).includes(severity as MonitoringAlertSeverity)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Monitoring email severity is invalid');
  }
  const alertId = requiredText(record, 'alertId');
  buildMonitoringAlertDetailsPath(alertId);
  return {
    alertId,
    title: requiredText(record, 'title'),
    message: requiredText(record, 'message'),
    severity: severity as MonitoringAlertSeverity,
    employeeDisplayName: optionalText(record, 'employeeDisplayName'),
    deviceDisplayName: optionalText(record, 'deviceDisplayName'),
  };
}

function monitoringTitle(event: EmailEventKey, payload: MonitoringEmailPayload): string {
  if (event === NotificationType.ALERT_RESOLVED || event === NotificationType.ALERT_AUTO_RESOLVED) {
    return `Resolved: ${payload.title}`;
  }
  if (event === NotificationType.ALERT_ACKNOWLEDGED) return `Acknowledged: ${payload.title}`;
  return payload.title;
}

function monitoringMessage(event: EmailEventKey, payload: MonitoringEmailPayload): string {
  const context = [payload.employeeDisplayName, payload.deviceDisplayName].filter(Boolean).join(' • ');
  const prefix = event === NotificationType.ALERT_RESOLVED || event === NotificationType.ALERT_AUTO_RESOLVED
    ? 'Alert resolved.'
    : event === NotificationType.ALERT_ACKNOWLEDGED
      ? 'Alert acknowledged.'
      : 'Alert opened.';
  return [prefix, payload.message, context ? `Context: ${context}` : null].filter(Boolean).join(' ');
}

function registration<K extends EmailEventKey>(event: K): EmailRendererRegistration<K> {
  return {
    event,
    rendererId: EmailRendererId.MONITORING_ALERT,
    rendererVersion: MONITORING_EMAIL_RENDERER_VERSION,
    envelope,
    validatePayload: validateMonitoringEmailPayload,
    render: (currentEvent, payload) => ({
      subject: monitoringTitle(currentEvent, payload),
      message: monitoringMessage(currentEvent, payload),
      safeDetailsPath: buildMonitoringAlertDetailsPath(payload.alertId),
      rendererVersion: MONITORING_EMAIL_RENDERER_VERSION,
    }),
  };
}

export const monitoringEmailRendererRegistrations: readonly AnyEmailRendererRegistration[] =
  monitoringEvents.map((event) => registration(event));
