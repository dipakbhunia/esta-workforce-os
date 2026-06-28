import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import type { Shift, ShiftFormValues } from '../types/shift.types';
import { formatWorkingHours, shiftCodeFromName, shiftDefaults, shiftFormSchema, timezoneOptions, toShiftPayload } from '../utils/shift-form';

interface ShiftFormProps {
  shift?: Shift;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnType<typeof toShiftPayload>) => Promise<void>;
}

export function ShiftForm({ shift, loading = false, submitLabel, onSubmit }: ShiftFormProps) {
  const [manualCode, setManualCode] = useState(Boolean(shift));
  const initialValues = useRef(shiftDefaults(shift));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: initialValues.current,
  });
  const name = watch('name');
  const startTime = watch('startTime');
  const endTime = watch('endTime');

  useEffect(() => {
    if (!manualCode) {
      setValue('code', shiftCodeFromName(name), { shouldDirty: true, shouldValidate: true });
    }
  }, [manualCode, name, setValue]);

  useEffect(() => {
    // TODO: Add in-app route blocking once the router layer exposes a stable blocker API for data routers.
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toShiftPayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <SectionCard title="General" description="Core shift identity within the current company workspace.">
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Shift Name" fullWidth error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextField
                {...field}
                label="Shift Code"
                fullWidth
                error={Boolean(errors.code)}
                helperText={errors.code?.message ?? 'Auto-generated from name until manually edited.'}
                onChange={(event) => {
                  setManualCode(true);
                  field.onChange(event);
                }}
              />
            )}
          />
        </Box>
      </SectionCard>

      <SectionCard title="Timing" description="Working window and timezone. Working hours are calculated for display only.">
        <Stack gap={2}>
          <Box sx={formGrid}>
            <Controller control={control} name="startTime" render={({ field }) => <TextField {...field} type="time" label="Start Time" fullWidth error={Boolean(errors.startTime)} helperText={errors.startTime?.message} InputLabelProps={{ shrink: true }} />} />
            <Controller control={control} name="endTime" render={({ field }) => <TextField {...field} type="time" label="End Time" fullWidth error={Boolean(errors.endTime)} helperText={errors.endTime?.message} InputLabelProps={{ shrink: true }} />} />
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <TextField {...field} select label="Timezone" fullWidth error={Boolean(errors.timezone)} helperText={errors.timezone?.message ?? 'IANA timezone used by backend attendance calculations.'}>
                  {timezoneOptions.map((timezone) => <MenuItem key={timezone} value={timezone}>{timezone}</MenuItem>)}
                </TextField>
              )}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">Working Hours</Typography>
              <Typography fontWeight={800}>{formatWorkingHours(startTime, endTime)}</Typography>
              <Typography variant="caption" color="text.secondary">Calculated in the frontend. Not sent to backend.</Typography>
            </Box>
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Future Policy Placeholders" description="These settings are UI-only placeholders until backend policy fields are added.">
        <Alert severity="info">Grace time, half-day, overtime, and late-mark rules are not submitted to the backend in this phase.</Alert>
        <Box sx={formGrid}>
          <Controller control={control} name="graceTime" render={({ field }) => <TextField {...field} label="Grace Time" placeholder="Example: 10 minutes" fullWidth />} />
          <Controller control={control} name="halfDayRule" render={({ field }) => <TextField {...field} label="Half Day Rule" placeholder="Example: Less than 4 hours" fullWidth />} />
          <Controller control={control} name="overtimeRule" render={({ field }) => <TextField {...field} label="Overtime Rule" placeholder="Example: After shift end" fullWidth />} />
          <Controller control={control} name="lateMarkRule" render={({ field }) => <TextField {...field} label="Late Mark Rule" placeholder="Example: After 09:15" fullWidth />} />
        </Box>
      </SectionCard>

      <FormActions cancelTo="/organization/shifts" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
