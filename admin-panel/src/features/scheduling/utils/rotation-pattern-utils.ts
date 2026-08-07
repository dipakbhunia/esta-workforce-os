import { z } from 'zod';
import type { RotationPattern, RotationPatternDayPayload, RotationPatternFormValues, RotationPatternScope } from '../types/rotation-pattern.types';

export const rotationPatternScopeOptions: Array<{ value: RotationPatternScope; label: string; description: string }> = [
  { value: 'COMPANY', label: 'Company-wide', description: 'Available across the company.' },
  { value: 'BRANCH', label: 'Branch', description: 'Used for one branch.' },
  { value: 'DEPARTMENT', label: 'Department', description: 'Used for one department.' },
];

export const dayTypeLabel = (value?: string | null) => value === 'WORKING' ? 'Working' : value === 'WEEKLY_OFF' ? 'Weekly Off' : 'No Shift';
export const dayTypeTone = (value?: string | null): 'success' | 'info' | 'neutral' => value === 'WORKING' ? 'success' : value === 'WEEKLY_OFF' ? 'info' : 'neutral';
export const statusLabel = (enabled: boolean) => enabled ? 'Active' : 'Inactive';
export const statusTone = (enabled: boolean): 'success' | 'neutral' => enabled ? 'success' : 'neutral';
export const emptyRotationPatternSummary = () => ({ total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, departmentScope: 0 });

export function suggestedRotationCode(name: string) { return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }
export function localDateString(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function localDateForFilename() { return localDateString(); }
export function responseBlob(response: { data: Blob } | Blob) { return response instanceof Blob ? response : response.data; }
export function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
export function formatDateTime(value?: string | null) { if (!value) return 'Not available'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
export function formatDate(value?: string | null) { if (!value) return 'Not configured'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString(); }
export function rotationScopeLabel(pattern: Pick<RotationPattern, 'branch' | 'department'>) { if (pattern.branch?.name && pattern.department?.name) return `${pattern.branch.name} / ${pattern.department.name}`; if (pattern.department?.name) return pattern.department.name; if (pattern.branch?.name) return pattern.branch.name; return 'Company-wide'; }

export function defaultRotationDays(length = 8): RotationPatternDayPayload[] { return Array.from({ length }, (_, index) => ({ sequence: index + 1, dayType: 'NO_SHIFT', shiftId: '', label: '', notes: '' })); }
export function resizeRotationDays(days: RotationPatternDayPayload[], length: number): RotationPatternDayPayload[] { return Array.from({ length }, (_, index) => ({ ...(days[index] ?? { dayType: 'NO_SHIFT', shiftId: '', label: '', notes: '' }), sequence: index + 1 })); }

export function rotationPatternDefaults(pattern?: RotationPattern): RotationPatternFormValues {
  const scope: RotationPatternScope = pattern?.departmentId ? 'DEPARTMENT' : pattern?.branchId ? 'BRANCH' : 'COMPANY';
  const days = pattern?.days?.length ? pattern.days.map((day) => ({ sequence: day.sequence, dayType: day.dayType, shiftId: day.shiftId ?? '', label: day.label ?? '', notes: day.notes ?? '' })).sort((a, b) => a.sequence - b.sequence) : defaultRotationDays();
  return { name: pattern?.name ?? '', code: pattern?.code ?? '', description: pattern?.description ?? '', timezone: pattern?.timezone ?? 'Asia/Kolkata', cycleLengthDays: pattern?.cycleLengthDays ?? days.length, anchorDate: pattern?.anchorDate?.slice(0, 10) ?? '', enabled: pattern?.enabled ?? true, scope, branchId: pattern?.branchId ?? '', departmentId: pattern?.departmentId ?? '', notes: pattern?.notes ?? '', days };
}

export const rotationPatternSchema = z.object({
  name: z.string().trim().min(1, 'Pattern name is required').max(120),
  code: z.string().trim().min(1, 'Pattern code is required').max(40).regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, numbers, underscores, or hyphens'),
  description: z.string().max(500).optional(),
  timezone: z.string().trim().min(1, 'Timezone is required').max(80),
  cycleLengthDays: z.coerce.number().int().min(2).max(90),
  anchorDate: z.string().optional(),
  enabled: z.boolean(),
  scope: z.enum(['COMPANY', 'BRANCH', 'DEPARTMENT']),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  days: z.array(z.object({ sequence: z.number().int().min(1).max(90), dayType: z.enum(['WORKING', 'WEEKLY_OFF', 'NO_SHIFT']), shiftId: z.string().optional().nullable(), label: z.string().max(120).optional().nullable(), notes: z.string().max(500).optional().nullable() })).min(2).max(90),
}).superRefine((value, ctx) => {
  if (value.scope !== 'COMPANY' && !value.branchId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['branchId'], message: 'Branch is required for this scope' });
  if (value.scope === 'DEPARTMENT' && !value.departmentId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentId'], message: 'Department is required for department scope' });
  if (value.days.length !== value.cycleLengthDays) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: 'Pattern days must match cycle length' });
  const sequences = new Set<number>();
  value.days.forEach((day, index) => { sequences.add(day.sequence); if (day.dayType === 'WORKING' && !day.shiftId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', index, 'shiftId'], message: 'Working days require a shift' }); if (day.dayType !== 'WORKING' && day.shiftId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days', index, 'shiftId'], message: 'Non-working days cannot have a shift' }); });
  for (let i = 1; i <= value.cycleLengthDays; i += 1) if (!sequences.has(i)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: 'Sequences must be contiguous' });
});

export function toRotationPatternPayload(values: RotationPatternFormValues) {
  return { name: values.name.trim(), code: values.code.trim().toUpperCase(), description: values.description?.trim() || undefined, timezone: values.timezone.trim() || 'UTC', cycleLengthDays: values.cycleLengthDays, anchorDate: values.anchorDate || null, enabled: values.enabled, branchId: values.scope === 'COMPANY' ? null : values.branchId || null, departmentId: values.scope === 'DEPARTMENT' ? values.departmentId || null : null, notes: values.notes?.trim() || undefined, days: values.days.map((day) => ({ sequence: day.sequence, dayType: day.dayType, shiftId: day.dayType === 'WORKING' ? day.shiftId || null : null, label: day.label?.trim() || null, notes: day.notes?.trim() || null })) };
}