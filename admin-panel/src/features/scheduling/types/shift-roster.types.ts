import type { Branch } from '@/features/organization/types/branch.types';
import type { Department } from '@/features/organization/types/department.types';
import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';

export type ShiftRosterStatus = 'DRAFT' | 'PUBLISHED' | 'LOCKED' | 'CANCELLED';
export type RosterDayType = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY' | 'LEAVE' | 'NO_SHIFT';
export type RosterDaySource = 'MANUAL' | 'SHIFT_ASSIGNMENT' | 'TEMPLATE' | 'ROTATION' | 'WEEKLY_OFF_RULE' | 'HOLIDAY_CALENDAR' | 'SYSTEM' | 'IMPORT' | 'MANUAL_OVERRIDE';
export type ShiftRosterScope = 'COMPANY' | 'BRANCH' | 'DEPARTMENT';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ShiftRosterEmployee {
  id: string;
  employeeCode: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  user?: Employee['user'] | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: Pick<Department, 'id' | 'name' | 'code'> | null;
  designation?: { id: string; name: string } | null;
}

export interface ShiftRosterDay {
  id: string;
  companyId: string;
  rosterPeriodId: string;
  employeeId: string;
  workDate: string;
  dayType: RosterDayType;
  shiftId?: string | null;
  source: RosterDaySource;
  shiftName?: string | null;
  shiftCode?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  shiftTimezone?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  notes?: string | null;
  employee?: ShiftRosterEmployee | Employee | null;
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ShiftRosterPeriod {
  id: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  name: string;
  code: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;
  status: ShiftRosterStatus;
  version: number;
  publishedAt?: string | null;
  publishedById?: string | null;
  lockedAt?: string | null;
  lockedById?: string | null;
  notes?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  department?: Pick<Department, 'id' | 'name' | 'code'> | null;
  days?: ShiftRosterDay[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}


export interface ShiftRosterSummary {
  total: number;
  draft: number;
  published: number;
  locked: number;
  cancelled: number;
}

export interface ShiftRosterListResponse extends PaginatedResponse<ShiftRosterPeriod> {
  summary?: ShiftRosterSummary;
}
export interface ShiftRosterPeriodListParams {
  page: number;
  limit: number;
  search?: string;
  status?: ShiftRosterStatus;
  branchId?: string;
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ShiftRosterDayListParams {
  page: number;
  limit: number;
  search?: string;
  employeeId?: string;
  dayType?: RosterDayType;
  dateFrom?: string;
  dateTo?: string;
}

export interface ShiftRosterPeriodPayload {
  name: string;
  code: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;
  branchId?: string;
  departmentId?: string;
  notes?: string;
}

export interface ShiftRosterDayPayload {
  employeeId: string;
  workDate: string;
  dayType: RosterDayType;
  shiftId?: string | null;
  source?: RosterDaySource;
  notes?: string | null;
}

export interface BulkShiftRosterDaysPayload {
  days: ShiftRosterDayPayload[];
}

export interface RosterValidationIssue {
  path: string;
  message: string;
}

export interface RosterPreviewResponse {
  valid: boolean;
  errors: RosterValidationIssue[];
  warnings: RosterValidationIssue[];
  info?: RosterValidationIssue[];
}

export interface ResolveDayResponse {
  employeeId: string;
  workDate: string;
  timezone: string;
  resolutionSource: string;
  dayType: RosterDayType;
  rosterPeriodId?: string | null;
  rosterDayId?: string | null;
  rosterSource?: RosterDaySource | null;
  shiftAssignmentId?: string | null;
  isWeeklyOff: boolean;
  weeklyOffRuleId?: string | null;
  isHoliday: boolean;
  holidayId?: string | null;
  holidayName?: string | null;
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'startTime' | 'endTime' | 'timezone'> | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
}

export interface ShiftRosterFormValues {
  name: string;
  code: string;
  notes: string;
  scope: ShiftRosterScope;
  branchId: string;
  departmentId: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;
}
