import { http } from '@/services/http';
import type { AmendmentPayload, PaginatedSubscriptions, Subscription, SubscriptionActivationSource, SubscriptionPayload, SubscriptionStatus } from './subscription.types';
export const getSubscriptions = (params: { page: number; limit: number; search?: string; status?: SubscriptionStatus; companyId?: string; planId?: string; activationSource?: SubscriptionActivationSource }) => http.get<PaginatedSubscriptions>('/subscriptions', { params });
export const getSubscription = (id: string) => http.get<Subscription>(`/subscriptions/${id}`);
export const createSubscription = (payload: SubscriptionPayload) => http.post<Subscription>('/subscriptions', payload);
export const runSubscriptionAction = (id: string, action: 'activate' | 'suspend' | 'resume' | 'cancel' | 'expire') => http.post<Subscription>(`/subscriptions/${id}/${action}`);
export const amendSubscription = (id: string, payload: AmendmentPayload) => http.post<Subscription>(`/subscriptions/${id}/amend`, payload);
