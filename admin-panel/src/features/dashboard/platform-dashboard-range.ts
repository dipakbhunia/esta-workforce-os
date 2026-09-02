import {
  createCustomDateRangeValue,
  createDateRangeValue,
  formatDateOnly,
  type DateRangeValue,
} from '@/components/enterprise/date-range';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

export interface ResolvedPlatformDashboardRange {
  value: DateRangeValue;
  shouldNormalize: boolean;
}

export function resolvePlatformDashboardRange(
  searchParams: URLSearchParams,
  today = new Date(),
): ResolvedPlatformDashboardRange {
  const fallback = createDateRangeValue('last30Days', today);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from && !to) return { value: fallback, shouldNormalize: true };
  if (!from || !to || !isSupportedRange(from, to, today)) {
    return { value: fallback, shouldNormalize: true };
  }

  return {
    value: createCustomDateRangeValue(from, to),
    shouldNormalize: false,
  };
}

export function setPlatformDashboardRange(
  current: URLSearchParams,
  value: DateRangeValue,
) {
  const next = new URLSearchParams(current);
  next.set('from', value.dateFrom);
  next.set('to', value.dateTo);
  return next;
}

function isSupportedRange(from: string, to: string, today: Date) {
  if (!isStrictDateOnly(from) || !isStrictDateOnly(to) || from > to) return false;
  if (to > formatDateOnly(today)) return false;

  const fromUtc = Date.parse(`${from}T00:00:00.000Z`);
  const toUtc = Date.parse(`${to}T00:00:00.000Z`);
  return ((toUtc - fromUtc) / 86_400_000) + 1 <= MAX_RANGE_DAYS;
}

function isStrictDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}
