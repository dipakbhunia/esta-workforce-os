import { http } from '@/services/http';
import type { PlatformDunningDetails, PlatformDunningListQuery, PlatformDunningListResponse } from './platform-dunning.types';

const LIST_PARAMETERS = ['page', 'limit', 'companyId', 'subscriptionId', 'renewalId', 'paymentId', 'paymentStatus', 'from', 'to'] as const;

export const platformDunningKeys = {
  all: ['platform-dunning'] as const,
  list: (query: PlatformDunningListQuery) => [...platformDunningKeys.all, 'list', query] as const,
  details: (renewalId: string) => [...platformDunningKeys.all, 'details', renewalId] as const,
};

export function listPlatformDunning(query: PlatformDunningListQuery) {
  const params = Object.fromEntries(LIST_PARAMETERS.map(key => [key, query[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return http.get<PlatformDunningListResponse>('/platform/dunning', { params });
}

export const getPlatformDunning = (renewalId: string) => http.get<PlatformDunningDetails>(`/platform/dunning/${encodeURIComponent(renewalId)}`);
