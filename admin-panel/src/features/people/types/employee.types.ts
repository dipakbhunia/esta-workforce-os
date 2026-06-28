import type { Branch } from '@/features/organization/types/branch.types';
import type { Department } from '@/features/organization/types/department.types';
import type { Designation } from '@/features/organization/types/designation.types';
import type { Shift } from '@/features/organization/types/shift.types';
import type { UserStatus } from '@/features/auth';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY';
export type WorkMode = 'ONSITE' | 'REMOTE' | 'HYBRID';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED';

export interface EmployeeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
}

export interface Employee {
  id: string;
  userId: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  shiftId?: string | null;
  reportingManagerId?: string | null;
  employeeCode: string;
  joiningDate: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  status: EmployeeStatus;
  phone?: string | null;
  alternatePhone?: string | null;
  personalEmail?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  documents?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  user?: EmployeeUser | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: Pick<Department, 'id' | 'name' | 'code'> | null;
  designation?: Pick<Designation, 'id' | 'name' | 'code'> | null;
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null;
  reportingManager?: {
    id: string;
    employeeCode: string;
    user?: Pick<EmployeeUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  } | null;
  _count?: {
    directReports?: number;
  };
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

export interface EmployeeListParams {
  page: number;
  limit: number;
  search?: string;
  branchId?: string;
  departmentId?: string;
  status?: EmployeeStatus;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
}

export interface EmployeeCreatePayload {
  userId: string;
  employeeCode: string;
  branchId?: string;
  departmentId?: string;
  designationId?: string;
  shiftId?: string;
  reportingManagerId?: string;
  joiningDate: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  status?: EmployeeStatus;
  phone?: string;
  personalEmail?: string;
}

export type EmployeeUpdatePayload = Omit<EmployeeCreatePayload, 'userId'>;

export interface EmployeeFormValues {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  employeeCode: string;
  branchId: string;
  departmentId: string;
  designationId: string;
  shiftId: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  joiningDate: string;
  status: EmployeeStatus;
}
