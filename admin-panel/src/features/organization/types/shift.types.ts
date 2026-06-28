export interface Shift {
  id: string;
  companyId: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  timezone?: string | null;
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

export interface ShiftListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface ShiftPayload {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface ShiftFormValues {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  timezone: string;
  graceTime: string;
  halfDayRule: string;
  overtimeRule: string;
  lateMarkRule: string;
}
