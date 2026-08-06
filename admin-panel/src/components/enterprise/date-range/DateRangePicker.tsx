import { Box, Button, Divider, FormHelperText, Paper, Popover, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { DateRangeCalendar } from './DateRangeCalendar';
import { DateRangeInput } from './DateRangeInput';
import { DateRangePresetList } from './DateRangePresetList';
import { createDateRangeValue, dateRangePresetLabels, formatDateRangeDisplay, formatDateOnly, isValidDateRange, parseDateOnly, resolvePresetRange, startOfMonth, type DateRangePreset, type DateRangeValue } from './date-range-utils';

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  defaultPreset?: DateRangePreset;
  mode?: 'filter' | 'form';
  label?: string;
  presetsEnabled?: boolean;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  onClear?: () => void;
}

export function DateRangePicker({ value, onChange, defaultPreset = 'currentWeek', mode = 'filter', label = 'Date Range', presetsEnabled = mode === 'filter', minDate, maxDate, disabled, error, helperText, onClear }: DateRangePickerProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const initialMonth = useMemo(() => parseDateOnly(value.dateFrom) ?? new Date(), [value.dateFrom]);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(initialMonth));
  const open = Boolean(anchorEl);

  useEffect(() => {
    if (!open) setDraft(value.dateFrom || value.dateTo ? value : createDateRangeValue(defaultPreset));
  }, [defaultPreset, open, value]);

  function openPicker(event: MouseEvent<HTMLButtonElement>) {
    const nextDraft = value.dateFrom || value.dateTo ? value : createDateRangeValue(defaultPreset);
    const nextMonth = parseDateOnly(nextDraft.dateFrom) ?? new Date();
    setDraft(nextDraft);
    setVisibleMonth(startOfMonth(nextMonth));
    setAnchorEl(event.currentTarget);
  }

  function closePicker() {
    setAnchorEl(null);
    setDraft(value);
  }

  function selectPreset(preset: DateRangePreset) {
    if (preset === 'customRange') {
      setDraft((current) => ({ ...current, preset }));
      return;
    }
    const next = createDateRangeValue(preset);
    setDraft(next);
    setVisibleMonth(startOfMonth(parseDateOnly(next.dateFrom) ?? new Date()));
  }

  function selectDate(date: Date) {
    const selected = formatDateOnly(date);
    setDraft((current) => {
      if (!current.dateFrom || current.dateTo) return { preset: 'customRange', dateFrom: selected, dateTo: '' };
      const currentFrom = parseDateOnly(current.dateFrom);
      if (currentFrom && date.getTime() < currentFrom.getTime()) return { preset: 'customRange', dateFrom: selected, dateTo: current.dateFrom };
      return { preset: 'customRange', dateFrom: current.dateFrom, dateTo: selected };
    });
  }

  function applyDraft() {
    if (draft.preset !== 'customRange') {
      onChange({ preset: draft.preset, ...resolvePresetRange(draft.preset) });
      setAnchorEl(null);
      return;
    }
    if (!isValidDateRange(draft)) return;
    onChange(draft);
    setAnchorEl(null);
  }

  const rangeError = draft.dateFrom && draft.dateTo && draft.dateTo < draft.dateFrom ? 'End date must be on or after the start date.' : '';
  const canApply = draft.preset !== 'customRange' || isValidDateRange(draft);
  const hasAppliedValue = Boolean(value.dateFrom || value.dateTo);

  return (
    <Box>
      <DateRangeInput value={hasAppliedValue ? value : { preset: 'customRange', dateFrom: '', dateTo: '' }} label={label} disabled={disabled} error={error || Boolean(rangeError)} onClick={openPicker} onClear={onClear} />
      {helperText ? <FormHelperText error={error}>{helperText}</FormHelperText> : null}
      <Popover open={open} anchorEl={anchorEl} onClose={closePicker} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} slotProps={{ paper: { sx: { mt: 1, width: { xs: 'calc(100vw - 32px)', md: presetsEnabled ? 760 : 560, lg: presetsEnabled ? 840 : 650 }, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 120px)', overflow: 'auto', borderRadius: 3, boxShadow: '0 18px 60px rgba(15, 23, 42, 0.18)' } } }}>
        <Paper elevation={0} role="dialog" aria-label={`${label} picker`}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ p: 2 }}>
            {presetsEnabled ? <DateRangePresetList selectedPreset={draft.preset} onSelect={selectPreset} /> : null}
            <DateRangeCalendar month={visibleMonth} value={draft} onMonthChange={setVisibleMonth} onSelectDate={selectDate} minDate={minDate} maxDate={maxDate} />
          </Stack>
          <Divider />
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ p: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Selected range</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }} aria-live="polite">
                {draft.preset === 'customRange' ? formatDateRangeDisplay(draft) : dateRangePresetLabels[draft.preset]}
              </Typography>
              {rangeError ? <FormHelperText error>{rangeError}</FormHelperText> : null}
            </Box>
            <Stack direction="row" gap={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={closePicker}>Cancel</Button>
              <Button variant="contained" onClick={applyDraft} disabled={!canApply}>Apply</Button>
            </Stack>
          </Stack>
        </Paper>
      </Popover>
    </Box>
  );
}

export const EnterpriseDateRangePicker = DateRangePicker;