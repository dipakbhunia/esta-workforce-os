export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED';

export interface Company {
  id: string;
  name: string;
  slug: string;
  primaryEmail: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  timezone: string;
  currency: string | null;
  address: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  counts: {
    branches: number;
    departments: number;
    designations: number;
    employees: number;
    users: number;
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
  status?: CompanyStatus;
}

export interface CompanyPayload {
  name: string;
  slug: string;
  primaryEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  country?: string | null;
  timezone?: string;
  currency?: string | null;
  address?: string | null;
  status: CompanyStatus;
}

export interface CompanyFormValues {
  name: string;
  slug: string;
  status: CompanyStatus;
  primaryEmail: string;
  phone: string;
  website: string;
  country: string;
  timezone: string;
  currency: string;
  address: string;
}
