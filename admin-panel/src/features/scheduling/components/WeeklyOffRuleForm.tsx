import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Chip, FormControl, FormControlLabel, FormHelperText, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, CalendarOff, GitBranch, Info, Layers3, Network, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { DateRangePicker, createCustomDateRangeValue } from '@/components/enterprise/date-range';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useBranches, useDepartments } from '@/features/organization/hooks';
import { getEmployees } from '@/features/people/services/employees-api';
import type { WeeklyOffRule, WeeklyOffRuleFormValues, WeeklyOffRulePayload, WeeklyOffRuleScope } from '../types/weekly-off-rule.types';
import { employeeOptionLabel, previewText, toWeeklyOffPayload, weekdays, weeklyOffDefaults, weeklyOffRuleSchema, weeklyOffScopeOptions } from '../utils/weekly-off-rule-utils';

interface WeeklyOffRuleFormProps {
  rule?: WeeklyOffRule;
  loading?: boolean;
  submitLabel: string;
  errorMessage?: string | null;
  onSubmit: (payload: WeeklyOffRulePayload) => Promise<void>;
}

const scopeIcons: Record<WeeklyOffRuleScope, typeof Building2> = {
  COMPANY: Building2,
  BRANCH: GitBranch,
  DEPARTMENT: Network,
  EMPLOYEE: UserRound,
};

