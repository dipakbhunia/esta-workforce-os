import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Autocomplete, Box, Button, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Typography } from '@mui/material';
import { Building2, CalendarDays, GitBranch, Info, Layers3, Network, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useBranches, useDepartments, useShifts } from '@/features/organization/hooks';
import { timezoneOptions } from '@/features/organization/utils/shift-form';
import type { RosterTemplate, RosterTemplateDayPayload, RosterTemplateFormValues, RosterTemplatePayload, RosterTemplateScope } from '../types/roster-template.types';
import { dayTypeLabel, dayTypeTone, rosterTemplateDefaults, rosterTemplateSchema, rosterTemplateScopeOptions, suggestedTemplateCode, templateWeekdays, toRosterTemplatePayload } from '../utils/roster-template-utils';

interface Props {
  template?: RosterTemplate;
  loading?: boolean;
  submitLabel: string;
  errorMessage?: string | null;
  onSubmit: (payload: RosterTemplatePayload) => Promise<void>;
}

const scopeIcons: Record<RosterTemplateScope, typeof Building2> = { COMPANY: Building2, BRANCH: GitBranch, DEPARTMENT: Network };

export function RosterTemplateForm({ template, loading = false, submitLabel, errorMessage, onSubmit }: Props) {
  const initialValues = useRef(rosterTemplateDefaults(template));
  const codeTouched = useRef(Boolean(template?.code));
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const shiftsQuery = useShifts();
  const { control, handleSubmit, formState: { errors, isDirty }, setValue, watch, reset } = useForm<RosterTemplateFormValues>({ resolver: zodResolver(rosterTemplateSchema), defaultValues: initialValues.current });
  const { fields } = useFieldArray({ control, name: 'days' });
  const values = watch();
  const branches = branchesQuery.data?.data.data ?? [];
  const departments = departmentsQuery.data?.data.data ?? [];
  const shifts = shiftsQuery.data?.data.data ?? [];
  const filteredDepartments = useMemo(() => departments.filter((department) => !values.branchId || department.branchId === values.branchId), [departments, values.branchId]);

  useEffect(() => {
    if (!codeTouched.current && values.name) setValue('code', suggestedTemplateCode(values.name), { shouldValidate: true });
  }, [setValue, values.name]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (formValues) => {
    await onSubmit(toRosterTemplatePayload(formValues));
    reset(formValues);
  });

  const updateScope = (scope: RosterTemplateScope, onChange: (value: RosterTemplateScope) => void) => {
    onChange(scope);
    if (scope === 'COMPANY') {
      setValue('branchId', '', { shouldDirty: true, shouldValidate: true });
      setValue('departmentId', '', { shouldDirty: true, shouldValidate: true });
    }
    if (scope === 'BRANCH') setValue('departmentId', '', { shouldDirty: true, shouldValidate: true });
  };

  const workingDays = values.days.filter((day) => day.dayType === 'WORKING').length;
  const weeklyOffDays = values.days.filter((day) => day.dayType === 'WEEKLY_OFF').length;
  const noShiftDays = values.days.filter((day) => day.dayType === 'NO_SHIFT').length;

  return (
    <Stack component="form" gap={3} onSubmit={submit} noValidate>
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      <Alert severity="info" icon={<Info size={18} />}>Roster templates help you reuse a standard weekly work pattern when creating draft rosters.</Alert>

      <SectionCard title="General" description="Name, code, timezone, and status for this reusable roster template." action={<CalendarDays size={20} aria-hidden />}>
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Template Name" fullWidth disabled={loading} error={Boolean(errors.name)} helperText={errors.name?.message ?? 'Example: General Weekday Template'} />} />
          <Controller control={control} name="code" render={({ field }) => <TextField {...field} label="Template Code" fullWidth disabled={loading} error={Boolean(errors.code)} helperText={errors.code?.message ?? 'Auto-generated from name. Manual override is supported.'} onChange={(event) => { codeTouched.current = true; field.onChange(event.target.value.toUpperCase().replace(/[^A-Z0-9_\-]/g, '_')); }} />} />
          <Controller control={control} name="timezone" render={({ field }) => <Autocomplete options={timezoneOptions} value={field.value || 'Asia/Kolkata'} onChange={(_, value) => field.onChange(value ?? '')} disabled={loading} renderInput={(params) => <TextField {...params} label="Timezone" error={Boolean(errors.timezone)} helperText={errors.timezone?.message ?? 'Used to present dates consistently when planning rosters.'} />} />} />
          <Controller control={control} name="enabled" render={({ field }) => <FormControlLabel sx={{ alignSelf: 'center', minHeight: 56 }} control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} disabled={loading} inputProps={{ 'aria-label': 'Active roster template' }} />} label={field.value ? 'Active template' : 'Inactive template'} />} />
          <Controller control={control} name="description" render={({ field }) => <TextField {...field} label="Description" fullWidth multiline minRows={2} disabled={loading} error={Boolean(errors.description)} helperText={errors.description?.message ?? 'Briefly describe when HR should use this template.'} />} />
          <Controller control={control} name="notes" render={({ field }) => <TextField {...field} label="Internal Notes" fullWidth multiline minRows={2} disabled={loading} error={Boolean(errors.notes)} helperText={errors.notes?.message ?? 'Visible to administrators only.'} />} />
        </Box>
      </SectionCard>

      <SectionCard title="Scope" description="Choose where this template is intended to be reused." action={<Layers3 size={20} aria-hidden />}>
        <Stack gap={2}>
          <Controller control={control} name="scope" render={({ field }) => <RadioGroup {...field} aria-label="Roster template scope" onChange={(event) => updateScope(event.target.value as RosterTemplateScope, field.onChange)} sx={scopeGrid}>{rosterTemplateScopeOptions.map((option) => <ScopeCard key={option.value} value={option.value} selected={field.value === option.value} title={option.label} description={option.description} icon={scopeIcons[option.value]} />)}</RadioGroup>} />
          <Box sx={formGrid}>
            {values.scope !== 'COMPANY' ? <Controller control={control} name="branchId" render={({ field }) => <TextField {...field} select label="Branch" fullWidth disabled={loading || branchesQuery.isLoading} error={Boolean(errors.branchId)} helperText={errors.branchId?.message ?? selectorHelper(branchesQuery.isLoading, branchesQuery.isError, 'branches')} onChange={(event) => { field.onChange(event); setValue('departmentId', '', { shouldDirty: true, shouldValidate: true }); }}><MenuItem value="">Select Branch</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField>} /> : null}
            {values.scope === 'DEPARTMENT' ? <Controller control={control} name="departmentId" render={({ field }) => <TextField {...field} select label="Department" fullWidth disabled={loading || departmentsQuery.isLoading} error={Boolean(errors.departmentId)} helperText={errors.departmentId?.message ?? selectorHelper(departmentsQuery.isLoading, departmentsQuery.isError, 'departments')}><MenuItem value="">Select Department</MenuItem>{filteredDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}</TextField>} /> : null}
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Weekly Pattern" description="Set the standard Monday-to-Sunday pattern for this template." action={<ShieldCheck size={20} aria-hidden />}>
        <Stack gap={1.75}>
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={summaryChipGroupSx} aria-label="Weekly pattern summary">
            <StatusChip label={`Working: ${workingDays}`} tone="success" />
            <StatusChip label={`Weekly Off: ${weeklyOffDays}`} tone="info" />
            <StatusChip label={`No Shift: ${noShiftDays}`} tone="neutral" />
          </Stack>
          <Box sx={weekdayGrid}>
            {fields.map((field, index) => {
              const weekday = templateWeekdays[index];
              const selectedType = values.days[index]?.dayType ?? 'NO_SHIFT';
              const shiftError = errors.days?.[index]?.shiftId?.message;
              return (
                <Box key={field.id} sx={dayCardSx}>
                  <Stack gap={1}>
                    <Box sx={dayHeaderSx}>
                      <Typography fontWeight={900}>{weekday.label}</Typography>
                      <StatusChip label={dayTypeLabel(selectedType)} tone={dayTypeTone(selectedType)} />
                    </Box>
                    <Controller control={control} name={`days.${index}.dayType`} render={({ field: typeField }) => <TextField {...typeField} select label="Day Type" fullWidth size="small" disabled={loading} onChange={(event) => { const next = event.target.value as RosterTemplateDayPayload['dayType']; typeField.onChange(next); if (next !== 'WORKING') setValue(`days.${index}.shiftId`, '', { shouldDirty: true, shouldValidate: true }); }}><MenuItem value="WORKING">Working</MenuItem><MenuItem value="WEEKLY_OFF">Weekly Off</MenuItem><MenuItem value="NO_SHIFT">No Shift</MenuItem></TextField>} />
                    {selectedType === 'WORKING' ? <Controller control={control} name={`days.${index}.shiftId`} render={({ field: shiftField }) => <TextField {...shiftField} select label="Shift" fullWidth size="small" disabled={loading || shiftsQuery.isLoading} error={Boolean(shiftError)} helperText={shiftError ?? selectorHelper(shiftsQuery.isLoading, shiftsQuery.isError, 'shifts')}><MenuItem value="">Select Shift</MenuItem>{shifts.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name} ({shift.code})</MenuItem>)}</TextField>} /> : <Box sx={stateBoxSx}><Typography variant="caption" fontWeight={800}>{dayTypeLabel(selectedType)}</Typography><Typography variant="caption" color="text.secondary">No shift required for this day.</Typography></Box>}
                    <Controller control={control} name={`days.${index}.notes`} render={({ field: notesField }) => <TextField {...notesField} label="Notes (optional)" placeholder="Optional note" fullWidth size="small" disabled={loading} error={Boolean(errors.days?.[index]?.notes)} helperText={errors.days?.[index]?.notes?.message} />} />
                  </Stack>
                </Box>
              );
            })}
          </Box>
          <Box sx={quickSetupSx}>
            <Typography variant="caption" fontWeight={850} color="text.secondary">Quick setup</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button type="button" size="small" variant="outlined" onClick={() => templateWeekdays.forEach((_, index) => setValue(`days.${index}.dayType`, index >= 5 ? 'WEEKLY_OFF' : 'WORKING', { shouldDirty: true, shouldValidate: true }))}>Weekdays Working</Button>
              <Button type="button" size="small" variant="outlined" onClick={() => templateWeekdays.forEach((_, index) => setValue(`days.${index}.dayType`, 'WORKING', { shouldDirty: true, shouldValidate: true }))}>All Working</Button>
              <Button type="button" size="small" variant="outlined" onClick={() => templateWeekdays.forEach((_, index) => { setValue(`days.${index}.dayType`, 'NO_SHIFT', { shouldDirty: true, shouldValidate: true }); setValue(`days.${index}.shiftId`, '', { shouldDirty: true, shouldValidate: true }); })}>Clear Pattern</Button>
            </Stack>
          </Box>
        </Stack>
      </SectionCard>

      <FormActions cancelTo="/scheduling/roster-templates" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

