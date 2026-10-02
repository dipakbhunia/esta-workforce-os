import { http } from '@/services/http';
import type {
  EmailCapability,
  EmailDeliveryListResponse,
  EmailDeliveryQuery,
  PlatformEmailDelivery,
} from './platform-communication.types';

const PARAMS = ['page', 'limit', 'status', 'companyId', 'recipient', 'eventType', 'from', 'to'] as const;
export const platformCommunicationKeys = {
  capability: ['platform-communication', 'email-capability'] as const,
  list: (query: EmailDeliveryQuery) => ['platform-communication', 'email-deliveries', query] as const,
  detail: (id: string) => ['platform-communication', 'email-deliveries', 'detail', id] as const,
};
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
