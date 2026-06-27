import type { Branch } from './branch.types';

export interface Department {
  id: string;
  companyId: string;
  branchId?: string | null;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code' | 'address'> | null;
  _count?: {
    employees?: number;
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

export interface DepartmentListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface DepartmentPayload {
  name: string;
  code: string;
  branchId?: string;
}

export interface DepartmentFormValues {
  name: string;
  code: string;
  branchId: string;
}
