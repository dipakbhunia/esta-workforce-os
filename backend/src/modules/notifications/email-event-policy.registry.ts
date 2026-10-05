import { NotificationChannel, NotificationType } from '@prisma/client';
import {
  EmailPreferencePolicyId,
  EmailQuietHoursPolicyId,
  EmailRecipientResolverId,
  EmailRendererId,
} from './email-composition.types';

export enum EmailEventCategory {
  MONITORING = 'MONITORING',
  SECURITY = 'SECURITY',
}

export enum EmailDeliveryPolicy {
  MANDATORY = 'MANDATORY',
  PREFERENCE_CONTROLLED = 'PREFERENCE_CONTROLLED',
}

export interface EmailEventPolicy {
  eventKey: NotificationType;
  category: EmailEventCategory;
  eligibleChannels: readonly NotificationChannel[];
  deliveryPolicy: EmailDeliveryPolicy;
  recipientResolver: EmailRecipientResolverId;
  preferenceEvaluator: EmailPreferencePolicyId;
  renderer: EmailRendererId;
  quietHours: EmailQuietHoursPolicyId;
  buildIdempotencyKey(input: { sourceId: string; userId: string; channel: NotificationChannel }): string;
}

const monitoringPolicy = (
  eventKey: NotificationType,
  eligibleChannels: readonly NotificationChannel[],
  quietHours: EmailEventPolicy['quietHours'],
): EmailEventPolicy => ({
  eventKey,
  category: EmailEventCategory.MONITORING,
  eligibleChannels,
  deliveryPolicy: EmailDeliveryPolicy.PREFERENCE_CONTROLLED,
  recipientResolver: EmailRecipientResolverId.MONITORING_ALERT,
  preferenceEvaluator: EmailPreferencePolicyId.MONITORING_ALERT,
  renderer: EmailRendererId.MONITORING_ALERT,
  quietHours,
  buildIdempotencyKey: ({ sourceId, userId, channel }) => `${sourceId}:${eventKey}:${userId}:${channel}`,
});

const policies = new Map<NotificationType, EmailEventPolicy>([
  [NotificationType.ALERT_OPENED, monitoringPolicy(NotificationType.ALERT_OPENED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL)],
  [NotificationType.ALERT_REOPENED, monitoringPolicy(NotificationType.ALERT_REOPENED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL)],
  [NotificationType.ALERT_ACKNOWLEDGED, monitoringPolicy(NotificationType.ALERT_ACKNOWLEDGED, [NotificationChannel.IN_APP], EmailQuietHoursPolicyId.NONE)],
  [NotificationType.ALERT_RESOLVED, monitoringPolicy(NotificationType.ALERT_RESOLVED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL)],
  [NotificationType.ALERT_AUTO_RESOLVED, monitoringPolicy(NotificationType.ALERT_AUTO_RESOLVED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL)],
  [NotificationType.PASSWORD_CHANGED, {
    eventKey: NotificationType.PASSWORD_CHANGED,
    category: EmailEventCategory.SECURITY,
    eligibleChannels: [NotificationChannel.EMAIL],
    deliveryPolicy: EmailDeliveryPolicy.MANDATORY,
    recipientResolver: EmailRecipientResolverId.AFFECTED_USER,
    preferenceEvaluator: EmailPreferencePolicyId.NONE,
    renderer: EmailRendererId.PASSWORD_CHANGED_SECURITY,
    quietHours: EmailQuietHoursPolicyId.NONE,
    buildIdempotencyKey: ({ sourceId, userId, channel }) =>
      `${sourceId}:${NotificationType.PASSWORD_CHANGED}:${userId}:${channel}`,
  }],
  [NotificationType.ACCOUNT_STATUS_CHANGED, {
    eventKey: NotificationType.ACCOUNT_STATUS_CHANGED,
    category: EmailEventCategory.SECURITY,
    eligibleChannels: [NotificationChannel.EMAIL],
    deliveryPolicy: EmailDeliveryPolicy.MANDATORY,
    recipientResolver: EmailRecipientResolverId.AFFECTED_USER,
    preferenceEvaluator: EmailPreferencePolicyId.NONE,
    renderer: EmailRendererId.ACCOUNT_STATUS_CHANGED_SECURITY,
    quietHours: EmailQuietHoursPolicyId.NONE,
    buildIdempotencyKey: ({ sourceId, userId, channel }) =>
      `${sourceId}:${NotificationType.ACCOUNT_STATUS_CHANGED}:${userId}:${channel}`,
  }],
]);

export function getEmailEventPolicy(eventKey: NotificationType): EmailEventPolicy {
  const policy = policies.get(eventKey);
  if (!policy) throw new Error(`Unsupported email event policy: ${eventKey}`);
  return policy;
}

export function registeredEmailEventPolicies(): readonly EmailEventPolicy[] {
  return [...policies.values()];
}

export function preferencesApply(policy: Pick<EmailEventPolicy, 'deliveryPolicy'>): boolean {
  return policy.deliveryPolicy === EmailDeliveryPolicy.PREFERENCE_CONTROLLED;
}
