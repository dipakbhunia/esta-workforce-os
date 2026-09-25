import { http } from '@/services/http';
import type { PlatformRenewalListQuery, PlatformRenewalListResponse } from './platform-renewals.types';

const LIST_PARAMETERS = ['page', 'limit', 'companyId', 'subscriptionId', 'paymentId', 'status', 'billingInterval', 'from', 'to'] as const;
export const platformRenewalKeys = { all: ['platform-renewals'] as const, list: (query: PlatformRenewalListQuery) => [...platformRenewalKeys.all, 'list', query] as const };
export function listPlatformRenewals(query: PlatformRenewalListQuery) {
  const params = Object.fromEntries(LIST_PARAMETERS.map(key => [key, query[key]] as const).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return http.get<PlatformRenewalListResponse>('/platform/renewals', { params });
}
