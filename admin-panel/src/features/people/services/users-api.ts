import { http } from '@/services/http';
import type { ManagedUser, PaginatedResponse, UserListParams } from '../types/user.types';

export function getUsers(params: UserListParams) {
  return http.get<PaginatedResponse<ManagedUser>>('/users', { params });
}
