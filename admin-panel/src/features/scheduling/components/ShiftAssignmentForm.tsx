import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { useDepartments, useShifts } from '@/features/organization/hooks';
import { getEmployees } from '@/features/people/services/employees-api';
import { useQuery } from '@tanstack/react-query';
import type { ShiftAssignment, ShiftAssignmentFormValues, ShiftAssignmentPayload } from '../types/shift-assignment.types';
import {
  assignmentDefaults,
  assignmentTypeOptions,
  shiftAssignmentSchema,
  toAssignmentPayload,
} from '../utils/shift-assignment-utils';

interface ShiftAssignmentFormProps {
  assignment?: ShiftAssignment;
  loading?: boolean;
  submitLabel: string;
  errorMessage?: string | null;
  onSubmit: (payload: ShiftAssignmentPayload) => Promise<void>;
}

export function ShiftAssignmentForm({ assignment, loading = false, submitLabel, errorMessage, onSubmit }: ShiftAssignmentFormProps) {
  const initialValues = useRef(assignmentDefaults(assignment));
  const employeesQuery = useQuery({
    queryKey: ['employees', { selector: 'shift-assignment' }],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });
  const shiftsQuery = useShifts();
  const departmentsQuery = useDepartments();
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch } = useForm<ShiftAssignmentFormValues>({
    resolver: zodResolver(shiftAssignmentSchema),
    defaultValues: initialValues.current,
  });
  const selectedEmployeeId = watch('employeeId');
  const selectedEmployee = useMemo(
    () => employeesQuery.data?.data.data.find((employee) => employee.id === selectedEmployeeId),
    [employeesQuery.data?.data.data, selectedEmployeeId],
  );

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toAssignmentPayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
      {assignment?.status === 'CANCELLED' && <Alert severity="warning">Cancelled assignments are read-only in practice. The backend is the final authority.</Alert>}

      <SectionCard title="Employee" description="Choose the employee whose effective shift should be managed.">
        <Box sx={formGrid}>
          <Controller
            control={control}
            name="employeeId"
            render={({ field }) => (
              <TextField {...field} select label="Employee" fullWidth disabled={loading || Boolean(assignment)} error={Boolean(errors.employeeId)} helperText={errors.employeeId?.message ?? selectorHelper(employeesQuery.isLoading, employeesQuery.isError, 'employees')}>
                {employeesQuery.data?.data.data.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email} · {employee.employeeCode}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">Current legacy shift</Typography>
            <Typography fontWeight={800}>{selectedEmployee?.shift?.name ?? 'Not configured'}</Typography>
            <Typography variant="caption" color="text.secondary">Current Shift is maintained for legacy compatibility.</Typography>
          </Box>
        </Box>
      </SectionCard>

      <SectionCard title="Shift" description="Select the shift that should apply during the effective period.">
        <Box sx={formGrid}>
          <Controller
            control={control}
            name="shiftId"
            render={({ field }) => (
              <TextField {...field} select label="Shift" fullWidth disabled={loading} error={Boolean(errors.shiftId)} helperText={errors.shiftId?.message ?? selectorHelper(shiftsQuery.isLoading, shiftsQuery.isError, 'shifts')}>
                {shiftsQuery.data?.data.data.map((shift) => (
                  <MenuItem key={shift.id} value={shift.id}>
                    {shift.name} · {shift.code} · {shift.startTime}-{shift.endTime}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="assignmentType"
            render={({ field }) => (
              <TextField {...field} select label="Assignment Type" fullWidth disabled={loading} error={Boolean(errors.assignmentType)} helperText={errors.assignmentType?.message}>
                {assignmentTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
            )}
          />
        </Box>
      </SectionCard>

      <SectionCard title="Effective Period" description="Effective ranges use inclusive start and exclusive end semantics.">
        <Box sx={formGrid}>
          <Controller control={control} name="effectiveFrom" render={({ field }) => <TextField {...field} type="datetime-local" label="Effective From" fullWidth disabled={loading} error={Boolean(errors.effectiveFrom)} helperText={errors.effectiveFrom?.message ?? 'Inclusive boundary.'} InputLabelProps={{ shrink: true }} />} />
          <Controller control={control} name="effectiveTo" render={({ field }) => <TextField {...field} type="datetime-local" label="Effective To" fullWidth disabled={loading} error={Boolean(errors.effectiveTo)} helperText={errors.effectiveTo?.message ?? 'Optional exclusive boundary. Leave empty for open-ended.'} InputLabelProps={{ shrink: true }} />} />
        </Box>
      </SectionCard>

      <SectionCard title="Assignment Details" description="Capture the HR reason and optional notes for audit review.">
        <Box sx={formGrid}>
          <Controller control={control} name="reason" render={({ field }) => <TextField {...field} label="Reason" fullWidth disabled={loading} error={Boolean(errors.reason)} helperText={errors.reason?.message ?? 'Optional, but recommended for audit context.'} />} />
          <Controller control={control} name="notes" render={({ field }) => <TextField {...field} label="Notes" fullWidth multiline minRows={3} disabled={loading} error={Boolean(errors.notes)} helperText={errors.notes?.message} />} />
          <Box>
            <Typography variant="caption" color="text.secondary">Department</Typography>
            <Typography fontWeight={800}>{selectedEmployee?.department?.name ?? 'Not configured'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Available departments</Typography>
            <Typography fontWeight={800}>{departmentsQuery.data?.data.meta.total ?? '-'}</Typography>
          </Box>
        </Box>
      </SectionCard>

      <FormActions cancelTo="/scheduling/shift-assignments" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

function selectorHelper(isLoading: boolean, isError: boolean, label: string) {
  if (isLoading) return `Loading ${label}...`;
  if (isError) return `${label[0].toUpperCase()}${label.slice(1)} could not be loaded.`;
  return undefined;
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
