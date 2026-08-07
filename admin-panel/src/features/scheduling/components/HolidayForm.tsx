import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { CalendarDays, Info } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import type { Holiday, HolidayFormValues, HolidayPayload } from '../types/holiday-calendar.types';
import { dayOfWeek, holidayDefaults, holidaySchema, holidayTypes, toHolidayPayload } from '../utils/holiday-calendar-utils';

interface Props { calendarId: string; calendarYear?: number | null; holiday?: Holiday; loading?: boolean; submitLabel: string; errorMessage?: string | null; onSubmit: (payload: HolidayPayload) => Promise<void> }

export function HolidayForm({ calendarId, calendarYear, holiday, loading = false, submitLabel, errorMessage, onSubmit }: Props) {
  const { control, handleSubmit, formState: { errors }, watch } = useForm<HolidayFormValues>({ resolver: zodResolver(holidaySchema), defaultValues: holidayDefaults(holiday) });
  const values = watch();
  const submit = handleSubmit((formValues) => onSubmit(toHolidayPayload(formValues)));
  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      <SectionCard title="Holiday" description="Holiday name, date, type, and optional scheduling flags." action={<CalendarDays size={20} aria-hidden />}>
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Holiday Name" fullWidth disabled={loading} error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller control={control} name="date" render={({ field }) => <TextField {...field} type="date" label="Holiday Date" fullWidth disabled={loading} error={Boolean(errors.date)} helperText={errors.date?.message ?? `${dayOfWeek(field.value)}${calendarYear ? ` · Calendar year ${calendarYear}` : ''}`} InputLabelProps={{ shrink: true }} />} />
          <Controller control={control} name="type" render={({ field }) => <TextField {...field} select label="Holiday Type" fullWidth disabled={loading} error={Boolean(errors.type)} helperText={errors.type?.message}>{holidayTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}</TextField>} />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
            <Controller control={control} name="optional" render={({ field }) => <FormControlLabel control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} disabled={loading} />} label={field.value ? 'Optional holiday' : 'Mandatory holiday'} />} />
            <Controller control={control} name="recurring" render={({ field }) => <FormControlLabel control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} disabled={loading} />} label={field.value ? 'Recurring yearly' : 'One-time'} />} />
          </Stack>
          <Controller control={control} name="notes" render={({ field }) => <TextField {...field} label="Notes" fullWidth multiline minRows={3} disabled={loading} error={Boolean(errors.notes)} helperText={errors.notes?.message ?? 'Add internal context for HR and scheduling teams.'} />} />
        </Box>
      </SectionCard>
      {values.recurring ? <Alert severity="info" icon={<Info size={18} />}>Recurring holidays repeat by month and day for this calendar. Keep the original date in the selected calendar year.</Alert> : null}
      <FormActions cancelTo={`/scheduling/holiday-calendar/${calendarId}`} submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
