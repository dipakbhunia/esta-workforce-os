import { http } from '@/services/http';
import type { CreateManagedUserRequest, ManagedRole, ManagedUser, ManagedUserMutationResult, PaginatedResponse, UserListParams } from '../types/user.types';

export function getUsers(params: UserListParams) {
  return http.get<PaginatedResponse<ManagedUser>>('/users', { params });
}

export function getManageableRoles() {
  return http.get<PaginatedResponse<ManagedRole>>('/roles', { params: { page: 1, limit: 100 } });
}

export function inviteUser(request: CreateManagedUserRequest) {
  return http.post<ManagedUserMutationResult>('/users', request);
}
