import { Box, Button, Typography } from '@mui/material';
import { CalendarDays } from 'lucide-react';
import type { MouseEvent } from 'react';
import { formatDateRangeDisplay, type DateRangeValue } from './date-range-utils';

interface DateRangeInputProps {
  value: DateRangeValue;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function DateRangeInput({ value, onClick }: DateRangeInputProps) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      startIcon={<CalendarDays size={18} />}
      aria-label="Open date range picker"
      sx={{
        width: { xs: '100%', md: 250 },
        minHeight: 40,
        justifyContent: 'flex-start',
        color: 'text.primary',
        borderColor: 'divider',
        textTransform: 'none',
      }}
    >
      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
          Date Range
        </Typography>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {formatDateRangeDisplay(value)}
        </Typography>
      </Box>
    </Button>
  );
}
