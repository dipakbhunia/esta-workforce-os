import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Autocomplete, Box, Button, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Typography } from '@mui/material';
import { CalendarClock, GitBranch, Info, Layers3, Network, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Controller, useFieldArray, useForm, type Resolver } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useBranches, useDepartments, useShifts } from '@/features/organization/hooks';
import { timezoneOptions } from '@/features/organization/utils/shift-form';
import type { RotationPattern, RotationPatternDayPayload, RotationPatternFormValues, RotationPatternPayload, RotationPatternScope } from '../types/rotation-pattern.types';
import { dayTypeLabel, dayTypeTone, resizeRotationDays, rotationPatternDefaults, rotationPatternSchema, rotationPatternScopeOptions, suggestedRotationCode, toRotationPatternPayload } from '../utils/rotation-pattern-utils';

interface Props { pattern?: RotationPattern; loading?: boolean; submitLabel: string; errorMessage?: string | null; onSubmit: (payload: RotationPatternPayload) => Promise<void>; }
const scopeIcons: Record<RotationPatternScope, typeof Layers3> = { COMPANY: Layers3, BRANCH: GitBranch, DEPARTMENT: Network };

export function RotationPatternForm({ pattern, loading = false, submitLabel, errorMessage, onSubmit }: Props) {
  const initialValues = useRef(rotationPatternDefaults(pattern));
  const codeTouched = useRef(Boolean(pattern?.code));
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const shiftsQuery = useShifts();
  const { control, handleSubmit, formState: { errors, isDirty }, setValue, watch, reset } = useForm<RotationPatternFormValues>({ resolver: zodResolver(rotationPatternSchema) as Resolver<RotationPatternFormValues>, defaultValues: initialValues.current });
  const { fields, replace } = useFieldArray({ control, name: 'days' });
  const values = watch();
  const branches = branchesQuery.data?.data.data ?? [];
  const departments = departmentsQuery.data?.data.data ?? [];
  const shifts = shiftsQuery.data?.data.data ?? [];
  const filteredDepartments = useMemo(() => departments.filter((department) => !values.branchId || department.branchId === values.branchId), [departments, values.branchId]);
  const workingDays = values.days.filter((day) => day.dayType === 'WORKING').length;
  const weeklyOffDays = values.days.filter((day) => day.dayType === 'WEEKLY_OFF').length;
  const noShiftDays = values.days.filter((day) => day.dayType === 'NO_SHIFT').length;

  useEffect(() => { if (!codeTouched.current && values.name) setValue('code', suggestedRotationCode(values.name), { shouldValidate: true }); }, [setValue, values.name]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!isDirty) return; event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [isDirty]);

  const submit = handleSubmit(async (formValues) => { await onSubmit(toRotationPatternPayload(formValues)); reset(formValues); });
  const updateScope = (scope: RotationPatternScope, onChange: (value: RotationPatternScope) => void) => { onChange(scope); if (scope === 'COMPANY') { setValue('branchId', '', { shouldDirty: true, shouldValidate: true }); setValue('departmentId', '', { shouldDirty: true, shouldValidate: true }); } if (scope === 'BRANCH') setValue('departmentId', '', { shouldDirty: true, shouldValidate: true }); };
  const updateCycleLength = (nextLength: number) => { const safeLength = Math.min(90, Math.max(2, nextLength)); setValue('cycleLengthDays', safeLength, { shouldDirty: true, shouldValidate: true }); replace(resizeRotationDays(values.days, safeLength)); };

  return <Stack component="form" gap={3} onSubmit={submit} noValidate>
    {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
    <Alert severity="info" icon={<Info size={18} />}>Rotation patterns help you repeat a multi-day shift cycle when planning employee rosters.</Alert>
    <SectionCard title="General" description="Name, code, timezone, cycle length, and status." action={<RotateCw size={20} aria-hidden />}>
      <Box sx={formGrid}>
        <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Pattern Name" fullWidth disabled={loading} error={Boolean(errors.name)} helperText={errors.name?.message ?? 'Example: Four On Two Off'} />} />
        <Controller control={control} name="code" render={({ field }) => <TextField {...field} label="Pattern Code" fullWidth disabled={loading} error={Boolean(errors.code)} helperText={errors.code?.message ?? 'Auto-generated from name. Manual override is supported.'} onChange={(event) => { codeTouched.current = true; field.onChange(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '_')); }} />} />
        <Controller control={control} name="timezone" render={({ field }) => <Autocomplete options={timezoneOptions} value={field.value || 'Asia/Kolkata'} onChange={(_, value) => field.onChange(value ?? '')} disabled={loading} renderInput={(params) => <TextField {...params} label="Timezone" error={Boolean(errors.timezone)} helperText={errors.timezone?.message ?? 'Used for roster planning display.'} />} />} />
        <Controller control={control} name="cycleLengthDays" render={({ field }) => <TextField {...field} type="number" label="Cycle Length" fullWidth disabled={loading} error={Boolean(errors.cycleLengthDays)} helperText={errors.cycleLengthDays?.message ?? 'Choose a cycle between 2 and 90 days.'} onChange={(event) => updateCycleLength(Number(event.target.value || 2))} inputProps={{ min: 2, max: 90 }} />} />
        <Controller control={control} name="anchorDate" render={({ field }) => <TextField {...field} type="date" label="Anchor Date" fullWidth InputLabelProps={{ shrink: true }} disabled={loading} error={Boolean(errors.anchorDate)} helperText={errors.anchorDate?.message ?? 'Optional. Day 1 of the rotation starts from this date.'} />} />
        <Controller control={control} name="enabled" render={({ field }) => <FormControlLabel sx={{ alignSelf: 'center', minHeight: 56 }} control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} disabled={loading} inputProps={{ 'aria-label': 'Active rotation pattern' }} />} label={field.value ? 'Active pattern' : 'Inactive pattern'} />} />
        <Controller control={control} name="description" render={({ field }) => <TextField {...field} label="Description" fullWidth multiline minRows={2} disabled={loading} error={Boolean(errors.description)} helperText={errors.description?.message ?? 'Briefly describe this rotation.'} />} />
        <Controller control={control} name="notes" render={({ field }) => <TextField {...field} label="Internal Notes" fullWidth multiline minRows={2} disabled={loading} error={Boolean(errors.notes)} helperText={errors.notes?.message ?? 'Visible to administrators only.'} />} />
      </Box>
    </SectionCard>

    <SectionCard title="Scope" description="Choose where this rotation pattern is intended to be reused." action={<Layers3 size={20} aria-hidden />}>
      <Stack gap={2}><Controller control={control} name="scope" render={({ field }) => <RadioGroup {...field} aria-label="Rotation pattern scope" onChange={(event) => updateScope(event.target.value as RotationPatternScope, field.onChange)} sx={scopeGrid}>{rotationPatternScopeOptions.map((option) => <ScopeCard key={option.value} value={option.value} selected={field.value === option.value} title={option.label} description={option.description} icon={scopeIcons[option.value]} />)}</RadioGroup>} /><Box sx={formGrid}>{values.scope !== 'COMPANY' ? <Controller control={control} name="branchId" render={({ field }) => <TextField {...field} select label="Branch" fullWidth disabled={loading || branchesQuery.isLoading} error={Boolean(errors.branchId)} helperText={errors.branchId?.message ?? selectorHelper(branchesQuery.isLoading, branchesQuery.isError, 'branches')} onChange={(event) => { field.onChange(event); setValue('departmentId', '', { shouldDirty: true, shouldValidate: true }); }}><MenuItem value="">Select Branch</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField>} /> : null}{values.scope === 'DEPARTMENT' ? <Controller control={control} name="departmentId" render={({ field }) => <TextField {...field} select label="Department" fullWidth disabled={loading || departmentsQuery.isLoading} error={Boolean(errors.departmentId)} helperText={errors.departmentId?.message ?? selectorHelper(departmentsQuery.isLoading, departmentsQuery.isError, 'departments')}><MenuItem value="">Select Department</MenuItem>{filteredDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}</TextField>} /> : null}</Box></Stack>
    </SectionCard>

    <SectionCard title="Rotation Steps" description="Build the day-by-day cycle. The number of cards always matches the cycle length." action={<CalendarClock size={20} aria-hidden />}>
      <Stack gap={1.75}><Stack direction="row" gap={0.75} flexWrap="wrap"><StatusChip label={`Working: ${workingDays}`} tone="success" /><StatusChip label={`Weekly Off: ${weeklyOffDays}`} tone="info" /><StatusChip label={`No Shift: ${noShiftDays}`} tone="neutral" /></Stack><Box sx={stepGrid}>{fields.map((field, index) => { const selectedType = values.days[index]?.dayType ?? 'NO_SHIFT'; const shiftError = errors.days?.[index]?.shiftId?.message; return <Box key={field.id} sx={stepCardSx}><Stack gap={1}><Box sx={stepHeaderSx}><Typography fontWeight={900}>Day {index + 1}</Typography><StatusChip label={dayTypeLabel(selectedType)} tone={dayTypeTone(selectedType)} /></Box><Controller control={control} name={`days.${index}.dayType`} render={({ field: typeField }) => <TextField {...typeField} select label="Day Type" fullWidth size="small" disabled={loading} onChange={(event) => { const next = event.target.value as RotationPatternDayPayload['dayType']; typeField.onChange(next); if (next !== 'WORKING') setValue(`days.${index}.shiftId`, '', { shouldDirty: true, shouldValidate: true }); }}><MenuItem value="WORKING">Working</MenuItem><MenuItem value="WEEKLY_OFF">Weekly Off</MenuItem><MenuItem value="NO_SHIFT">No Shift</MenuItem></TextField>} />{selectedType === 'WORKING' ? <Controller control={control} name={`days.${index}.shiftId`} render={({ field: shiftField }) => <TextField {...shiftField} select label="Shift" fullWidth size="small" disabled={loading || shiftsQuery.isLoading} error={Boolean(shiftError)} helperText={shiftError ?? selectorHelper(shiftsQuery.isLoading, shiftsQuery.isError, 'shifts')}><MenuItem value="">Select Shift</MenuItem>{shifts.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name} ({shift.code})</MenuItem>)}</TextField>} /> : <Box sx={stateBoxSx}><Typography variant="caption" fontWeight={800}>{nonWorkingHelper(selectedType)}</Typography></Box>}<Controller control={control} name={`days.${index}.label`} render={({ field: labelField }) => <TextField {...labelField} label="Label" placeholder="Optional label" fullWidth size="small" disabled={loading} />} /><Controller control={control} name={`days.${index}.notes`} render={({ field: notesField }) => <TextField {...notesField} label="Notes" placeholder="Optional note" fullWidth size="small" disabled={loading} />} /></Stack></Box>; })}</Box><Stack direction="row" gap={1} flexWrap="wrap"><Button type="button" size="small" variant="outlined" disabled={loading || values.cycleLengthDays >= 90} onClick={() => updateCycleLength(values.cycleLengthDays + 1)}>Add Step</Button><Button type="button" size="small" variant="outlined" disabled={loading || values.cycleLengthDays <= 2} onClick={() => updateCycleLength(values.cycleLengthDays - 1)}>Remove Last Step</Button><Button type="button" size="small" variant="outlined" disabled={loading} onClick={() => values.days.forEach((_, index) => { setValue(`days.${index}.dayType`, 'NO_SHIFT', { shouldDirty: true, shouldValidate: true }); setValue(`days.${index}.shiftId`, '', { shouldDirty: true, shouldValidate: true }); })}>Clear Pattern</Button></Stack></Stack>
    </SectionCard>
    <FormActions cancelTo="/scheduling/rotation-patterns" submitLabel={submitLabel} loading={loading} />
  </Stack>;
}

