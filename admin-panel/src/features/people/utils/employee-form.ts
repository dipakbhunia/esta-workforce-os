import { z } from 'zod';
import type { Employee, EmployeeCreatePayload, EmployeeFormValues, EmployeeStatus, EmployeeUpdatePayload, EmploymentType, WorkMode } from '../types/employee.types';

const phonePattern = /^\+?[0-9][0-9 ()-]{6,19}$/;

export const employmentTypes: Array<{ value: EmploymentType; label: string }> = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Intern' },
];

export const workModes: Array<{ value: WorkMode; label: string }> = [
  { value: 'ONSITE', label: 'Office' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
];

export const employeeStatuses: Array<{ value: EmployeeStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TERMINATED', label: 'Terminated' },
];

export const employeeFormSchema = z.object({
  userId: z.string().uuid('Select an existing user.'),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  mobile: z.string(),
  employeeCode: z.string().min(1, 'Employee code is required.').max(40, 'Employee code is too long.').regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscores, or hyphens only.'),
  branchId: z.string(),
  departmentId: z.string(),
  designationId: z.string(),
  shiftId: z.string(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']),
  workMode: z.enum(['ONSITE', 'REMOTE', 'HYBRID']),
  joiningDate: z.string().min(1, 'Joining date is required.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']),
}).refine((values) => !values.mobile || phonePattern.test(values.mobile), {
  message: 'Enter a valid mobile number.',
  path: ['mobile'],
});

export function employeeCodeFromName(firstName: string, lastName: string) {
  const base = `${firstName} ${lastName}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 24);
  return base ? `EMP_${base}`.slice(0, 40) : '';
}

export function employeeDefaults(employee?: Employee): EmployeeFormValues {
  return {
    userId: employee?.userId ?? '',
    firstName: employee?.user?.firstName ?? '',
    lastName: employee?.user?.lastName ?? '',
    email: employee?.user?.email ?? '',
    mobile: employee?.phone ?? '',
    employeeCode: employee?.employeeCode ?? '',
    branchId: employee?.branchId ?? '',
    departmentId: employee?.departmentId ?? '',
    designationId: employee?.designationId ?? '',
    shiftId: employee?.shiftId ?? '',
    employmentType: employee?.employmentType ?? 'FULL_TIME',
    workMode: employee?.workMode ?? 'ONSITE',
    joiningDate: formatDateInput(employee?.joiningDate),
    status: employee?.status ?? 'ACTIVE',
  };
}

export function toEmployeeCreatePayload(values: EmployeeFormValues): EmployeeCreatePayload {
  return {
    userId: values.userId,
    employeeCode: values.employeeCode.trim(),
    branchId: values.branchId || undefined,
    departmentId: values.departmentId || undefined,
    designationId: values.designationId || undefined,
    shiftId: values.shiftId || undefined,
    joiningDate: values.joiningDate,
    employmentType: values.employmentType,
    workMode: values.workMode,
    status: values.status,
    phone: values.mobile.trim() || undefined,
  };
}

export function toEmployeeUpdatePayload(values: EmployeeFormValues): EmployeeUpdatePayload {
  const { userId: _userId, ...payload } = toEmployeeCreatePayload(values);
  return payload;
}

export function fullName(employee?: Employee | null) {
  const user = employee?.user;
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Unknown Employee';
}

export function formatEnum(value?: string | null) {
  if (!value) return '-';
  return value.toLowerCase().split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

export function statusTone(status?: EmployeeStatus) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'TERMINATED') return 'danger' as const;
  return 'neutral' as const;
}

export function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDateInput(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}
