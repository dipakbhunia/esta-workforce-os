import type { Branch } from '@/features/organization/types/branch.types';
import type { Department } from '@/features/organization/types/department.types';
import type { PaginatedResponse } from './shift-roster.types';

export type WeeklyOffRuleType = 'FIXED_WEEKDAYS';
export type WeeklyOffRuleScope = 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'EMPLOYEE';

export interface WeeklyOffRuleUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface WeeklyOffRuleEmployee {
  id: string;
  employeeCode: string;
  branchId?: string | null;
  departmentId?: string | null;
  user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: Pick<Department, 'id' | 'name' | 'code'> | null;
}

export interface WeeklyOffRule {
  id: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  employeeId?: string | null;
  name: string;
  timezone: string;
  ruleType: WeeklyOffRuleType;
  weekdays: number[] | { weekdays?: number[] };
  alternateWeekPattern?: unknown | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  priority: number;
  enabled: boolean;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: Pick<Department, 'id' | 'name' | 'code' | 'branchId'> | null;
  employee?: WeeklyOffRuleEmployee | null;
  createdBy?: WeeklyOffRuleUser | null;
  updatedBy?: WeeklyOffRuleUser | null;
}

export interface WeeklyOffRuleSummary {
  total: number;
  active: number;
  inactive: number;
  companyScope: number;
  branchScope: number;
  departmentScope: number;
  employeeScope: number;
}

export interface WeeklyOffRuleListResponse extends PaginatedResponse<WeeklyOffRule> {
  summary?: WeeklyOffRuleSummary;
}

export interface WeeklyOffRuleListParams {
  page: number;
  limit: number;
  search?: string;
  enabled?: boolean;
  scope?: WeeklyOffRuleScope;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  ruleType?: WeeklyOffRuleType;
  day?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface WeeklyOffRulePayload {
  name: string;
  timezone?: string;
  ruleType?: WeeklyOffRuleType;
  weekdays: number[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  employeeId?: string | null;
  priority?: number;
  enabled?: boolean;
}

export interface WeeklyOffRuleFormValues {
  name: string;
  enabled: boolean;
  scope: WeeklyOffRuleScope;
  branchId: string;
  departmentId: string;
  employeeId: string;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string;
  weekdays: number[];
  saturdayPattern: 'NONE' | 'EVERY';
  priority: number;
}