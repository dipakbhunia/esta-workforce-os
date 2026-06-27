export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  _count?: {
    departments?: number;
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

export interface BranchListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface BranchPayload {
  name: string;
  code: string;
  address?: string;
}

export interface BranchFormValues {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}
