import { http } from '@/services/http';
import type {
  BillingProviderConfiguration,
  BillingProviderPayload,
  BillingProviderUpdatePayload,
  BillingSettings,
  BillingSettingsPayload,
} from './billing-settings.types';

export const getBillingSettings = () =>
  http.get<BillingSettings>('/billing-settings');

export const updateBillingSettings = (payload: BillingSettingsPayload) =>
  http.patch<BillingSettings>('/billing-settings', payload);

export const getBillingProviders = () =>
  http.get<BillingProviderConfiguration[]>('/billing-settings/providers');

export const createBillingProvider = (payload: BillingProviderPayload) =>
  http.post<BillingProviderConfiguration>('/billing-settings/providers', payload);

export const updateBillingProvider = (
  id: string,
  payload: BillingProviderUpdatePayload,
) => http.patch<BillingProviderConfiguration>(`/billing-settings/providers/${id}`, payload);

export const runBillingProviderAction = (
  id: string,
  action: 'enable' | 'disable' | 'default',
) => http.post<BillingProviderConfiguration>(`/billing-settings/providers/${id}/${action}`, {});
