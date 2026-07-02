import { Box, Button, Divider, Paper, Popover, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { DateRangeCalendar } from './DateRangeCalendar';
import { DateRangeInput } from './DateRangeInput';
import { DateRangePresetList } from './DateRangePresetList';
import {
  createDateRangeValue,
  dateRangePresetLabels,
  formatDateOnly,
  parseDateOnly,
  resolvePresetRange,
  startOfMonth,
  type DateRangePreset,
  type DateRangeValue,
} from './date-range-utils';

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  defaultPreset?: DateRangePreset;
}

export function DateRangePicker({ value, onChange, defaultPreset = 'currentWeek' }: DateRangePickerProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const initialMonth = useMemo(() => parseDateOnly(value.dateFrom) ?? new Date(), [value.dateFrom]);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(initialMonth));
  const open = Boolean(anchorEl);

  useEffect(() => {
    if (!open) {
      setDraft(value.dateFrom || value.dateTo ? value : createDateRangeValue(defaultPreset));
    }
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
      if (!current.dateFrom || current.dateTo) {
        return { preset: 'customRange', dateFrom: selected, dateTo: '' };
      }

      const currentFrom = parseDateOnly(current.dateFrom);
      if (currentFrom && date.getTime() < currentFrom.getTime()) {
        return { preset: 'customRange', dateFrom: selected, dateTo: current.dateFrom };
      }

      return { preset: 'customRange', dateFrom: current.dateFrom, dateTo: selected };
    });
  }

  function applyDraft() {
    if (draft.preset !== 'customRange') {
      onChange({ preset: draft.preset, ...resolvePresetRange(draft.preset) });
      setAnchorEl(null);
      return;
    }

    onChange(draft);
    setAnchorEl(null);
  }

  const canApply = draft.preset !== 'customRange' || Boolean(draft.dateFrom && draft.dateTo);

  return (
    <>
      <DateRangeInput value={value.dateFrom || value.dateTo ? value : createDateRangeValue(defaultPreset)} onClick={openPicker} />
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={closePicker}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: { xs: 'calc(100vw - 32px)', md: 760, lg: 840 },
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 120px)',
              overflow: 'auto',
              borderRadius: 3,
              boxShadow: '0 18px 60px rgba(15, 23, 42, 0.18)',
            },
          },
        }}
      >
        <Paper elevation={0}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ p: 2 }}>
            <DateRangePresetList selectedPreset={draft.preset} onSelect={selectPreset} />
            <DateRangeCalendar month={visibleMonth} value={draft} onMonthChange={setVisibleMonth} onSelectDate={selectDate} />
          </Stack>
          <Divider />
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ p: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Selected range
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {draft.preset === 'customRange'
                  ? `${draft.dateFrom || 'Start date'} → ${draft.dateTo || 'End date'}`
                  : dateRangePresetLabels[draft.preset]}
              </Typography>
            </Box>
            <Stack direction="row" gap={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={closePicker}>Cancel</Button>
              <Button variant="contained" onClick={applyDraft} disabled={!canApply}>Apply</Button>
            </Stack>
          </Stack>
        </Paper>
      </Popover>
    </>
  );
}
