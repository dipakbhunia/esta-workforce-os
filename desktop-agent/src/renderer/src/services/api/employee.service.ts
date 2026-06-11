import type {
  AuthUser,
  EmployeeProfile,
  PaginatedResponse,
} from '../../types/api';
import { apiClient } from './api-client';

export const employeeService = {
  async getCurrent(user: AuthUser): Promise<EmployeeProfile | null> {
    const response = await apiClient.request<PaginatedResponse<EmployeeProfile>>(
      '/employees?limit=100',
    );
    return response.data.find((employee) => employee.user.id === user.id) ?? null;
  },
};
