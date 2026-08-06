import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Autocomplete, Box, Chip, FormControl, FormControlLabel, FormHelperText, InputAdornment, InputLabel, MenuItem, Radio, RadioGroup, Select, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { Building2, CalendarDays, ClipboardList, MapPin, PencilLine } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { DateRangePicker, createCustomDateRangeValue } from '@/components/enterprise/date-range';
import { FormActions } from '@/components/form-actions';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { useBranches, useDepartments } from '@/features/organization/hooks';
import { timezoneOptions } from '@/features/organization/utils/shift-form';
import { createShiftRoster } from '../services/shift-rosters-api';
import type { ShiftRosterFormValues, ShiftRosterScope } from '../types/shift-roster.types';
import { dateInputFromDate, formatDurationDays, inclusiveDateDuration, suggestedRosterCode } from '../utils/shift-roster-utils';

const codePattern = /^[A-Z0-9_-]+$/;

const schema = z.object({
  name: z.string().trim().min(2, 'Roster name is required'),
  code: z.string().trim().min(2, 'Roster code is required').max(40, 'Roster code is too long').regex(codePattern, 'Use uppercase letters, numbers, underscores, or hyphens only.'),
  notes: z.string(),
  scope: z.enum(['COMPANY', 'BRANCH', 'DEPARTMENT']),
  branchId: z.string(),
  departmentId: z.string(),
  dateFrom: z.string().min(1, 'Start date is required'),
  dateTo: z.string().min(1, 'End date is required'),
  timezone: z.string().trim().min(1, 'Timezone is required').refine((value) => timezoneOptions.includes(value), 'Select a valid IANA timezone.'),
}).refine((value) => value.dateTo >= value.dateFrom, { path: ['dateTo'], message: 'End date must be on or after the start date.' })
  .refine((value) => value.scope !== 'BRANCH' || Boolean(value.branchId), { path: ['branchId'], message: 'Select a branch for branch scope.' })
  .refine((value) => value.scope !== 'DEPARTMENT' || Boolean(value.departmentId), { path: ['departmentId'], message: 'Select a department for department scope.' });

export default function ShiftRosterCreatePage() {
  return <ShiftRosterForm mode="create" />;
}

