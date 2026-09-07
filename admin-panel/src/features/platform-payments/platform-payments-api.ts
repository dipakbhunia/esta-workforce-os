import { http } from '@/services/http';
import type { PlatformPaymentDetails, PlatformPaymentListQuery, PlatformPaymentListResponse } from './platform-payments.types';

export function listPlatformPayments(query: PlatformPaymentListQuery) {
  const params = Object.fromEntries(
    (['page', 'limit', 'companyId', 'status', 'provider', 'mode', 'purpose', 'subscriptionId', 'from', 'to'] as const)
      .map((key) => [key, query[key]] as const)
      .filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
  return http.get<PlatformPaymentListResponse>('/platform-payments', { params });
}

export const getPlatformPayment = (id: string) =>
  http.get<PlatformPaymentDetails>(`/platform-payments/${id}`);
