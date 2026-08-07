import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Autocomplete, Box, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Typography } from '@mui/material';
import { Building2, CalendarDays, GitBranch, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { useBranches } from '@/features/organization/hooks';
import { timezoneOptions } from '@/features/organization/utils/shift-form';
import type { HolidayCalendar, HolidayCalendarFormValues, HolidayCalendarPayload, HolidayCalendarScope } from '../types/holiday-calendar.types';
import { holidayCalendarDefaults, holidayCalendarSchema, toHolidayCalendarPayload } from '../utils/holiday-calendar-utils';

interface Props { calendar?: HolidayCalendar; loading?: boolean; submitLabel: string; errorMessage?: string | null; onSubmit: (payload: HolidayCalendarPayload) => Promise<void> }

export function HolidayCalendarForm({ calendar, loading = false, submitLabel, errorMessage, onSubmit }: Props) {
  const branchesQuery = useBranches();
  const branches = branchesQuery.data?.data.data ?? [];
  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<HolidayCalendarFormValues>({ resolver: zodResolver(holidayCalendarSchema), defaultValues: holidayCalendarDefaults(calendar) });
  const values = watch();
  const submit = handleSubmit((formValues) => onSubmit(toHolidayCalendarPayload(formValues)));

  const updateScope = (scope: HolidayCalendarScope, onChange: (value: HolidayCalendarScope) => void) => {
    onChange(scope);
    if (scope === 'COMPANY') setValue('branchId', '', { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Stack component="form" gap={3} onSubmit={submit} noValidate>
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      <Alert severity="info" icon={<Info size={18} />}>Company calendars apply across the organization. Branch calendars apply only to the selected branch.</Alert>
      <SectionCard title="General" description="Name the calendar, choose its year, and keep the calendar status clear for HR teams." action={<CalendarDays size={20} aria-hidden />}>
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Calendar Name" fullWidth disabled={loading} error={Boolean(errors.name)} helperText={errors.name?.message ?? 'Example: India Holidays 2026'} />} />
          <Controller control={control} name="year" render={({ field }) => <TextField {...field} type="number" label="Calendar Year" fullWidth disabled={loading} error={Boolean(errors.year)} helperText={errors.year?.message ?? 'Use a four-digit calendar year.'} onChange={(event) => field.onChange(Number(event.target.value))} inputProps={{ min: 1900, max: 2200 }} />} />
          <Controller control={control} name="timezone" render={({ field }) => (
            <Autocomplete
              options={timezoneOptions}
              value={field.value || 'Asia/Kolkata'}
              onChange={(_, value) => field.onChange(value ?? '')}
              disabled={loading}
              renderInput={(params) => <TextField {...params} label="Timezone" error={Boolean(errors.timezone)} helperText={errors.timezone?.message ?? 'Used to present calendar dates consistently.'} />}
            />
          )} />
          <Controller control={control} name="enabled" render={({ field }) => <FormControlLabel sx={{ alignSelf: 'center', minHeight: 56 }} control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} disabled={loading} inputProps={{ 'aria-label': 'Active calendar' }} />} label={field.value ? 'Active calendar' : 'Inactive calendar'} />} />
          <Controller control={control} name="description" render={({ field }) => <TextField {...field} label="Description" fullWidth multiline minRows={2} disabled={loading} error={Boolean(errors.description)} helperText={errors.description?.message ?? 'Briefly describe when this calendar should be used.'} />} />
          <Controller control={control} name="notes" render={({ field }) => <TextField {...field} label="Internal Notes" fullWidth multiline minRows={2} disabled={loading} error={Boolean(errors.notes)} helperText={errors.notes?.message ?? 'Visible to administrators only.'} />} />
        </Box>
      </SectionCard>
      <SectionCard title="Scope" description="Choose whether this holiday calendar applies company-wide or only to one branch." action={<Building2 size={20} aria-hidden />}>
        <Stack gap={2}>
          <Controller control={control} name="scope" render={({ field }) => <RadioGroup {...field} aria-label="Holiday calendar scope" onChange={(event) => updateScope(event.target.value as HolidayCalendarScope, field.onChange)} sx={scopeGrid}><ScopeCard value="COMPANY" selected={field.value === 'COMPANY'} title="Entire Company" description="Applies to every branch unless a branch-specific calendar is selected for that branch." icon={<Building2 size={18} />} /><ScopeCard value="BRANCH" selected={field.value === 'BRANCH'} title="Branch" description="Applies only to one branch for regional or location-specific holidays." icon={<GitBranch size={18} />} /></RadioGroup>} />
          {values.scope === 'BRANCH' ? <Controller control={control} name="branchId" render={({ field }) => <TextField {...field} select label="Branch" fullWidth disabled={loading || branchesQuery.isLoading} error={Boolean(errors.branchId)} helperText={errors.branchId?.message ?? (branchesQuery.isError ? 'Branches could not be loaded. Refresh and try again.' : 'Select the branch this holiday calendar applies to.')}><MenuItem value="">Select Branch</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField>} /> : null}
        </Stack>
      </SectionCard>
      <FormActions cancelTo="/scheduling/holiday-calendar" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

function ScopeCard({ value, title, description, icon, selected }: { value: HolidayCalendarScope; title: string; description: string; icon: ReactNode; selected: boolean }) {
  return <FormControlLabel value={value} control={<Radio size="small" />} label={<Stack direction="row" gap={1.25} alignItems="flex-start"><Box color={selected ? 'primary.main' : 'text.secondary'}>{icon}</Box><Box><Typography fontWeight={850}>{title}</Typography><Typography variant="caption" color="text.secondary">{description}</Typography></Box></Stack>} sx={{ m: 0, p: 1.25, border: '1px solid', borderColor: selected ? 'primary.main' : 'divider', borderRadius: 2.5, bgcolor: selected ? 'action.selected' : 'background.paper', '& .MuiFormControlLabel-label': { flex: 1 } }} />;
}

const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
const scopeGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 };