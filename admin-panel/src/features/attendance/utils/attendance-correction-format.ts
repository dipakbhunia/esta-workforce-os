import type {
  AttendanceCorrectionRequest,
  AttendanceCorrectionStatus,
} from '../types/attendance-correction.types';
import { formatEnum } from './attendance-format';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function correctionStatusTone(status?: AttendanceCorrectionStatus | null): StatusTone {
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

export function correctionEmployeeName(request?: AttendanceCorrectionRequest | null) {
  const user = request?.employee?.user;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unknown employee';
}

export function correctionUserName(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name || user?.email || 'Not available';
}

export function correctionTypeLabel(value?: string | null) {
  return formatEnum(value);
}