function nonWorkingHelper(dayType: RotationPatternDayPayload['dayType']) { return dayType === 'WEEKLY_OFF' ? 'Weekly Off - No shift required' : 'No shift required'; }
function ScopeCard({ value, title, description, icon: Icon, selected }: { value: RotationPatternScope; title: string; description: string; icon: typeof Layers3; selected: boolean }) { return <FormControlLabel value={value} control={<Radio size="small" />} label={<Stack direction="row" gap={1.25} alignItems="flex-start"><Box color={selected ? 'primary.main' : 'text.secondary'}><Icon size={18} aria-hidden /></Box><Box><Typography fontWeight={850}>{title}</Typography><Typography variant="caption" color="text.secondary">{description}</Typography></Box></Stack>} sx={{ m: 0, p: 1.25, border: '1px solid', borderColor: selected ? 'primary.main' : 'divider', borderRadius: 2.5, bgcolor: selected ? 'action.selected' : 'background.paper', '& .MuiFormControlLabel-label': { flex: 1 } }} />; }
function selectorHelper(isLoading: boolean, isError: boolean, label: string) { if (isLoading) return `Loading ${label}...`; if (isError) return `${label[0].toUpperCase()}${label.slice(1)} could not be loaded. Refresh and try again.`; return undefined; }
const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
const scopeGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 };
const stepGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 };
const stepCardSx = { p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', minWidth: 0 };
const stepHeaderSx = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 };
const stateBoxSx = { px: 1.25, py: 0.75, border: '1px dashed', borderColor: 'divider', borderRadius: 2, bgcolor: 'grey.50', display: 'flex', alignItems: 'center', minHeight: 40 };