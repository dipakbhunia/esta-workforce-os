export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED';

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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

export interface CompanyListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface CompanyPayload {
  name: string;
  slug: string;
  status: CompanyStatus;
}

export interface CompanyFormValues {
  name: string;
  slug: string;
  status: CompanyStatus;
  email: string;
  phone: string;
  website: string;
  country: string;
  timezone: string;
  currency: string;
  address: string;
}
