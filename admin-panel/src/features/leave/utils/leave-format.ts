import type { StatusTone } from '@/components/status-chip';
import type { LeaveApprovalHistoryAction, LeaveRequest, LeaveRequestStatus } from '../types/leave.types';

export function formatEnum(value?: string | null) {
  if (!value) return 'Not available';
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatNumber(value?: number | null) {
  return typeof value === 'number' ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value) : '0';
}

export function leaveStatusTone(status?: LeaveRequestStatus | null): StatusTone {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function historyActionTone(action?: LeaveApprovalHistoryAction | null): StatusTone {
  switch (action) {
    case 'APPROVED':
      return 'success';
    case 'SUBMITTED':
      return 'info';
    case 'REJECTED':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function employeeName(request?: LeaveRequest | null) {
  const user = request?.employee?.user;
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Employee';
}

export function employeeEmail(request?: LeaveRequest | null) {
  return request?.employee?.user?.email ?? undefined;
}

export function employeeCode(request?: LeaveRequest | null) {
  return request?.employee?.employeeCode ?? '-';
}

export function userName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Not available';
}
