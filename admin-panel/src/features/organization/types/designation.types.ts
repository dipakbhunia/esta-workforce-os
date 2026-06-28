import type { Department } from './department.types';

export interface Designation {
  id: string;
  companyId: string;
  departmentId?: string | null;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  department?: Pick<Department, 'id' | 'name' | 'code'> | null;
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

export interface DesignationListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface DesignationPayload {
  name: string;
  code: string;
  departmentId?: string;
}

export interface DesignationFormValues {
  name: string;
  code: string;
  departmentId: string;
}