export function WeeklyOffRuleForm({ rule, loading = false, submitLabel, errorMessage, onSubmit }: WeeklyOffRuleFormProps) {
  const initialValues = useRef(weeklyOffDefaults(rule));
  const branchesQuery = useBranches();
  const departmentsQuery = useDepartments();
  const employeesQuery = useQuery({ queryKey: ['employees', { selector: 'weekly-off-rules' }], queryFn: () => getEmployees({ page: 1, limit: 100 }) });
  const { control, handleSubmit, formState: { errors, isDirty }, reset, setValue, watch } = useForm<WeeklyOffRuleFormValues>({
    resolver: zodResolver(weeklyOffRuleSchema),
    defaultValues: initialValues.current,
  });

  const values = watch();
  const branches = branchesQuery.data?.data.data ?? [];
  const departments = departmentsQuery.data?.data.data ?? [];
  const employees = employeesQuery.data?.data.data ?? [];
  const filteredDepartments = departments.filter((department) => !values.branchId || department.branchId === values.branchId);
  const filteredEmployees = employees.filter((employee) => {
    if (values.branchId && employee.branchId !== values.branchId) return false;
    if (values.departmentId && employee.departmentId !== values.departmentId) return false;
    return true;
  });
  const selectedLabels = useMemo(() => ({
    branch: branches.find((branch) => branch.id === values.branchId)?.name,
    department: departments.find((department) => department.id === values.departmentId)?.name,
    employee: employeeOptionLabel(employees.find((employee) => employee.id === values.employeeId) ?? { employeeCode: 'Selected employee' }),
  }), [branches, departments, employees, values.branchId, values.departmentId, values.employeeId]);
  const preview = previewText(values, selectedLabels);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (formValues) => {
    await onSubmit(toWeeklyOffPayload(formValues));
    reset(formValues);
  });

  const updateScope = (nextScope: WeeklyOffRuleScope, onChange: (value: WeeklyOffRuleScope) => void) => {
    onChange(nextScope);
    if (nextScope === 'COMPANY') {
      setValue('branchId', '', { shouldDirty: true, shouldValidate: true });
      setValue('departmentId', '', { shouldDirty: true, shouldValidate: true });
      setValue('employeeId', '', { shouldDirty: true, shouldValidate: true });
    }
    if (nextScope === 'BRANCH') {
      setValue('departmentId', '', { shouldDirty: true, shouldValidate: true });
      setValue('employeeId', '', { shouldDirty: true, shouldValidate: true });
    }
    if (nextScope === 'DEPARTMENT') setValue('employeeId', '', { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      <Alert severity="info" icon={<ShieldCheck size={18} />}>
        More specific rules take precedence: Employee &rarr; Department &rarr; Branch &rarr; Company. When multiple matching rules have the same scope, the lower priority number wins.
      </Alert>

      <SectionCard title="General" description="Name, status, timezone, and priority for this weekly-off rule." action={<SlidersHorizontal size={20} aria-hidden />}>
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Rule Name" fullWidth disabled={loading} error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller control={control} name="timezone" render={({ field }) => <TextField {...field} label="Timezone" fullWidth disabled={loading} error={Boolean(errors.timezone)} helperText={errors.timezone?.message ?? 'Used for date interpretation. Default: Asia/Kolkata.'} />} />
          <Controller control={control} name="priority" render={({ field }) => <TextField {...field} type="number" label="Priority" placeholder="Example: 10" onChange={(event) => field.onChange(Number(event.target.value))} fullWidth disabled={loading} error={Boolean(errors.priority)} helperText={errors.priority?.message ?? 'Lower number means higher priority when multiple rules match. Examples: 10, 50, 100.'} inputProps={{ min: 1, max: 10000 }} />} />
          <Controller control={control} name="enabled" render={({ field }) => <FormControlLabel sx={{ alignSelf: 'center' }} control={<Switch checked={field.value} onChange={(_, checked) => field.onChange(checked)} disabled={loading} />} label={field.value ? 'Active rule' : 'Inactive rule'} />} />
        </Box>
      </SectionCard>

      <SectionCard title="Scope" description="Choose where this rule applies. More specific rules take precedence." action={<Layers3 size={20} aria-hidden />}>
        <Stack gap={2}>
          <Controller control={control} name="scope" render={({ field }) => (
            <RadioGroup {...field} aria-label="Weekly off rule scope" onChange={(event) => updateScope(event.target.value as WeeklyOffRuleScope, field.onChange)} sx={scopeGrid}>
              {weeklyOffScopeOptions.map((option) => <ScopeCard key={option.value} value={option.value} title={option.label} description={option.description} selected={field.value === option.value} disabled={loading} />)}
            </RadioGroup>
          )} />
          <Box sx={formGrid}>
            {values.scope !== 'COMPANY' ? <Controller control={control} name="branchId" render={({ field }) => <TextField {...field} select label="Branch" fullWidth disabled={loading || branchesQuery.isLoading} error={Boolean(errors.branchId)} helperText={errors.branchId?.message ?? selectorHelper(branchesQuery.isLoading, branchesQuery.isError, 'branches')} onChange={(event) => { field.onChange(event); setValue('departmentId', '', { shouldDirty: true, shouldValidate: true }); setValue('employeeId', '', { shouldDirty: true, shouldValidate: true }); }}><MenuItem value="">Select Branch</MenuItem>{branches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField>} /> : null}
            {(values.scope === 'DEPARTMENT' || values.scope === 'EMPLOYEE') ? <Controller control={control} name="departmentId" render={({ field }) => <TextField {...field} select label="Department" fullWidth disabled={loading || departmentsQuery.isLoading} error={Boolean(errors.departmentId)} helperText={errors.departmentId?.message ?? selectorHelper(departmentsQuery.isLoading, departmentsQuery.isError, 'departments')} onChange={(event) => { field.onChange(event); setValue('employeeId', '', { shouldDirty: true, shouldValidate: true }); }}><MenuItem value="">Select Department</MenuItem>{filteredDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}</TextField>} /> : null}
            {values.scope === 'EMPLOYEE' ? <Controller control={control} name="employeeId" render={({ field }) => <TextField {...field} select label="Employee" fullWidth disabled={loading || employeesQuery.isLoading} error={Boolean(errors.employeeId)} helperText={errors.employeeId?.message ?? selectorHelper(employeesQuery.isLoading, employeesQuery.isError, 'employees')}><MenuItem value="">Select Employee</MenuItem>{filteredEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeOptionLabel(employee)}</MenuItem>)}</TextField>} /> : null}
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="Effective Period" description="Rules apply to matching work dates in this inclusive range." action={<CalendarDays size={20} aria-hidden />}>
        <Controller control={control} name="effectiveFrom" render={({ field: startField }) => (
          <Controller control={control} name="effectiveTo" render={({ field: endField }) => (
            <Stack gap={1}>
              <DateRangePicker label="Effective Date Range" mode="form" presetsEnabled={false} value={createCustomDateRangeValue(startField.value, endField.value)} onChange={(value) => { startField.onChange(value.dateFrom); endField.onChange(value.dateTo); }} onClear={() => { startField.onChange(''); endField.onChange(''); }} error={Boolean(errors.effectiveFrom || errors.effectiveTo)} helperText={errors.effectiveFrom?.message ?? errors.effectiveTo?.message ?? 'Choose a range, or clear the end date after selecting to keep the rule open-ended.'} />
              <Button size="small" variant="text" sx={{ alignSelf: 'flex-start' }} disabled={loading || !startField.value || !endField.value} onClick={() => endField.onChange('')}>Make rule open-ended</Button>
            </Stack>
          )} />
        )} />
      </SectionCard>

      <SectionCard title="Weekly Pattern" description="Select fixed weekdays supported by the current scheduling product." action={<CalendarOff size={20} aria-hidden />}>
        <Stack gap={2}>
          <Controller control={control} name="weekdays" render={({ field }) => (
            <FormControl error={Boolean(errors.weekdays)}>
              <Box role="group" aria-label="Weekly off weekdays" sx={weekdayGrid}>
                {weekdays.map((day) => {
                  const selected = field.value.includes(day.value);
                  return <WeekdayButton key={day.value} label={day.label} short={day.short} selected={selected} disabled={loading} onClick={() => field.onChange(toggleDay(field.value, day.value))} />;
                })}
              </Box>
              <FormHelperText>{errors.weekdays?.message ?? 'Selected days become full weekly-off days. At least one day is required.'}</FormHelperText>
            </FormControl>
          )} />
          <Controller control={control} name="saturdayPattern" render={({ field }) => (
            <TextField {...field} select label="Saturday Pattern" fullWidth disabled={loading} helperText="Choose Every Saturday when Saturday is always a weekly off.">
              <MenuItem value="NONE" onClick={() => setValue('weekdays', values.weekdays.filter((day) => day !== 6), { shouldDirty: true, shouldValidate: true })}>No Saturday rule</MenuItem>
              <MenuItem value="EVERY" onClick={() => setValue('weekdays', [...new Set([...values.weekdays, 6])], { shouldDirty: true, shouldValidate: true })}>Every Saturday</MenuItem>
              <MenuItem disabled>Alternate Saturday - planned for Rotation Patterns</MenuItem>
              <MenuItem disabled>First and Third Saturday - planned for Rotation Patterns</MenuItem>
              <MenuItem disabled>Second and Fourth Saturday - planned for Rotation Patterns</MenuItem>
              <MenuItem disabled>Custom Saturday cycles - planned for Rotation Patterns</MenuItem>
            </TextField>
          )} />
          <Alert severity="info" icon={<Info size={18} />}>
            Supported now: fixed weekdays, including every Saturday. Planned for Rotation Patterns: alternate Saturdays, first/third Saturdays, second/fourth Saturdays, and custom Saturday cycles.
          </Alert>
        </Stack>
      </SectionCard>

      <SectionCard title="Live Preview" description="A summary of the values that will be saved. This is not a backend resolution result.">
        <Box sx={previewGrid}>
          <PreviewTile icon={<CalendarOff size={18} />} label="Pattern" value={preview.pattern} />
          <PreviewTile icon={<Layers3 size={18} />} label="Scope" value={preview.scope} />
          <PreviewTile icon={<CalendarDays size={18} />} label="Effective" value={preview.effective} />
          <PreviewTile icon={<ShieldCheck size={18} />} label="Status" value={preview.status} chipTone={values.enabled ? 'success' : 'neutral'} />
          <PreviewTile icon={<SlidersHorizontal size={18} />} label="Priority" value={preview.priority} />
          <PreviewTile icon={<Info size={18} />} label="Mode" value={preview.mode} />
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
          <Chip label="Employee rules first" size="small" />
          <Chip label="Lower priority number wins" size="small" />
          <Chip label="Holiday calendars are separate" size="small" />
        </Stack>
      </SectionCard>

      <FormActions cancelTo="/scheduling/weekly-off-rules" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

function ScopeCard({ value, title, description, selected, disabled }: { value: WeeklyOffRuleScope; title: string; description: string; selected: boolean; disabled?: boolean }) {
  const Icon = scopeIcons[value];
  return (
    <FormControlLabel
      value={value}
      disabled={disabled}
      control={<Radio size="small" />}
      label={
        <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
          <Box sx={{ mt: 0.25, color: selected ? 'primary.main' : 'text.secondary' }}><Icon size={18} aria-hidden /></Box>
          <Box minWidth={0}>
            <Typography fontWeight={850}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">{description}</Typography>
          </Box>
        </Stack>
      }
      sx={{
        m: 0,
        p: 1.25,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 2.5,
        bgcolor: selected ? 'primary.50' : 'background.paper',
        transition: 'border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
        '&:hover': { borderColor: selected ? 'primary.main' : 'text.secondary', boxShadow: 1 },
        '& .MuiFormControlLabel-label': { flex: 1, minWidth: 0 },
      }}
    />
  );
}

function WeekdayButton({ short, label, selected, disabled, onClick }: { short: string; label: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant={selected ? 'contained' : 'outlined'}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${label}${selected ? ' weekly off selected' : ' not selected'}`}
      onClick={onClick}
      sx={{ minHeight: 56, px: 1.25, py: 0.9, borderRadius: 2, textTransform: 'none', justifyContent: 'center' }}
    >
      <Stack alignItems="center" lineHeight={1.1}>
        <Typography fontWeight={900} variant="body2">{short}</Typography>
        <Typography variant="caption" sx={{ opacity: selected ? 0.92 : 0.72 }}>{selected ? 'Weekly Off' : label}</Typography>
      </Stack>
    </Button>
  );
}

function PreviewTile({ icon, label, value, chipTone }: { icon: React.ReactNode; label: string; value: string; chipTone?: 'success' | 'neutral' }) {
  return (
    <Box sx={previewTileSx}>
      <Stack direction="row" gap={1} alignItems="center" color="text.secondary">
        {icon}
        <Typography variant="caption">{label}</Typography>
      </Stack>
      {chipTone ? <StatusChip label={value} tone={chipTone} /> : <Typography fontWeight={850}>{value}</Typography>}
    </Box>
  );
}

function selectorHelper(isLoading: boolean, isError: boolean, label: string) {
  if (isLoading) return `Loading ${label}...`;
  if (isError) return `${label[0].toUpperCase()}${label.slice(1)} could not be loaded. Retry by refreshing the page.`;
  return undefined;
}

function toggleDay(current: number[], value: number) {
  return current.includes(value) ? current.filter((day) => day !== value) : [...current, value];
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};

const scopeGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 1.25,
};

const weekdayGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', md: 'repeat(7, minmax(0, 1fr))' },
  gap: 1,
};

const previewGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 1.5,
};

const previewTileSx = {
  p: 1.5,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 2.5,
  bgcolor: 'background.default',
  minWidth: 0,
};