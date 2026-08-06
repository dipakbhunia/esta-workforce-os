import { z } from 'zod';
import type { WeeklyOffRule, WeeklyOffRuleFormValues, WeeklyOffRulePayload, WeeklyOffRuleScope, WeeklyOffRuleSummary } from '../types/weekly-off-rule.types';

export const weekdays = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 0, short: 'Sun', label: 'Sunday' },
];

export const weeklyOffScopeOptions: Array<{ value: WeeklyOffRuleScope; label: string; description: string }> = [
  { value: 'COMPANY', label: 'Entire Company', description: 'Applies to all employees in the company.' },
  { value: 'BRANCH', label: 'Branch', description: 'Applies to employees in one branch.' },
  { value: 'DEPARTMENT', label: 'Department', description: 'Applies to employees in one department.' },
  { value: 'EMPLOYEE', label: 'Employee', description: 'Applies to one employee.' },
];

export const weeklyOffRuleSchema = z.object({
  name: z.string().trim().min(2, 'Rule name is required').max(120, 'Rule name is too long'),
  enabled: z.boolean(),
  scope: z.enum(['COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE']),
  branchId: z.string(),
  departmentId: z.string(),
  employeeId: z.string(),
  timezone: z.string().trim().min(1, 'Timezone is required').max(80, 'Timezone is too long'),
  effectiveFrom: z.string().min(1, 'Start date is required'),
  effectiveTo: z.string(),
  weekdays: z.array(z.number().int().min(0).max(6)),
  saturdayPattern: z.enum(['NONE', 'EVERY']),
  priority: z.number().int().min(1, 'Priority must be at least 1').max(10000, 'Priority is too high'),
}).superRefine((values, ctx) => {
  if (values.effectiveTo && values.effectiveFrom > values.effectiveTo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'End date must be on or after the start date.' });
  }
  if (values.scope === 'BRANCH' && !values.branchId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['branchId'], message: 'Select a branch.' });
  if (values.scope === 'DEPARTMENT' && !values.departmentId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentId'], message: 'Select a department.' });
  if (values.scope === 'EMPLOYEE' && !values.employeeId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['employeeId'], message: 'Select an employee.' });
  if (!values.weekdays.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weekdays'], message: 'Select at least one weekly-off day or pattern.' });
});

export function weeklyOffDefaults(rule?: WeeklyOffRule): WeeklyOffRuleFormValues {
  const ruleWeekdays = rule ? ruleWeekdayValues(rule.weekdays) : [0];
  return {
    name: rule?.name ?? '',
    enabled: rule?.enabled ?? true,
    scope: rule ? ruleScope(rule) : 'COMPANY',
    branchId: rule?.branchId ?? '',
    departmentId: rule?.departmentId ?? '',
    employeeId: rule?.employeeId ?? '',
    timezone: rule?.timezone ?? 'Asia/Kolkata',
    effectiveFrom: dateInput(rule?.effectiveFrom) || todayLocalDate(),
    effectiveTo: dateInput(rule?.effectiveTo),
    weekdays: ruleWeekdays,
    saturdayPattern: ruleWeekdays.includes(6) ? 'EVERY' : 'NONE',
    priority: rule?.priority ?? 100,
  };
}

export function toWeeklyOffPayload(values: WeeklyOffRuleFormValues): WeeklyOffRulePayload {
  return {
    name: values.name.trim(),
    timezone: values.timezone.trim() || 'UTC',
    ruleType: 'FIXED_WEEKDAYS',
    weekdays: [...new Set(values.weekdays)].sort((left, right) => left - right),
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo || null,
    branchId: values.scope === 'BRANCH' || values.scope === 'DEPARTMENT' || values.scope === 'EMPLOYEE' ? values.branchId || null : null,
    departmentId: values.scope === 'DEPARTMENT' || values.scope === 'EMPLOYEE' ? values.departmentId || null : null,
    employeeId: values.scope === 'EMPLOYEE' ? values.employeeId || null : null,
    priority: values.priority,
    enabled: values.enabled,
  };
}

export function emptyWeeklyOffSummary(): WeeklyOffRuleSummary {
  return { total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, departmentScope: 0, employeeScope: 0 };
}

export function ruleScope(rule: Pick<WeeklyOffRule, 'branchId' | 'departmentId' | 'employeeId'>): WeeklyOffRuleScope {
  if (rule.employeeId) return 'EMPLOYEE';
  if (rule.departmentId) return 'DEPARTMENT';
  if (rule.branchId) return 'BRANCH';
  return 'COMPANY';
}

export function scopeLabel(rule: WeeklyOffRule) {
  const scope = ruleScope(rule);
  if (scope === 'EMPLOYEE') return `Employee - ${employeeName(rule.employee)}`;
  if (scope === 'DEPARTMENT') return `Department - ${rule.department?.name ?? 'Selected department'}`;
  if (scope === 'BRANCH') return `Branch - ${rule.branch?.name ?? 'Selected branch'}`;
  return 'Company-wide';
}

export function employeeName(employee?: WeeklyOffRule['employee'] | null) {
  if (!employee) return 'Not configured';
  return [employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ').trim() || employee.user?.email || employee.employeeCode;
}

export function employeeOptionLabel(employee: { employeeCode: string; user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null }) {
  const name = [employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ').trim() || employee.user?.email || 'Employee';
  return `${name} - ${employee.employeeCode}`;
}

export function ruleWeekdayValues(value: WeeklyOffRule['weekdays']): number[] {
  const raw = Array.isArray(value) ? value : value?.weekdays;
  return Array.isArray(raw) ? raw.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
}

export function weeklyPatternLabel(value: WeeklyOffRule['weekdays']) {
  const days = ruleWeekdayValues(value);
  if (!days.length) return 'Not configured';
  const sorted = weekdays.filter((day) => days.includes(day.value));
  return sorted.map((day) => day.label).join(', ');
}

export function ruleModeLabel() {
  return 'Full Day Off';
}

export function statusLabel(enabled: boolean) {
  return enabled ? 'Active' : 'Inactive';
}

export function formatDate(value?: string | null) {
  if (!value) return 'Open-ended';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

export function todayLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function previewText(values: WeeklyOffRuleFormValues, labels: { branch?: string; department?: string; employee?: string } = {}) {
  const pattern = values.weekdays.length ? weeklyPatternLabel(values.weekdays) : 'No weekly-off days selected';
  const effective = `${formatDate(values.effectiveFrom)} \u2192 ${values.effectiveTo ? formatDate(values.effectiveTo) : 'Open-ended'}`;
  const scope = values.scope === 'COMPANY' ? 'Entire company' : values.scope === 'BRANCH' ? labels.branch ?? 'Selected branch' : values.scope === 'DEPARTMENT' ? labels.department ?? 'Selected department' : labels.employee ?? 'Selected employee';
  return { pattern, effective, scope, status: statusLabel(values.enabled), priority: String(values.priority), mode: ruleModeLabel() };
}

export function friendlyWeeklyOffError(error: unknown) {
  const response = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(response)) return response.join(' ');
  if (typeof response === 'string') return response;
  return 'Weekly off rule could not be saved. Check the rule configuration and try again.';
}