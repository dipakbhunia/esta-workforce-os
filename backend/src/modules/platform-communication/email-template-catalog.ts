import { NotificationChannel, NotificationType } from '@prisma/client';
import { registeredEmailEventPolicies } from '../notifications/email-event-policy.registry';

const variables = {
  monitoring: ['alertId', 'title', 'message', 'severity', 'employeeDisplayName', 'deviceDisplayName'],
  accountStatus: ['previousStatus', 'status'],
  leaveDecision: ['leaveRequestId', 'leaveTypeName', 'startDate', 'endDate'],
  leaveApplied: ['leaveRequestId', 'applicantDisplayName', 'leaveTypeName', 'startDate', 'endDate'],
  leaveCancelled: ['leaveRequestId', 'applicantDisplayName', 'leaveTypeName', 'startDate', 'endDate', 'cancelledByDisplayName'],
  attendanceDecision: ['attendanceCorrectionRequestId', 'attendanceDate'],
  attendanceApplied: ['attendanceCorrectionRequestId', 'employeeDisplayName', 'attendanceDate', 'correctionType'],
  invitation: ['organizationName', 'expiresAt'],
  expiration: ['expiresAt'],
  payment: ['companyName', 'paymentReference', 'amountMinor', 'currency', 'occurredAt'],
  invoice: ['companyName', 'invoiceNumber', 'totalMinor', 'currency', 'issuedAt', 'dueAt'],
  subscriptionActivated: ['companyName', 'subscriptionReference', 'planName', 'activatedAt', 'periodStart', 'periodEnd'],
  subscriptionExpired: ['companyName', 'subscriptionReference', 'expiredAt'],
  renewalPeriod: ['companyName', 'renewalReference', 'periodStart', 'periodEnd'],
  renewalBlocked: ['companyName', 'renewalReference', 'blockedReason'],
} as const;

const variableMap: Partial<Record<NotificationType, readonly string[]>> = {
  [NotificationType.ALERT_OPENED]: variables.monitoring,
  [NotificationType.ALERT_REOPENED]: variables.monitoring,
  [NotificationType.ALERT_RESOLVED]: variables.monitoring,
  [NotificationType.ALERT_AUTO_RESOLVED]: variables.monitoring,
  [NotificationType.PASSWORD_CHANGED]: [],
  [NotificationType.ACCOUNT_STATUS_CHANGED]: variables.accountStatus,
  [NotificationType.LEAVE_APPROVED]: variables.leaveDecision,
  [NotificationType.LEAVE_REJECTED]: variables.leaveDecision,
  [NotificationType.LEAVE_APPLIED]: variables.leaveApplied,
  [NotificationType.LEAVE_CANCELLED]: variables.leaveCancelled,
  [NotificationType.ATTENDANCE_CORRECTION_APPROVED]: variables.attendanceDecision,
  [NotificationType.ATTENDANCE_CORRECTION_REJECTED]: variables.attendanceDecision,
  [NotificationType.ATTENDANCE_CORRECTION_APPLIED]: variables.attendanceApplied,
  [NotificationType.ACCOUNT_INVITATION]: variables.invitation,
  [NotificationType.PASSWORD_RESET_REQUESTED]: variables.expiration,
  [NotificationType.EMAIL_VERIFICATION]: variables.expiration,
  [NotificationType.PAYMENT_CAPTURED]: variables.payment,
  [NotificationType.PAYMENT_FAILED]: variables.payment,
  [NotificationType.INVOICE_ISSUED]: variables.invoice,
  [NotificationType.SUBSCRIPTION_ACTIVATED]: variables.subscriptionActivated,
  [NotificationType.SUBSCRIPTION_EXPIRED]: variables.subscriptionExpired,
  [NotificationType.RENEWAL_APPLIED]: variables.renewalPeriod,
  [NotificationType.RENEWAL_BLOCKED]: variables.renewalBlocked,
  [NotificationType.RENEWAL_PREPARED]: variables.renewalPeriod,
};

const systemManagedActionLinkTypes = new Set<NotificationType>([
  NotificationType.ACCOUNT_INVITATION,
  NotificationType.PASSWORD_RESET_REQUESTED,
  NotificationType.EMAIL_VERIFICATION,
]);

const optionalVariableMap: Partial<Record<NotificationType, readonly string[]>> = {
  [NotificationType.ALERT_OPENED]: ['employeeDisplayName', 'deviceDisplayName'],
  [NotificationType.ALERT_REOPENED]: ['employeeDisplayName', 'deviceDisplayName'],
  [NotificationType.ALERT_RESOLVED]: ['employeeDisplayName', 'deviceDisplayName'],
  [NotificationType.ALERT_AUTO_RESOLVED]: ['employeeDisplayName', 'deviceDisplayName'],
  [NotificationType.INVOICE_ISSUED]: ['dueAt'],
};

export const EMAIL_TEMPLATE_CATALOG = Object.freeze(registeredEmailEventPolicies()
  .filter((policy) => policy.eligibleChannels.includes(NotificationChannel.EMAIL))
  .map((policy) => Object.freeze({
    templateKey: policy.eventKey,
    notificationType: policy.eventKey,
    category: policy.category,
    allowedVariables: Object.freeze([...(variableMap[policy.eventKey] ?? [])]),
    optionalVariables: Object.freeze([...(optionalVariableMap[policy.eventKey] ?? [])]),
    placeholderContractVersion: 1,
    systemManagedActionLink: systemManagedActionLinkTypes.has(policy.eventKey),
  })));

export function findEmailTemplateCatalogEntry(type: NotificationType) {
  return EMAIL_TEMPLATE_CATALOG.find((entry) => entry.notificationType === type) ?? null;
}
