import { http } from '@/services/http';
import type {
  CompanySeatDetails,
  UsageSeatsListParams,
  UsageSeatsResponse,
} from './usage-seats.types';

export const getUsageSeats = (params: UsageSeatsListParams) =>
  http.get<UsageSeatsResponse>('/usage-seats', { params });

export const getCompanySeatUsage = (
  companyId: string,
  params: { page?: number; limit?: number; search?: string } = {},
) =>
  http.get<CompanySeatDetails>(`/usage-seats/companies/${companyId}`, {
    params,
  });
