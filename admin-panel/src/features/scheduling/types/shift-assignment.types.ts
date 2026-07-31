import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';

export type ShiftAssignmentStatus = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'CANCELLED';
export type ShiftAssignmentType = 'PERMANENT' | 'TEMPORARY' | 'ROTATIONAL' | 'MANUAL_OVERRIDE';
export type AssignmentSource = 'EMPLOYEE_PROFILE' | 'SHIFT_ASSIGNMENT' | 'ROSTER' | 'SYSTEM' | 'IMPORT';

export interface ShiftAssignmentUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ShiftAssignmentEmployee {
  id: string;
  employeeCode: string;
  displayName?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  department?: { id: string; name: string } | null;
  designation?: { id: string; name: string } | null;
  user?: ShiftAssignmentUser | null;
}

export interface ShiftAssignmentShift {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface ShiftAssignment {
  id: string;
  companyId: string;
  employeeId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: ShiftAssignmentStatus;
  assignmentType: ShiftAssignmentType;
  source: AssignmentSource;
  reason?: string | null;
  notes?: string | null;
  employee?: ShiftAssignmentEmployee | null;
  shift?: ShiftAssignmentShift | null;
  createdBy?: ShiftAssignmentUser | null;
  updatedBy?: ShiftAssignmentUser | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ShiftAssignmentListParams {
  page: number;
  limit: number;
  search?: string;
  employeeId?: string;
  shiftId?: string;
  branchId?: string;
  departmentId?: string;
  designationId?: string;
  status?: ShiftAssignmentStatus;
  assignmentType?: ShiftAssignmentType;
  effectiveAt?: string;
}

export interface ShiftAssignmentPayload {
  employeeId: string;
  shiftId: string;
  assignmentType?: ShiftAssignmentType;
  effectiveFrom: string;
  effectiveTo?: string;
  reason?: string;
  notes?: string;
}

export interface ShiftAssignmentFormValues {
  employeeId: string;
  shiftId: string;
  assignmentType: ShiftAssignmentType;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  notes: string;
}

export type EmployeeLookup = Pick<Employee, 'id' | 'employeeCode' | 'user' | 'department' | 'designation' | 'shift'>;
export type ShiftLookup = Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'>;
