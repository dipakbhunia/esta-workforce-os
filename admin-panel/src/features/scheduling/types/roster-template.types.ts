import type { Branch } from '@/features/organization/types/branch.types';
import type { Department } from '@/features/organization/types/department.types';
import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';
import type { PaginatedResponse, RosterPreviewResponse, ShiftRosterPeriod } from './shift-roster.types';

export type RosterTemplateScope = 'COMPANY' | 'BRANCH' | 'DEPARTMENT';
export type RosterTemplateDayType = 'WORKING' | 'WEEKLY_OFF' | 'NO_SHIFT';
export type RosterTemplateOverwriteMode = 'EMPTY_ONLY' | 'REPLACE_SELECTED';

export interface RosterTemplateDay {
  id: string;
  templateId: string;
  companyId: string;
  sequence: number;
  dayOfWeek: number;
  dayType: RosterTemplateDayType;
  shiftId?: string | null;
  shiftName?: string | null;
  shiftCode?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  shiftTimezone?: string | null;
  notes?: string | null;
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface RosterTemplate {
  id: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  timezone: string;
  enabled: boolean;
  version: number;
  notes?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: (Pick<Department, 'id' | 'name' | 'code'> & { branchId?: string | null }) | null;
  days?: RosterTemplateDay[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface RosterTemplateSummary {
  total: number;
  active: number;
  inactive: number;
  companyScope: number;
  branchScope: number;
  departmentScope: number;
}

export interface RosterTemplateListResponse extends PaginatedResponse<RosterTemplate> {
  summary?: RosterTemplateSummary;
}

export interface RosterTemplateListParams {
  page: number;
  limit: number;
  search?: string;
  enabled?: boolean;
  scope?: RosterTemplateScope;
  branchId?: string;
  departmentId?: string;
  timezone?: string;
}

export interface RosterTemplateDayPayload {
  sequence: number;
  dayOfWeek: number;
  dayType: RosterTemplateDayType;
  shiftId?: string | null;
  notes?: string | null;
}

export interface RosterTemplatePayload {
  name: string;
  code: string;
  description?: string;
  timezone: string;
  enabled: boolean;
  branchId?: string | null;
  departmentId?: string | null;
  notes?: string;
  days: RosterTemplateDayPayload[];
}

export interface RosterTemplateFormValues {
  name: string;
  code: string;
  description: string;
  timezone: string;
  enabled: boolean;
  scope: RosterTemplateScope;
  branchId: string;
  departmentId: string;
  notes: string;
  days: RosterTemplateDayPayload[];
}

export interface ApplyRosterTemplatePayload {
  templateId: string;
  employeeIds: string[];
  dateFrom: string;
  dateTo: string;
  overwriteMode: RosterTemplateOverwriteMode;
}

export interface ApplyRosterTemplateResponse {
  appliedCount: number;
  skippedCount: number;
  employeeCount: number;
  dateCount: number;
}

export interface RosterTemplateApplyDialogContext {
  roster?: ShiftRosterPeriod | null;
  template?: RosterTemplate | null;
  employees?: Employee[];
}

export type { RosterPreviewResponse };
