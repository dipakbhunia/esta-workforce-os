export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'currentWeek'
  | 'previousWeek'
  | 'currentMonth'
  | 'previousMonth'
  | 'last7Days'
  | 'last30Days'
  | 'last90Days'
  | 'customRange';

export interface DateRangeValue {
  preset: DateRangePreset;
  dateFrom: string;
  dateTo: string;
}

export const dateRangePresetLabels: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  currentWeek: 'Current Week',
  previousWeek: 'Previous Week',
  currentMonth: 'Current Month',
  previousMonth: 'Previous Month',
  last7Days: 'Last 7 Days',
  last30Days: 'Last 30 Days',
  last90Days: 'Last 90 Days',
  customRange: 'Custom Range',
};

export const dateRangePresets: DateRangePreset[] = [
  'today',
  'yesterday',
  'currentWeek',
  'previousWeek',
  'currentMonth',
  'previousMonth',
  'last7Days',
  'last30Days',
  'last90Days',
  'customRange',
];

export function createDateRangeValue(preset: DateRangePreset, today = new Date()): DateRangeValue {
  if (preset === 'customRange') {
    return { preset, dateFrom: '', dateTo: '' };
  }

  const { dateFrom, dateTo } = resolvePresetRange(preset, today);
  return { preset, dateFrom, dateTo };
}

export function resolvePresetRange(preset: Exclude<DateRangePreset, 'customRange'>, today = new Date()) {
  const current = startOfDay(today);

  switch (preset) {
    case 'today':
      return toRange(current, current);
    case 'yesterday': {
      const yesterday = addDays(current, -1);
      return toRange(yesterday, yesterday);
    }
    case 'currentWeek':
      return toRange(startOfWeek(current), addDays(startOfWeek(current), 6));
    case 'previousWeek': {
      const start = addDays(startOfWeek(current), -7);
      return toRange(start, addDays(start, 6));
    }
    case 'currentMonth':
      return toRange(startOfMonth(current), endOfMonth(current));
    case 'previousMonth': {
      const previousMonth = addMonths(current, -1);
      return toRange(startOfMonth(previousMonth), endOfMonth(previousMonth));
    }
    case 'last7Days':
      return toRange(addDays(current, -6), current);
    case 'last30Days':
      return toRange(addDays(current, -29), current);
    case 'last90Days':
      return toRange(addDays(current, -89), current);
  }
}

export function formatDateRangeDisplay(value: DateRangeValue) {
  if (value.preset !== 'customRange' && value.dateFrom && value.dateTo) {
    return dateRangePresetLabels[value.preset];
  }

  if (value.dateFrom && value.dateTo) {
    return `${value.dateFrom} → ${value.dateTo}`;
  }

  if (value.dateFrom) {
    return `${value.dateFrom} → Select end date`;
  }

  return 'Select date range';
}

export function parseDateOnly(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameDate(first: Date, second: Date) {
  return formatDateOnly(first) === formatDateOnly(second);
}

export function isWithinRange(date: Date, dateFrom: string, dateTo: string) {
  const from = parseDateOnly(dateFrom);
  const to = parseDateOnly(dateTo);
  if (!from || !to) return false;
  const value = startOfDay(date).getTime();
  return value >= from.getTime() && value <= to.getTime();
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function startOfWeek(date: Date) {
  const current = startOfDay(date);
  const day = current.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(current, mondayOffset);
}

function toRange(dateFrom: Date, dateTo: Date) {
  return {
    dateFrom: formatDateOnly(dateFrom),
    dateTo: formatDateOnly(dateTo),
  };
}
