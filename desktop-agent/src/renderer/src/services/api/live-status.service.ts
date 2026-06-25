import type { LiveStatusResponse } from '../../types/api';
import { apiClient } from './api-client';

export const liveStatusService = {
  getByEmployee: (employeeId: string) =>
    apiClient.request<LiveStatusResponse>(`/monitoring/live-status/${employeeId}`),
};