function ScopeCard({ value, title, description, icon: Icon, selected }: { value: RosterTemplateScope; title: string; description: string; icon: typeof Building2; selected: boolean }) {
  return <FormControlLabel value={value} control={<Radio size="small" />} label={<Stack direction="row" gap={1.25} alignItems="flex-start"><Box color={selected ? 'primary.main' : 'text.secondary'}><Icon size={18} aria-hidden /></Box><Box><Typography fontWeight={850}>{title}</Typography><Typography variant="caption" color="text.secondary">{description}</Typography></Box></Stack>} sx={{ m: 0, p: 1.25, border: '1px solid', borderColor: selected ? 'primary.main' : 'divider', borderRadius: 2.5, bgcolor: selected ? 'action.selected' : 'background.paper', '& .MuiFormControlLabel-label': { flex: 1 } }} />;
}

function selectorHelper(isLoading: boolean, isError: boolean, label: string) {
  if (isLoading) return `Loading ${label}...`;
  if (isError) return `${label[0].toUpperCase()}${label.slice(1)} could not be loaded. Refresh and try again.`;
  return undefined;
}

const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
const scopeGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 };
const summaryChipGroupSx = { '& .MuiChip-root': { height: 26 } };
const weekdayGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 };
const dayCardSx = { p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', minWidth: 0 };
const dayHeaderSx = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 };
const stateBoxSx = { px: 1.25, py: 0.8, border: '1px dashed', borderColor: 'divider', borderRadius: 2, bgcolor: 'grey.50', display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap' };
const quickSetupSx = { display: 'flex', flexDirection: 'column', gap: 0.75, pt: 0.5 };

