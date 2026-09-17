import { http } from '@/services/http';
import type { CreateGstPolicyRequest, GstEvidence, GstPolicy, GstPolicyQuery, GstTransactionQuery, PageResponse } from './platform-gst.types';

export const platformGstKeys = {
  all: ['platform-gst'] as const,
  policies: (query?: GstPolicyQuery) => [...platformGstKeys.all, 'policies', query ?? 'all'] as const,
  policy: (id: string) => [...platformGstKeys.all, 'policy', id] as const,
  transactions: (query?: GstTransactionQuery) => [...platformGstKeys.all, 'transactions', query ?? 'all'] as const,
  transaction: (id: string) => [...platformGstKeys.all, 'transaction', id] as const,
};
const compact = <T extends object>(query: T) => Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''));
export const listGstPolicies = (query: GstPolicyQuery) => http.get<PageResponse<GstPolicy>>('/platform/gst/policies', { params: compact(query) });
export const getGstPolicy = (id: string) => http.get<GstPolicy>(`/platform/gst/policies/${id}`);
export const createGstPolicy = (request: CreateGstPolicyRequest) => http.post<GstPolicy>('/platform/gst/policies', request);
export const listGstTransactions = (query: GstTransactionQuery) => http.get<PageResponse<GstEvidence>>('/platform/gst/transactions', { params: compact(query) });
export const getGstTransaction = (id: string) => http.get<GstEvidence>(`/platform/gst/transactions/${id}`);