export function ShiftRosterForm({ mode, initialValues, rosterId }: { mode: 'create' | 'edit'; initialValues?: ShiftRosterFormValues; rosterId?: string }) {
  const navigate = useNavigate();
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const today = dateInputFromDate(new Date());
  const initialManualCode = Boolean(initialValues?.code);
  const [manualCode, setManualCode] = useState(initialManualCode);
  const previousGeneratedCode = useRef(initialValues?.code ?? '');
  const form = useForm<ShiftRosterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues ?? { name: '', code: '', notes: '', scope: 'COMPANY', branchId: '', departmentId: '', dateFrom: today, dateTo: today, timezone: 'Asia/Kolkata' },
  });

  const name = useWatch({ control: form.control, name: 'name' });
  const dateFrom = useWatch({ control: form.control, name: 'dateFrom' });
  const dateTo = useWatch({ control: form.control, name: 'dateTo' });
  const scope = useWatch({ control: form.control, name: 'scope' });
  const branchId = useWatch({ control: form.control, name: 'branchId' });
  const duration = inclusiveDateDuration(dateFrom, dateTo);

  useEffect(() => {
    if (manualCode) return;
    const next = suggestedRosterCode(name, dateFrom);
    previousGeneratedCode.current = next;
    form.setValue('code', next, { shouldDirty: Boolean(name), shouldValidate: Boolean(name) });
  }, [dateFrom, form, manualCode, name]);

  useEffect(() => {
    if (scope === 'COMPANY') {
      form.setValue('branchId', '', { shouldDirty: true, shouldValidate: true });
      form.setValue('departmentId', '', { shouldDirty: true, shouldValidate: true });
    }
    if (scope === 'BRANCH') {
      form.setValue('departmentId', '', { shouldDirty: true, shouldValidate: true });
    }
  }, [form, scope]);

  const mutation = useMutation({
    mutationFn: async (values: ShiftRosterFormValues) => {
      const payload = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        notes: values.notes.trim() || undefined,
        branchId: values.scope === 'BRANCH' ? values.branchId || undefined : undefined,
        departmentId: values.scope === 'DEPARTMENT' ? values.departmentId || undefined : undefined,
        dateFrom: values.dateFrom,
        dateTo: values.dateTo,
        timezone: values.timezone.trim(),
      };
      if (mode === 'edit' && rosterId) {
        const { updateShiftRoster } = await import('../services/shift-rosters-api');
        return updateShiftRoster(rosterId, payload);
      }
      return createShiftRoster(payload);
    },
    onSuccess: (response) => navigate(`/scheduling/shift-roster/${response.data.id}`, { replace: true, state: { success: mode === 'edit' ? 'Roster updated.' : 'Draft roster created.' } }),
  });

  const departments = departmentsQuery.data?.data.data ?? [];
  const branches = branchesQuery.data?.data.data ?? [];
  const filteredDepartments = useMemo(() => departments.filter((department) => !branchId || department.branchId === branchId), [branchId, departments]);
  const codeValue = form.watch('code');

  return (
    <PageLayout>
      <PageHeader
        title={mode === 'edit' ? 'Edit Shift Roster' : 'Create Draft Roster'}
        description="Create a roster period and add employee schedules after saving the draft."
        breadcrumbs={['Admin', 'Scheduling', 'Shift Roster', mode === 'edit' ? 'Edit' : 'Create']}
      />

      {mutation.isError ? <Alert severity="error">Roster could not be saved. Check field values and tenant scope, then try again.</Alert> : null}

      <Box component="form" onSubmit={form.handleSubmit((values) => mutation.mutate(values))} sx={{ pb: 1 }}>
        <Stack gap={2.5}>
          <SectionCard title="General" description="Name, code, and operational notes for this roster period." action={<ClipboardList size={20} aria-hidden />}>
            <Stack gap={2}>
              <TextField label="Roster Name" {...form.register('name')} error={Boolean(form.formState.errors.name)} helperText={form.formState.errors.name?.message} fullWidth />
              <TextField
                label="Roster Code"
                {...form.register('code', { onChange: () => setManualCode(true) })}
                error={Boolean(form.formState.errors.code)}
                helperText={form.formState.errors.code?.message ?? 'Suggested code only. Backend validates uniqueness.'}
                fullWidth
                InputProps={{
                  endAdornment: <InputAdornment position="end"><Chip size="small" icon={manualCode ? <PencilLine size={14} /> : undefined} label={manualCode ? 'Manual' : 'Auto-generated'} variant="outlined" /></InputAdornment>,
                }}
                onBlur={() => form.setValue('code', codeValue.trim().toUpperCase(), { shouldDirty: true, shouldValidate: true })}
              />
              <TextField label="Notes" {...form.register('notes')} multiline minRows={3} fullWidth />
            </Stack>
          </SectionCard>

          <SectionCard title="Scope" description="Choose whether this roster covers the full company, one branch, or one department." action={<Building2 size={20} aria-hidden />}>
            <Stack gap={2}>
              <Controller control={form.control} name="scope" render={({ field }) => (
                <FormControl>
                  <RadioGroup row {...field} aria-label="Roster scope">
                    <FormControlLabel value="COMPANY" control={<Radio />} label="Entire Company" />
                    <FormControlLabel value="BRANCH" control={<Radio />} label="Branch" />
                    <FormControlLabel value="DEPARTMENT" control={<Radio />} label="Department" />
                  </RadioGroup>
                </FormControl>
              )} />
              {scope === 'BRANCH' ? (
                <Controller control={form.control} name="branchId" render={({ field }) => (
                  <FormControl fullWidth error={Boolean(form.formState.errors.branchId)}>
                    <InputLabel id="roster-branch-label">Branch</InputLabel>
                    <Select {...field} labelId="roster-branch-label" label="Branch" disabled={branchesQuery.isLoading}>
                      <MenuItem value="">Select Branch</MenuItem>
                      {branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
                    </Select>
                    {form.formState.errors.branchId ? <FormHelperText>{form.formState.errors.branchId.message}</FormHelperText> : null}
                  </FormControl>
                )} />
              ) : null}
              {scope === 'DEPARTMENT' ? (
                <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                  <Controller control={form.control} name="branchId" render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel id="roster-department-branch-label">Branch</InputLabel>
                      <Select {...field} labelId="roster-department-branch-label" label="Branch" disabled={branchesQuery.isLoading} onChange={(event) => { field.onChange(event); form.setValue('departmentId', '', { shouldDirty: true, shouldValidate: true }); }}>
                        <MenuItem value="">All Branches</MenuItem>
                        {branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )} />
                  <Controller control={form.control} name="departmentId" render={({ field }) => (
                    <FormControl fullWidth error={Boolean(form.formState.errors.departmentId)}>
                      <InputLabel id="roster-department-label">Department</InputLabel>
                      <Select {...field} labelId="roster-department-label" label="Department" disabled={departmentsQuery.isLoading}>
                        <MenuItem value="">Select Department</MenuItem>
                        {filteredDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
                      </Select>
                      {form.formState.errors.departmentId ? <FormHelperText>{form.formState.errors.departmentId.message}</FormHelperText> : null}
                    </FormControl>
                  )} />
                </Stack>
              ) : null}
            </Stack>
          </SectionCard>

          <SectionCard title="Period" description="Roster dates are inclusive calendar work dates and are submitted as YYYY-MM-DD." action={<CalendarDays size={20} aria-hidden />}>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
              <Controller control={form.control} name="dateFrom" render={({ field: startField }) => (
                <Controller control={form.control} name="dateTo" render={({ field: endField }) => (
                  <Box sx={{ flex: 1 }}>
                    <DateRangePicker
                      label="Roster Period"
                      value={createCustomDateRangeValue(startField.value, endField.value)}
                      mode="form"
                      defaultPreset="customRange"
                      presetsEnabled={false}
                      onChange={(value) => { startField.onChange(value.dateFrom); endField.onChange(value.dateTo); }}
                      error={Boolean(form.formState.errors.dateFrom || form.formState.errors.dateTo)}
                      helperText={form.formState.errors.dateFrom?.message ?? form.formState.errors.dateTo?.message ?? 'Select the start and end work dates.'}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>Duration: {formatDurationDays(duration)}</Typography>
                  </Box>
                )} />
              )} />
              <Controller control={form.control} name="timezone" render={({ field }) => (
                <Autocomplete
                  options={timezoneOptions}
                  value={field.value}
                  onChange={(_, value) => field.onChange(value ?? '')}
                  renderInput={(params) => <TextField {...params} label="Timezone" error={Boolean(form.formState.errors.timezone)} helperText={form.formState.errors.timezone?.message ?? 'IANA timezone used for roster scheduling.'} />}
                  fullWidth
                />
              )} />
            </Stack>
          </SectionCard>
        </Stack>
        <FormActions cancelTo={mode === 'edit' && rosterId ? `/scheduling/shift-roster/${rosterId}` : '/scheduling/shift-roster'} submitLabel={mode === 'edit' ? 'Save Roster' : 'Create Draft'} loading={mutation.isPending} />
      </Box>
    </PageLayout>
  );
}