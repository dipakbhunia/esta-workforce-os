import { http } from '@/services/http';
import type { PlatformRenewalDetails, PlatformRenewalListQuery, PlatformRenewalListResponse, PreparePlatformRenewalResult, RecoverPlatformRenewalResult } from './platform-renewals.types';

const LIST_PARAMETERS = ['page', 'limit', 'companyId', 'subscriptionId', 'paymentId', 'status', 'billingInterval', 'from', 'to'] as const;
export const platformRenewalKeys = { all: ['platform-renewals'] as const, list: (query: PlatformRenewalListQuery) => [...platformRenewalKeys.all, 'list', query] as const, details: (renewalId: string) => [...platformRenewalKeys.all, 'details', renewalId] as const };
export function listPlatformRenewals(query: PlatformRenewalListQuery) {
  const params = Object.fromEntries(LIST_PARAMETERS.map(key => [key, query[key]] as const).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return http.get<PlatformRenewalListResponse>('/platform/renewals', { params });
}
export const getPlatformRenewal = (renewalId: string) => http.get<PlatformRenewalDetails>(`/platform/renewals/${encodeURIComponent(renewalId)}`);
export const preparePlatformRenewal = (subscriptionId: string) => http.post<PreparePlatformRenewalResult>(`/platform/renewals/subscriptions/${encodeURIComponent(subscriptionId)}/prepare`);
export const recoverPlatformRenewal = (renewalId: string) => http.post<RecoverPlatformRenewalResult>(`/platform/renewals/${encodeURIComponent(renewalId)}/recover`);
