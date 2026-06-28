import type { Branch } from '@/features/organization/types/branch.types';
import type { Department } from '@/features/organization/types/department.types';
import type { Designation } from '@/features/organization/types/designation.types';
import type { Shift } from '@/features/organization/types/shift.types';
import type { RoleName, UserStatus } from '@/features/auth';

export interface ManagedUser {
  id: string;
  companyId: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  shiftId?: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: Pick<Department, 'id' | 'name' | 'code'> | null;
  designation?: Pick<Designation, 'id' | 'name' | 'code'> | null;
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null;
  employee?: unknown | null;
  _count?: {
    employee?: number;
    employees?: number;
  };
  roles?: Array<{
    role?: {
      id: string;
      systemName: RoleName;
      name?: string;
    };
  }>;
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

export interface UserListParams {
  page: number;
  limit: number;
  search?: string;
  status?: UserStatus;
}
