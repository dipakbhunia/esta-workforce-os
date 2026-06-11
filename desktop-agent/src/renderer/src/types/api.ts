export type RoleName =
  | 'SUPER_ADMIN'
  | 'COMPANY_ADMIN'
  | 'HR'
  | 'MANAGER'
  | 'EMPLOYEE';

export interface AuthUser {
  id: string;
  companyId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: RoleName[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  user: AuthUser;
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

export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  user: AuthUser;
  company: { id: string; name: string; slug: string };
}

export interface AttendanceRecord {
  id: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT';
  breaks: Array<{ id: string; startedAt: string; endedAt: string | null }>;
}

export interface RegisteredDevice {
  id: string;
  deviceIdentifier: string;
  deviceName: string;
  platform: string;
  status: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  lastSeenAt: string | null;
}
