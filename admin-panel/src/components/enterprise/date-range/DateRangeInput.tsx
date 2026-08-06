import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { CalendarDays, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { formatDateRangeDisplay, type DateRangeValue } from './date-range-utils';

interface DateRangeInputProps {
  value: DateRangeValue;
  label?: string;
  disabled?: boolean;
  error?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onClear?: () => void;
}

export function DateRangeInput({ value, label = 'Date Range', disabled, error, onClick, onClear }: DateRangeInputProps) {
  const hasValue = Boolean(value.dateFrom || value.dateTo);
  const displayValue = hasValue ? formatDateRangeDisplay(value) : 'Select date range';

  return (
    <Stack direction="row" gap={0.75} alignItems="center" sx={{ width: { xs: '100%', md: 250 } }}>
      <Button
        variant="outlined"
        onClick={onClick}
        startIcon={<CalendarDays size={18} />}
        aria-label={`${label}: ${displayValue}`}
        aria-haspopup="dialog"
        disabled={disabled}
        sx={{
          width: '100%',
          minHeight: 40,
          justifyContent: 'flex-start',
          color: hasValue ? 'text.primary' : 'text.secondary',
          borderColor: error ? 'error.main' : 'divider',
          textTransform: 'none',
        }}
      >
        <Box sx={{ minWidth: 0, textAlign: 'left' }}>
          <Typography variant="caption" color={error ? 'error.main' : 'text.secondary'} sx={{ display: 'block', lineHeight: 1 }}>
            {label}
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {displayValue}
          </Typography>
        </Box>
      </Button>
      {hasValue && onClear ? (
        <IconButton size="small" onClick={onClear} disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`}>
          <X size={16} />
        </IconButton>
      ) : null}
    </Stack>
  );
}