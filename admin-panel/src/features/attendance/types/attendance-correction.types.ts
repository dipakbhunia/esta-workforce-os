import type { RoleName } from '@/features/auth';
import type { PaginatedResponse } from '@/features/people/types/employee.types';

export type AttendanceCorrectionType =
  | 'MISSED_PUNCH_IN'
  | 'MISSED_PUNCH_OUT'
  | 'TIME_CORRECTION'
  | 'FULL_DAY_REGULARIZATION';

export type AttendanceCorrectionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface AttendanceCorrectionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AttendanceCorrectionEmployee {
  id: string;
  employeeCode: string;
  user?: AttendanceCorrectionUser | null;
}

export interface AttendanceCorrectionAttendance {
  id: string;
  attendanceDate: string;
  punchInAt?: string | null;
  punchOutAt?: string | null;
}

export interface AttendanceCorrectionRequest {
  id: string;
  companyId: string;
  attendanceId: string;
  employeeId: string;
  requestedByUserId: string;
  reviewedByUserId?: string | null;
  type: AttendanceCorrectionType;
  status: AttendanceCorrectionStatus;
  originalPunchInAt?: string | null;
  originalPunchOutAt?: string | null;
  requestedPunchInAt?: string | null;
  requestedPunchOutAt?: string | null;
  reason: string;
  reviewerComment?: string | null;
  reviewedAt?: string | null;
  employee?: AttendanceCorrectionEmployee | null;
  attendance?: AttendanceCorrectionAttendance | null;
  requestedBy?: AttendanceCorrectionUser | null;
  reviewedBy?: AttendanceCorrectionUser | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceCorrectionListParams {
  page: number;
  limit: number;
  search?: string;
  status?: AttendanceCorrectionStatus;
  type?: AttendanceCorrectionType;
  employeeId?: string;
  attendanceId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateAttendanceCorrectionPayload {
  attendanceId: string;
  type: AttendanceCorrectionType;
  reason: string;
  requestedPunchInAt?: string;
  requestedPunchOutAt?: string;
}

export interface ReviewAttendanceCorrectionPayload {
  status: 'APPROVED' | 'REJECTED';
  reviewerComment?: string;
}

export type AttendanceCorrectionListResponse = PaginatedResponse<AttendanceCorrectionRequest>;

export function canReviewCorrections(roles: RoleName[]) {
  return roles.some((role) => ['COMPANY_ADMIN', 'HR', 'MANAGER'].includes(role));
}

export function canCreateCorrections(roles: RoleName[]) {
  return roles.some((role) => ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'].includes(role));
}
