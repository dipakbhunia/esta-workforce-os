import { http } from '@/services/http';
import type { CompanyStorageSummary, StorageUsageListParams, StorageUsageResponse } from './storage-usage.types';

export const getStorageUsage = (params: StorageUsageListParams) =>
  http.get<StorageUsageResponse>('/storage-usage', { params });

export const getCompanyStorageUsage = (companyId: string) =>
  http.get<CompanyStorageSummary>(`/storage-usage/companies/${companyId}`);
