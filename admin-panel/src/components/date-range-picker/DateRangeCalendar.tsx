import { Box, IconButton, Stack, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  formatDateOnly,
  isSameDate,
  isWithinRange,
  parseDateOnly,
  startOfMonth,
  startOfWeek,
  type DateRangeValue,
} from './date-range-utils';

const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface DateRangeCalendarProps {
  month: Date;
  value: DateRangeValue;
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: Date) => void;
}

export function DateRangeCalendar({ month, value, onMonthChange, onSelectDate }: DateRangeCalendarProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <IconButton size="small" aria-label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeft size={18} />
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Select Date Range
        </Typography>
        <IconButton size="small" aria-label="Next month" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight size={18} />
        </IconButton>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(260px, 1fr))' },
          gap: 2,
        }}
      >
        <MonthCalendar month={month} value={value} onSelectDate={onSelectDate} />
        <MonthCalendar month={addMonths(month, 1)} value={value} onSelectDate={onSelectDate} />
      </Box>
    </Box>
  );
}

function MonthCalendar({ month, value, onSelectDate }: { month: Date; value: DateRangeValue; onSelectDate: (date: Date) => void }) {
  const days = getCalendarDays(month);
  const selectedFrom = parseDateOnly(value.dateFrom);
  const selectedTo = parseDateOnly(value.dateTo);

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
        {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {weekDays.map((day) => (
          <Typography key={day} variant="caption" color="text.secondary" align="center" sx={{ fontWeight: 700 }}>
            {day}
          </Typography>
        ))}
        {days.map((day) => {
          const dateValue = formatDateOnly(day);
          const isCurrentMonth = day.getMonth() === month.getMonth();
          const isStart = selectedFrom ? isSameDate(day, selectedFrom) : false;
          const isEnd = selectedTo ? isSameDate(day, selectedTo) : false;
          const inRange = isWithinRange(day, value.dateFrom, value.dateTo);

          return (
            <Box
              component="button"
              key={dateValue}
              type="button"
              onClick={() => onSelectDate(day)}
              aria-label={`Select ${dateValue}`}
              sx={{
                border: 0,
                borderRadius: 2,
                minHeight: 34,
                cursor: 'pointer',
                bgcolor: isStart || isEnd ? 'primary.main' : inRange ? 'action.selected' : 'transparent',
                color: isStart || isEnd ? 'primary.contrastText' : isCurrentMonth ? 'text.primary' : 'text.disabled',
                fontWeight: isStart || isEnd ? 700 : 500,
                '&:hover': {
                  bgcolor: isStart || isEnd ? 'primary.dark' : 'action.hover',
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
              {day.getDate()}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function getCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const start = startOfWeek(firstDay);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
