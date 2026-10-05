import { MonitoringAlertSeverity, NotificationType } from '@prisma/client';

export const EMAIL_COMPOSITION_LIMITS = {
  rendererVersion: 64,
} as const;

export enum EmailRendererId {
  MONITORING_ALERT = 'MONITORING_ALERT',
}

export enum EmailRecipientResolverId {
  MONITORING_ALERT = 'MONITORING_ALERT',
}

export enum EmailPreferencePolicyId {
  MONITORING_ALERT = 'MONITORING_ALERT',
}

export enum EmailQuietHoursPolicyId {
  NON_CRITICAL_EMAIL = 'NON_CRITICAL_EMAIL',
  NONE = 'NONE',
}

export interface MonitoringEmailPayload {
  alertId: string;
  title: string;
  message: string;
  severity: MonitoringAlertSeverity;
  employeeDisplayName: string | null;
  deviceDisplayName: string | null;
}

export interface EmailEventPayloadMap {
  [NotificationType.ALERT_OPENED]: MonitoringEmailPayload;
  [NotificationType.ALERT_REOPENED]: MonitoringEmailPayload;
  [NotificationType.ALERT_ACKNOWLEDGED]: MonitoringEmailPayload;
  [NotificationType.ALERT_RESOLVED]: MonitoringEmailPayload;
  [NotificationType.ALERT_AUTO_RESOLVED]: MonitoringEmailPayload;
}

export type EmailEventKey = keyof EmailEventPayloadMap;

export interface EmailCompositionResult {
  subject: string;
  message: string;
  safeDetailsPath: string | null;
  rendererVersion: string;
}

export interface EmailEnvelopePresentation {
  detailsLabel: string;
  textSafetyNotice: string;
  htmlSafetyNotice: string;
}

export interface EmailRendererRegistration<K extends EmailEventKey = EmailEventKey> {
  event: K;
  rendererId: EmailRendererId;
  rendererVersion: string;
  envelope: EmailEnvelopePresentation;
  validatePayload(payload: unknown): EmailEventPayloadMap[K];
  render(event: K, payload: EmailEventPayloadMap[K]): EmailCompositionResult;
}

export type AnyEmailRendererRegistration = {
  [K in EmailEventKey]: EmailRendererRegistration<K>;
}[EmailEventKey];

export class EmailCompositionError extends Error {
  constructor(
    readonly code:
      | 'DUPLICATE_RENDERER'
      | 'INVALID_PAYLOAD'
      | 'INVALID_RENDER_RESULT'
      | 'UNSUPPORTED_EVENT',
    message: string,
  ) {
    super(message);
    this.name = 'EmailCompositionError';
  }
}
