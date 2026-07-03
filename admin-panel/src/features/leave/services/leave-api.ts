import { http } from '@/services/http';
import type {
  CreateLeaveRequestPayload,
  LeaveApprovalHistory,
  LeaveBalance,
  LeaveBalanceListParams,
  LeaveRequest,
  LeaveRequestListParams,
  LeaveType,
  LeaveTypeListParams,
  LeaveTypePayload,
  PaginatedResponse,
  ReviewLeaveRequestPayload,
} from '../types/leave.types';

export function getLeaveTypes(params: LeaveTypeListParams = {}) {
  return http.get<PaginatedResponse<LeaveType>>('/leave-types', { params });
}

export function createLeaveType(payload: LeaveTypePayload) {
  return http.post<LeaveType>('/leave-types', payload);
}

export function updateLeaveType(id: string, payload: LeaveTypePayload) {
  return http.patch<LeaveType>(`/leave-types/${id}`, payload);
}

export function deleteLeaveType(id: string) {
  return http.delete<LeaveType>(`/leave-types/${id}`);
}

export function getLeaveRequests(params: LeaveRequestListParams) {
  return http.get<PaginatedResponse<LeaveRequest>>('/leave-requests', { params });
}

export function getLeaveRequest(id: string) {
  return http.get<LeaveRequest>(`/leave-requests/${id}`);
}

export function createLeaveRequest(payload: CreateLeaveRequestPayload) {
  return http.post<LeaveRequest>('/leave-requests', payload);
}

export function reviewLeaveRequest(id: string, payload: ReviewLeaveRequestPayload) {
  return http.patch<LeaveRequest>(`/leave-requests/${id}/status`, payload);
}

export function cancelLeaveRequest(id: string) {
  return http.patch<LeaveRequest>(`/leave-requests/${id}/cancel`);
}

export function getLeaveRequestHistory(id: string) {
  return http.get<LeaveApprovalHistory[]>(`/leave-requests/${id}/history`);
}

export function getLeaveBalances(params: LeaveBalanceListParams) {
  return http.get<PaginatedResponse<LeaveBalance>>('/leave-balances', { params });
}

export function getEmployeeLeaveBalances(employeeId: string) {
  return http.get<PaginatedResponse<LeaveBalance>>(`/leave-balances/${employeeId}`);
}
