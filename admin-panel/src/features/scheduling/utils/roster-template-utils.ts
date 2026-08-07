import { z } from 'zod';
import type { StatusTone } from '@/components/status-chip';
import type { RosterTemplate, RosterTemplateDayPayload, RosterTemplateFormValues, RosterTemplatePayload, RosterTemplateScope } from '../types/roster-template.types';

export const rosterTemplateScopeOptions: Array<{ value: RosterTemplateScope; label: string; description: string }> = [
  { value: 'COMPANY', label: 'Company', description: 'Reusable across the whole company.' },
  { value: 'BRANCH', label: 'Branch', description: 'Reusable for one branch.' },
  { value: 'DEPARTMENT', label: 'Department', description: 'Reusable for one department.' },
];

export const templateWeekdays = [
  { sequence: 1, dayOfWeek: 1, label: 'Monday', short: 'Mon' },
  { sequence: 2, dayOfWeek: 2, label: 'Tuesday', short: 'Tue' },
  { sequence: 3, dayOfWeek: 3, label: 'Wednesday', short: 'Wed' },
  { sequence: 4, dayOfWeek: 4, label: 'Thursday', short: 'Thu' },
  { sequence: 5, dayOfWeek: 5, label: 'Friday', short: 'Fri' },
  { sequence: 6, dayOfWeek: 6, label: 'Saturday', short: 'Sat' },
  { sequence: 7, dayOfWeek: 0, label: 'Sunday', short: 'Sun' },
];

const daySchema = z.object({
  sequence: z.number().int().min(1).max(7),
  dayOfWeek: z.number().int().min(0).max(6),
  dayType: z.enum(['WORKING', 'WEEKLY_OFF', 'NO_SHIFT']),
  shiftId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.dayType === 'WORKING' && !value.shiftId) ctx.addIssue({ code: 'custom', path: ['shiftId'], message: 'Working days require a shift.' });
  if (value.dayType !== 'WORKING' && value.shiftId) ctx.addIssue({ code: 'custom', path: ['shiftId'], message: 'Non-working days cannot contain a shift.' });
});

export const rosterTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required.').max(120),
  code: z.string().trim().min(1, 'Template code is required.').regex(/^[A-Z0-9_\-]+$/, 'Use uppercase letters, numbers, underscores, or hyphens.'),
  description: z.string().max(500),
  timezone: z.string().trim().min(1, 'Timezone is required.').max(80),
  enabled: z.boolean(),
  scope: z.enum(['COMPANY', 'BRANCH', 'DEPARTMENT']),
  branchId: z.string(),
  departmentId: z.string(),
  notes: z.string().max(1000),
  days: z.array(daySchema).length(7, 'Seven weekdays are required.'),
}).superRefine((value, ctx) => {
  if (value.scope === 'BRANCH' && !value.branchId) ctx.addIssue({ code: 'custom', path: ['branchId'], message: 'Branch is required.' });
  if (value.scope === 'DEPARTMENT' && !value.departmentId) ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Department is required.' });
});

export function defaultTemplateDays(template?: RosterTemplate): RosterTemplateDayPayload[] {
  const existing = new Map((template?.days ?? []).map((day) => [day.dayOfWeek, day]));
  return templateWeekdays.map((day) => {
    const current = existing.get(day.dayOfWeek);
    return {
      sequence: day.sequence,
      dayOfWeek: day.dayOfWeek,
      dayType: current?.dayType ?? (day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'WEEKLY_OFF' : 'WORKING'),
      shiftId: current?.shiftId ?? '',
      notes: current?.notes ?? '',
    };
  });
}

export function rosterTemplateDefaults(template?: RosterTemplate): RosterTemplateFormValues {
  const scope: RosterTemplateScope = template?.departmentId ? 'DEPARTMENT' : template?.branchId ? 'BRANCH' : 'COMPANY';
  return {
    name: template?.name ?? '',
    code: template?.code ?? '',
    description: template?.description ?? '',
    timezone: template?.timezone ?? 'Asia/Kolkata',
    enabled: template?.enabled ?? true,
    scope,
    branchId: template?.branchId ?? '',
    departmentId: template?.departmentId ?? '',
    notes: template?.notes ?? '',
    days: defaultTemplateDays(template),
  };
}

export function toRosterTemplatePayload(values: RosterTemplateFormValues): RosterTemplatePayload {
  return {
    name: values.name.trim(),
    code: values.code.trim().toUpperCase(),
    description: values.description.trim() || undefined,
    timezone: values.timezone.trim() || 'Asia/Kolkata',
    enabled: values.enabled,
    branchId: values.scope === 'COMPANY' ? null : values.branchId || null,
    departmentId: values.scope === 'DEPARTMENT' ? values.departmentId || null : null,
    notes: values.notes.trim() || undefined,
    days: values.days.map((day) => ({ ...day, shiftId: day.dayType === 'WORKING' ? day.shiftId || null : null, notes: day.notes?.trim() || null })),
  };
}

export function suggestedTemplateCode(name: string) {
  const clean = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || 'ROSTER_TEMPLATE';
}

export function templateScopeLabel(template: Pick<RosterTemplate, 'branch' | 'department'>) {
  if (template.department?.name && template.branch?.name) return `${template.branch.name} / ${template.department.name}`;
  if (template.department?.name) return template.department.name;
  if (template.branch?.name) return template.branch.name;
  return 'Company-wide';
}

export function statusLabel(enabled: boolean) {
  return enabled ? 'Active' : 'Inactive';
}

export function statusTone(enabled: boolean): StatusTone {
  return enabled ? 'success' : 'neutral';
}

export function emptyRosterTemplateSummary() {
  return { total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, departmentScope: 0 };
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function dayTypeLabel(dayType: RosterTemplateDayPayload['dayType']) {
  if (dayType === 'WORKING') return 'Working';
  if (dayType === 'WEEKLY_OFF') return 'Weekly Off';
  return 'No Shift';
}

export function dayTypeTone(dayType: RosterTemplateDayPayload['dayType']): StatusTone {
  if (dayType === 'WORKING') return 'success';
  if (dayType === 'WEEKLY_OFF') return 'info';
  return 'neutral';
}

export function responseBlob(response: unknown) {
  if (response instanceof Blob) return response;
  const maybe = response as { data?: Blob };
  return maybe.data instanceof Blob ? maybe.data : new Blob([String(maybe.data ?? '')], { type: 'text/plain' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function localDateForFilename(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

