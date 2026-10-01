import { NotificationChannel, NotificationType } from '@prisma/client';

export enum EmailEventCategory {
  MONITORING = 'MONITORING',
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
  recipientResolver: 'MONITORING_ALERT';
  preferenceEvaluator: 'MONITORING_ALERT';
  renderer: 'MONITORING_ALERT';
  quietHours: 'NON_CRITICAL_EMAIL' | 'NONE';
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
  recipientResolver: 'MONITORING_ALERT',
  preferenceEvaluator: 'MONITORING_ALERT',
  renderer: 'MONITORING_ALERT',
  quietHours,
  buildIdempotencyKey: ({ sourceId, userId, channel }) => `${sourceId}:${eventKey}:${userId}:${channel}`,
});

const policies = new Map<NotificationType, EmailEventPolicy>([
  [NotificationType.ALERT_OPENED, monitoringPolicy(NotificationType.ALERT_OPENED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], 'NON_CRITICAL_EMAIL')],
  [NotificationType.ALERT_REOPENED, monitoringPolicy(NotificationType.ALERT_REOPENED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], 'NON_CRITICAL_EMAIL')],
  [NotificationType.ALERT_ACKNOWLEDGED, monitoringPolicy(NotificationType.ALERT_ACKNOWLEDGED, [NotificationChannel.IN_APP], 'NONE')],
  [NotificationType.ALERT_RESOLVED, monitoringPolicy(NotificationType.ALERT_RESOLVED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], 'NON_CRITICAL_EMAIL')],
  [NotificationType.ALERT_AUTO_RESOLVED, monitoringPolicy(NotificationType.ALERT_AUTO_RESOLVED, [NotificationChannel.IN_APP, NotificationChannel.EMAIL], 'NON_CRITICAL_EMAIL')],
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
