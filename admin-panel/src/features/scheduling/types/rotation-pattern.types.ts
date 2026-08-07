import type { Branch } from '@/features/organization/types/branch.types';
import type { Department } from '@/features/organization/types/department.types';
import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';
import type { PaginatedResponse, ShiftRosterPeriod } from './shift-roster.types';

export type RotationPatternScope = 'COMPANY' | 'BRANCH' | 'DEPARTMENT';
export type RotationPatternDayType = 'WORKING' | 'WEEKLY_OFF' | 'NO_SHIFT';
export type RotationPatternOverwriteMode = 'EMPTY_ONLY' | 'REPLACE_SELECTED';
export type RotationPatternAlignmentMode = 'PATTERN_ANCHOR' | 'START_FROM_SEQUENCE_ONE';

export interface RotationPatternDay {
  id: string;
  patternId: string;
  companyId: string;
  sequence: number;
  dayType: RotationPatternDayType;
  shiftId?: string | null;
  shiftName?: string | null;
  shiftCode?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  shiftTimezone?: string | null;
  label?: string | null;
  notes?: string | null;
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface RotationPattern {
  id: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  timezone: string;
  cycleLengthDays: number;
  anchorDate?: string | null;
  enabled: boolean;
  version: number;
  notes?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: (Pick<Department, 'id' | 'name' | 'code'> & { branchId?: string | null }) | null;
  days?: RotationPatternDay[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface RotationPatternSummary { total: number; active: number; inactive: number; companyScope: number; branchScope: number; departmentScope: number; }
export interface RotationPatternListResponse extends PaginatedResponse<RotationPattern> { summary?: RotationPatternSummary; }
export interface RotationPatternListParams { page: number; limit: number; search?: string; enabled?: boolean; scope?: RotationPatternScope; branchId?: string; departmentId?: string; timezone?: string; }

export interface RotationPatternDayPayload { sequence: number; dayType: RotationPatternDayType; shiftId?: string | null; label?: string | null; notes?: string | null; }
export interface RotationPatternPayload { name: string; code: string; description?: string; timezone: string; cycleLengthDays: number; anchorDate?: string | null; enabled: boolean; branchId?: string | null; departmentId?: string | null; notes?: string; days: RotationPatternDayPayload[]; }
export interface RotationPatternFormValues extends RotationPatternPayload { scope: RotationPatternScope; branchId: string; departmentId: string; anchorDate: string; notes: string; description: string; days: RotationPatternDayPayload[]; }

export interface RotationPatternPreviewItem { workDate: string; sequence: number; dayType: RotationPatternDayType; label?: string | null; shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null; notes?: string | null; }
export interface RotationPatternPreviewResponse { patternId: string; dateFrom: string; dateTo: string; anchorDate: string; cycleLengthDays: number; counts: { working: number; weeklyOff: number; noShift: number }; data: RotationPatternPreviewItem[]; }

export interface ApplyRotationPatternPayload { patternId: string; employeeIds: string[]; dateFrom: string; dateTo: string; alignmentMode: RotationPatternAlignmentMode; anchorDate?: string; overwriteMode: RotationPatternOverwriteMode; }
export interface ApplyRotationPatternResponse { appliedCount: number; skippedCount: number; employeeCount: number; dateCount: number; }
export interface RotationPatternApplyDialogContext { roster?: ShiftRosterPeriod | null; pattern?: RotationPattern | null; employees?: Employee[]; }