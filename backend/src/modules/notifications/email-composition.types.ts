import { MonitoringAlertSeverity, NotificationType, UserStatus } from '@prisma/client';

export const EMAIL_COMPOSITION_LIMITS = {
  rendererVersion: 64,
} as const;

export enum EmailRendererId {
  MONITORING_ALERT = 'MONITORING_ALERT',
  PASSWORD_CHANGED_SECURITY = 'PASSWORD_CHANGED_SECURITY',
  ACCOUNT_STATUS_CHANGED_SECURITY = 'ACCOUNT_STATUS_CHANGED_SECURITY',
  LEAVE_APPROVED_WORKFLOW = 'LEAVE_APPROVED_WORKFLOW',
  LEAVE_REJECTED_WORKFLOW = 'LEAVE_REJECTED_WORKFLOW',
  LEAVE_APPLIED_WORKFLOW = 'LEAVE_APPLIED_WORKFLOW',
  LEAVE_CANCELLED_WORKFLOW = 'LEAVE_CANCELLED_WORKFLOW',
  ATTENDANCE_CORRECTION_APPROVED_WORKFLOW = 'ATTENDANCE_CORRECTION_APPROVED_WORKFLOW',
  ATTENDANCE_CORRECTION_REJECTED_WORKFLOW = 'ATTENDANCE_CORRECTION_REJECTED_WORKFLOW',
  ATTENDANCE_CORRECTION_APPLIED_WORKFLOW = 'ATTENDANCE_CORRECTION_APPLIED_WORKFLOW',
  ACCOUNT_INVITATION_SECURITY = 'ACCOUNT_INVITATION_SECURITY',
  PASSWORD_RESET_REQUESTED_SECURITY = 'PASSWORD_RESET_REQUESTED_SECURITY',
  COMMERCIAL_PAYMENT = 'COMMERCIAL_PAYMENT',
  COMMERCIAL_INVOICE = 'COMMERCIAL_INVOICE',
  COMMERCIAL_SUBSCRIPTION = 'COMMERCIAL_SUBSCRIPTION',
  COMMERCIAL_RENEWAL = 'COMMERCIAL_RENEWAL',
}

export enum EmailRecipientResolverId {
  MONITORING_ALERT = 'MONITORING_ALERT',
  AFFECTED_USER = 'AFFECTED_USER',
  WORKFLOW_APPLICANT = 'WORKFLOW_APPLICANT',
  WORKFLOW_ASSIGNED_APPROVER = 'WORKFLOW_ASSIGNED_APPROVER',
  WORKFLOW_EXACT_PARTICIPANT = 'WORKFLOW_EXACT_PARTICIPANT',
  COMMERCIAL_BILLING_CONTACT = 'COMMERCIAL_BILLING_CONTACT',
}

export enum EmailPreferencePolicyId {
  MONITORING_ALERT = 'MONITORING_ALERT',
  NONE = 'NONE',
  USER_EMAIL_ENABLED = 'USER_EMAIL_ENABLED',
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

export type PasswordChangedEmailPayload = Record<string, never>;

export interface AccountStatusChangedEmailPayload {
  previousStatus: UserStatus;
  status: UserStatus;
}

export interface LeaveDecisionEmailPayload {
  leaveRequestId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
}

export interface LeaveAppliedEmailPayload {
  leaveRequestId: string;
  applicantDisplayName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
}

export interface LeaveCancelledEmailPayload {
  leaveRequestId: string;
  applicantDisplayName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  cancelledByDisplayName: string;
}

export interface AttendanceCorrectionDecisionEmailPayload {
  attendanceCorrectionRequestId: string;
  attendanceDate: string;
}

export interface AttendanceCorrectionAppliedEmailPayload {
  attendanceCorrectionRequestId: string;
  employeeDisplayName: string;
  attendanceDate: string;
  correctionType: string;
}

export interface AccountInvitationEmailPayload {
  organizationName: string;
  expiresAt: string;
}

export interface PasswordResetRequestedEmailPayload {
  expiresAt: string;
}

export interface CommercialPaymentEmailPayload {
  companyName: string;
  paymentReference: string;
  amountMinor: string;
  currency: string;
  occurredAt: string;
}

export interface CommercialInvoiceEmailPayload {
  companyName: string;
  invoiceNumber: string;
  totalMinor: string;
  currency: string;
  issuedAt: string;
  dueAt: string | null;
}

export interface CommercialSubscriptionActivatedEmailPayload {
  companyName: string;
  subscriptionReference: string;
  planName: string;
  activatedAt: string;
  periodStart: string;
  periodEnd: string;
}

export interface CommercialSubscriptionExpiredEmailPayload {
  companyName: string;
  subscriptionReference: string;
  expiredAt: string;
}

export interface CommercialRenewalPeriodEmailPayload {
  companyName: string;
  renewalReference: string;
  periodStart: string;
  periodEnd: string;
}

export interface CommercialRenewalBlockedEmailPayload {
  companyName: string;
  renewalReference: string;
  blockedReason: string;
}

export interface EmailEventPayloadMap {
  [NotificationType.ALERT_OPENED]: MonitoringEmailPayload;
  [NotificationType.ALERT_REOPENED]: MonitoringEmailPayload;
  [NotificationType.ALERT_ACKNOWLEDGED]: MonitoringEmailPayload;
  [NotificationType.ALERT_RESOLVED]: MonitoringEmailPayload;
  [NotificationType.ALERT_AUTO_RESOLVED]: MonitoringEmailPayload;
  [NotificationType.PASSWORD_CHANGED]: PasswordChangedEmailPayload;
  [NotificationType.ACCOUNT_STATUS_CHANGED]: AccountStatusChangedEmailPayload;
  [NotificationType.LEAVE_APPROVED]: LeaveDecisionEmailPayload;
  [NotificationType.LEAVE_REJECTED]: LeaveDecisionEmailPayload;
  [NotificationType.LEAVE_APPLIED]: LeaveAppliedEmailPayload;
  [NotificationType.LEAVE_CANCELLED]: LeaveCancelledEmailPayload;
  [NotificationType.ATTENDANCE_CORRECTION_APPROVED]: AttendanceCorrectionDecisionEmailPayload;
  [NotificationType.ATTENDANCE_CORRECTION_REJECTED]: AttendanceCorrectionDecisionEmailPayload;
  [NotificationType.ATTENDANCE_CORRECTION_APPLIED]: AttendanceCorrectionAppliedEmailPayload;
  [NotificationType.ACCOUNT_INVITATION]: AccountInvitationEmailPayload;
  [NotificationType.PASSWORD_RESET_REQUESTED]: PasswordResetRequestedEmailPayload;
  [NotificationType.PAYMENT_CAPTURED]: CommercialPaymentEmailPayload;
  [NotificationType.PAYMENT_FAILED]: CommercialPaymentEmailPayload;
  [NotificationType.INVOICE_ISSUED]: CommercialInvoiceEmailPayload;
  [NotificationType.SUBSCRIPTION_ACTIVATED]: CommercialSubscriptionActivatedEmailPayload;
  [NotificationType.SUBSCRIPTION_EXPIRED]: CommercialSubscriptionExpiredEmailPayload;
  [NotificationType.RENEWAL_APPLIED]: CommercialRenewalPeriodEmailPayload;
  [NotificationType.RENEWAL_BLOCKED]: CommercialRenewalBlockedEmailPayload;
  [NotificationType.RENEWAL_PREPARED]: CommercialRenewalPeriodEmailPayload;
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
