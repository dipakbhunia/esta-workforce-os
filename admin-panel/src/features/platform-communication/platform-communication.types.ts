export const EMAIL_DELIVERY_STATUSES = ['PENDING', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export const EMAIL_EVENT_TYPES = ['ALERT_OPENED', 'ALERT_REOPENED', 'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_AUTO_RESOLVED'] as const;
export type EmailDeliveryStatus = typeof EMAIL_DELIVERY_STATUSES[number];
export type EmailEventType = typeof EMAIL_EVENT_TYPES[number];

export interface EmailCapability {
  enabled: boolean;
  configured: boolean;
  fromEmailConfigured: boolean;
}

export type SmtpSecurityMode = 'PLAIN' | 'STARTTLS' | 'TLS';
export type SmtpConfigurationLifecycle = 'DRAFT' | 'VALIDATED' | 'TESTED' | 'ACTIVE' | 'REVOKED';

export interface SmtpConfigurationVersion {
  id: string;
  version: number;
  lifecycle: SmtpConfigurationLifecycle;
  host: string;
  port: number;
  securityMode: SmtpSecurityMode;
  username: string;
  senderEmail: string;
  senderDisplayName: string;
  revision: number;
  passwordConfigured: boolean;
  structurallyValidatedAt: string | null;
  connectionTestedAt: string | null;
  connectionTestSucceeded: boolean | null;
  restrictedTestEmailSentAt: string | null;
  firstActivatedAt: string | null;
  lastActivatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformEmailSettings {
  enabled: boolean;
  revision: number;
  activeConfigurationVersionId: string | null;
  databaseAuthorityEstablishedAt: string | null;
  updatedAt: string | null;
}

export interface SmtpConfigurationResponse {
  settings: PlatformEmailSettings;
  latestVersion: SmtpConfigurationVersion | null;
}

export interface SmtpConfigurationHistoryResponse {
  data: SmtpConfigurationVersion[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SmtpConfigurationDraftPayload {
  host: string;
  port: number;
  securityMode: SmtpSecurityMode;
  username: string;
  password: string;
  senderEmail: string;
  senderDisplayName: string;
}

export interface PlatformEmailDelivery {
  deliveryId: string;
  notificationId: string;
  companyId: string | null;
  recipientUserId: string;
  eventType: EmailEventType;
  channel: 'EMAIL';
  status: EmailDeliveryStatus;
  recipient: string;
  attemptCount: number;
  isClaimed: boolean;
  claimExpiresAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  safeErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDeliveryQuery {
  page: number;
  limit: number;
  status?: EmailDeliveryStatus;
  companyId?: string;
  recipient?: string;
  eventType?: EmailEventType;
  from?: string;
  to?: string;
}

export interface EmailDeliveryListResponse {
  data: PlatformEmailDelivery[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type EmailTemplateLifecycle = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export interface EmailTemplateVersion {
  id: string; templateId: string; version: number; lifecycle: EmailTemplateLifecycle;
  subjectTemplate: string; textBodyTemplate: string; placeholderContractVersion: number; revision: number;
  validationResultCode: string | null; validatedAt: string | null; publishedAt: string | null;
  retiredAt: string | null; createdAt: string; updatedAt: string;
}
export interface EmailTemplateCatalogItem {
  templateKey: string; notificationType: string; category: string; allowedVariables: string[];
  optionalVariables: string[]; placeholderContractVersion: number; systemManagedActionLink: boolean;
  configured: boolean; template: null | { id: string; templateKey: string; revision: number;
    activeVersionId: string | null; activeVersion: EmailTemplateVersion | null;
    latestVersion: Pick<EmailTemplateVersion, 'id' | 'version' | 'lifecycle' | 'revision' | 'updatedAt'> | null };
}
export interface EmailTemplateHistoryResponse { data: EmailTemplateVersion[]; meta: { page: number; limit: number; total: number; totalPages: number } }
export interface EmailTemplatePreview { synthetic: true; notificationType: string; templateId: string; versionId: string;
  version: number; lifecycle: EmailTemplateLifecycle; revision: number; subject: string; textBody: string; html: string;
  systemManagedActionLink: boolean; actionLinkIncluded: false }
