export type RoleName = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface AuthUser {
  id: string;
  companyId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: RoleName[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

export type Permission =
  | 'dashboard:view'
  | 'companies:manage'
  | 'branches:manage'
  | 'branches:view'
  | 'organization:manage'
  | 'people:manage'
  | 'attendance:view'
  | 'attendance:manage'
  | 'leave:view'
  | 'leave:manage'
  | 'monitoring:view'
  | 'reports:view'
  | 'settings:view';
