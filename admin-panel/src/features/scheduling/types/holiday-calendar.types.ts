import type { Branch } from '@/features/organization/types/branch.types';
import type { PaginatedResponse } from './shift-roster.types';

export type HolidayType = 'NATIONAL' | 'REGIONAL' | 'COMPANY' | 'OPTIONAL' | 'CUSTOM';
export type HolidayCalendarScope = 'COMPANY' | 'BRANCH';

export interface HolidayCalendarUser { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }

export interface HolidayCalendar {
  id: string;
  companyId: string;
  branchId?: string | null;
  name: string;
  year?: number | null;
  description?: string | null;
  notes?: string | null;
  timezone: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'> | null;
  holidays?: Holiday[];
  holidayCount?: number;
  mandatoryCount?: number;
  optionalCount?: number;
  createdBy?: HolidayCalendarUser | null;
  updatedBy?: HolidayCalendarUser | null;
}

export interface Holiday {
  id: string;
  calendarId: string;
  companyId: string;
  date: string;
  name: string;
  type: HolidayType;
  optional: boolean;
  recurring: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  calendar?: HolidayCalendar;
}

export interface HolidayCalendarSummary {
  total: number;
  active: number;
  inactive: number;
  companyScope: number;
  branchScope: number;
  totalHolidays: number;
  mandatoryHolidays: number;
  optionalHolidays: number;
}

export interface HolidayCalendarListResponse extends PaginatedResponse<HolidayCalendar> { summary?: HolidayCalendarSummary }
export type HolidayListResponse = PaginatedResponse<Holiday>;

export interface HolidayCalendarListParams {
  page: number;
  limit: number;
  search?: string;
  enabled?: boolean;
  scope?: HolidayCalendarScope;
  branchId?: string;
  year?: number;
  timezone?: string;
}

export interface HolidayListParams {
  page: number;
  limit: number;
  search?: string;
  type?: HolidayType;
  optional?: boolean;
  recurring?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface HolidayCalendarPayload {
  name: string;
  year: number;
  description?: string | null;
  notes?: string | null;
  timezone?: string;
  branchId?: string | null;
  enabled?: boolean;
}

export interface HolidayPayload {
  name: string;
  date: string;
  type?: HolidayType;
  optional?: boolean;
  recurring?: boolean;
  notes?: string | null;
}

export interface HolidayCalendarFormValues {
  name: string;
  year: number;
  description: string;
  notes: string;
  timezone: string;
  enabled: boolean;
  scope: HolidayCalendarScope;
  branchId: string;
}

export interface HolidayFormValues {
  name: string;
  date: string;
  type: HolidayType;
  optional: boolean;
  recurring: boolean;
  notes: string;
}
