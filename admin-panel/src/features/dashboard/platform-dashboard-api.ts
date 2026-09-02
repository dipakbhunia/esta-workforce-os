import { http } from '@/services/http';
import type { PlatformDashboardParams, PlatformDashboardResponse } from './platform-dashboard.types';

export const getPlatformDashboard = (params: PlatformDashboardParams = {}) =>
  http.get<PlatformDashboardResponse>('/platform-dashboard', { params });
