import type { Employee } from '@/features/people/types/employee.types';

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveApprovalHistoryAction = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LeaveType {
  id: string;
  companyId?: string;
  name: string;
  code: string;
  description?: string | null;
  defaultDays?: number | null;
  requiresApproval?: boolean;
  managerCanApprove?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface LeaveTypePayload {
  name: string;
  code: string;
  description?: string;
  defaultDays?: number;
  requiresApproval?: boolean;
  managerCanApprove?: boolean;
}

export interface LeaveTypeFormValues {
  name: string;
  code: string;
  description: string;
  defaultDays: number;
  requiresApproval: boolean;
  managerCanApprove: boolean;
}

export interface LeaveRequestUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface LeaveRequestApproverEmployee {
  id: string;
  employeeCode?: string | null;
  user?: LeaveRequestUser | null;
}

export interface LeaveRequest {
  id: string;
  companyId?: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays?: number | null;
  reason?: string | null;
  status: LeaveRequestStatus;
  approverId?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  employee?: Pick<Employee, 'id' | 'employeeCode' | 'user'> | null;
  leaveType?: LeaveType | null;
  approver?: LeaveRequestApproverEmployee | null;
  requestedBy?: LeaveRequestUser | null;
  reviewedBy?: LeaveRequestUser | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface LeaveApprovalHistory {
  id: string;
  leaveRequestId: string;
  action: LeaveApprovalHistoryAction;
  actorUserId?: string | null;
  actor?: LeaveRequestUser | null;
  comment?: string | null;
  createdAt: string;
}

export interface LeaveBalance {
  id: string;
  companyId?: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allocated: number;
  used: number;
  remaining: number;
  pending?: number | null;
  employee?: Pick<Employee, 'id' | 'employeeCode' | 'user'> | null;
  leaveType?: LeaveType | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveRequestListParams {
  page: number;
  limit: number;
  search?: string;
  employeeId?: string;
  leaveTypeId?: string;
  status?: LeaveRequestStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface LeaveBalanceListParams {
  page: number;
  limit: number;
  search?: string;
  employeeId?: string;
  leaveTypeId?: string;
  year?: number;
}

export interface LeaveTypeListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateLeaveRequestPayload {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ReviewLeaveRequestPayload {
  status: 'APPROVED' | 'REJECTED';
  comment?: string;
}
