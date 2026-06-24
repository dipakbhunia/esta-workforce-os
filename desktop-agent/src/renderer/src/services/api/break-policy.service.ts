import type { BreakPolicy, PaginatedResponse } from '../../types/api';
import { apiClient } from './api-client';

export const breakPolicyService = {
  async listActive(): Promise<BreakPolicy[]> {
    const response = await apiClient.request<PaginatedResponse<BreakPolicy>>(
      '/break-policies?isActive=true&limit=100',
    );
    return response.data;
  },
};
