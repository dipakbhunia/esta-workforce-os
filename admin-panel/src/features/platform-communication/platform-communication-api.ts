import { http } from '@/services/http';
import type {
  EmailCapability,
  EmailDeliveryListResponse,
  EmailDeliveryQuery,
  PlatformEmailDelivery,
} from './platform-communication.types';
import type { SmtpConfigurationDraftPayload, SmtpConfigurationHistoryResponse, SmtpConfigurationResponse, SmtpConfigurationVersion } from './platform-communication.types';
import type { EmailTemplateCatalogItem, EmailTemplateHistoryResponse, EmailTemplatePreview, EmailTemplateVersion } from './platform-communication.types';
import type { PlatformInvitationBootstrapEligibility, PlatformInvitationBootstrapResult } from './platform-communication.types';

const PARAMS = ['page', 'limit', 'status', 'companyId', 'recipient', 'eventType', 'from', 'to'] as const;
export const platformCommunicationKeys = {
  capability: ['platform-communication', 'email-capability'] as const,
  list: (query: EmailDeliveryQuery) => ['platform-communication', 'email-deliveries', query] as const,
  detail: (id: string) => ['platform-communication', 'email-deliveries', 'detail', id] as const,
  configuration: ['platform-communication', 'email-configuration'] as const,
  configurationVersions: ['platform-communication', 'email-configuration', 'versions'] as const,
  invitationEligibility: (targetUserId: string) => ['platform-communication', 'platform-invitations', targetUserId, 'bootstrap-eligibility'] as const,
  templates: ['platform-communication', 'email-templates'] as const,
  templateVersions: (type: string) => ['platform-communication', 'email-templates', type, 'versions'] as const,
};

export const getSmtpConfiguration = () =>
  http.get<SmtpConfigurationResponse>('/platform-communication/email-configuration');

export const listSmtpConfigurationVersions = () =>
  http.get<SmtpConfigurationHistoryResponse>('/platform-communication/email-configuration/versions', { params: { page: 1, limit: 100 } });

export const createSmtpConfigurationDraft = (payload: SmtpConfigurationDraftPayload) =>
  http.post<SmtpConfigurationVersion>('/platform-communication/email-configuration/versions', payload);

export const updateSmtpConfigurationDraft = (id: string, payload: Partial<SmtpConfigurationDraftPayload> & { revision: number }) =>
  http.patch<SmtpConfigurationVersion>(`/platform-communication/email-configuration/versions/${encodeURIComponent(id)}`, payload);

export const runSmtpConfigurationAction = (id: string, action: 'validate' | 'test-connection' | 'test-email', revision: number) =>
  http.post(`/platform-communication/email-configuration/versions/${encodeURIComponent(id)}/${action}`, { revision });

export const selectSmtpConfiguration = (id: string, action: 'activate' | 'rollback', settingsRevision: number, targetRevision: number) =>
  http.post(`/platform-communication/email-configuration/versions/${encodeURIComponent(id)}/${action}`, { settingsRevision, targetRevision });

export const toggleDatabaseSmtp = (action: 'enable' | 'disable', settingsRevision: number) =>
  http.post(`/platform-communication/email-configuration/${action}`, { settingsRevision });

export const getPlatformInvitationBootstrapEligibility = (targetUserId: string) =>
  http.get<PlatformInvitationBootstrapEligibility>(`/platform-communication/platform-invitations/users/${encodeURIComponent(targetUserId)}/bootstrap-eligibility`);

export const bootstrapPlatformInvitation = (configurationId: string, payload: { revision: number; targetUserId: string; deliveryId: string }) =>
  http.post<PlatformInvitationBootstrapResult>(`/platform-communication/email-configuration/versions/${encodeURIComponent(configurationId)}/bootstrap-platform-invitation`, payload);
export const getEmailCapability = () =>
  http.get<EmailCapability>('/platform-communication/email-capability');

export function listEmailDeliveries(query: EmailDeliveryQuery) {
  const params = Object.fromEntries(
    PARAMS
      .map(key => [key, query[key]])
      .filter(([, value]) => value !== undefined && value !== ''),
  );
  return http.get<EmailDeliveryListResponse>('/platform-communication/email-deliveries', { params });
}

export const getEmailDelivery = (id: string) =>
  http.get<PlatformEmailDelivery>(
    `/platform-communication/email-deliveries/${encodeURIComponent(id)}`,
  );

const templatePath = (type: string) => `/platform-communication/email-templates/${encodeURIComponent(type)}`;
export const listEmailTemplates = () => http.get<EmailTemplateCatalogItem[]>('/platform-communication/email-templates');
export const listEmailTemplateVersions = (type: string) => http.get<EmailTemplateHistoryResponse>(`${templatePath(type)}/versions`, { params: { page: 1, limit: 100 } });
export const createEmailTemplateDraft = (type: string, payload: { templateRevision: number; subjectTemplate: string; textBodyTemplate: string; placeholderContractVersion: 1 }) =>
  http.post<{ templateRevision: number; version: EmailTemplateVersion }>(`${templatePath(type)}/versions`, payload);
export const updateEmailTemplateDraft = (type: string, id: string, payload: { revision: number; subjectTemplate: string; textBodyTemplate: string; placeholderContractVersion: 1 }) =>
  http.patch<EmailTemplateVersion>(`${templatePath(type)}/versions/${encodeURIComponent(id)}`, payload);
export const runEmailTemplateAction = (type: string, id: string, action: 'validate' | 'preview', revision: number) =>
  http.post<EmailTemplateVersion | EmailTemplatePreview>(`${templatePath(type)}/versions/${encodeURIComponent(id)}/${action}`, { revision });
export const selectEmailTemplateVersion = (type: string, id: string, action: 'publish' | 'rollback', templateRevision: number, targetRevision: number) =>
  http.post(`${templatePath(type)}/versions/${encodeURIComponent(id)}/${action}`, { templateRevision, targetRevision });
