import { zodResolver } from '@hookform/resolvers/zod';
import { Box, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import type { LeaveType, LeaveTypePayload } from '../../types/leave.types';
import { leaveTypeCodeFromName, leaveTypeDefaults, leaveTypeFormSchema, toLeaveTypePayload } from '../../utils/leave-type-form';

interface LeaveTypeFormProps {
  leaveType?: LeaveType;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (payload: LeaveTypePayload) => Promise<void>;
}

export function LeaveTypeForm({ leaveType, loading = false, submitLabel, onSubmit }: LeaveTypeFormProps) {
  const [manualCode, setManualCode] = useState(Boolean(leaveType));
  const initialValues = useRef(leaveTypeDefaults(leaveType));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm({
    resolver: zodResolver(leaveTypeFormSchema),
    defaultValues: initialValues.current,
  });
  const name = watch('name');

  useEffect(() => {
    if (!manualCode) {
      setValue('code', leaveTypeCodeFromName(name), { shouldDirty: true, shouldValidate: true });
    }
  }, [manualCode, name, setValue]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toLeaveTypePayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <SectionCard title="General" description="Define the leave category shown to employees and HR reviewers.">
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Leave Type Name" fullWidth error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextField
                {...field}
                label="Code"
                fullWidth
                error={Boolean(errors.code)}
                helperText={errors.code?.message ?? 'Auto-generated from name until manually edited. Example: CASUAL_LEAVE'}
                onChange={(event) => {
                  setManualCode(true);
                  field.onChange(event.target.value.toUpperCase());
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="defaultDays"
            render={({ field }) => (
              <TextField
                label="Default Days"
                type="number"
                fullWidth
                value={field.value}
                onChange={(event) => field.onChange(Number(event.target.value))}
                error={Boolean(errors.defaultDays)}
                helperText={errors.defaultDays?.message ?? 'Annual allocation default. Use 0 for unpaid or policy-managed leave.'}
                inputProps={{ min: 0, step: 0.5 }}
              />
            )}
          />
        </Box>
        <Box sx={{ mt: 2 }}>
          <Controller control={control} name="description" render={({ field }) => <TextField {...field} label="Description" multiline minRows={4} fullWidth error={Boolean(errors.description)} helperText={errors.description?.message ?? 'Optional internal description.'} />} />
        </Box>
      </SectionCard>

      <SectionCard title="Approval Rules" description="Control whether this leave type requires approval and manager review.">
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
          <Controller
            control={control}
            name="requiresApproval"
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />}
                label="Requires Approval"
              />
            )}
          />
          <Controller
            control={control}
            name="managerCanApprove"
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />}
                label="Manager Can Approve"
              />
            )}
          />
        </Stack>
      </SectionCard>

      <FormActions cancelTo="/leave/types" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
