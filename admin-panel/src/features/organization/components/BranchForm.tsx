import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Stack, TextField } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import type { Branch, BranchFormValues } from '../types/branch.types';
import { branchCodeFromName, branchDefaults, branchFormSchema, toBranchPayload } from '../utils/branch-form';

interface BranchFormProps {
  branch?: Branch;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnType<typeof toBranchPayload>) => Promise<void>;
}

export function BranchForm({ branch, loading = false, submitLabel, onSubmit }: BranchFormProps) {
  const [manualCode, setManualCode] = useState(Boolean(branch));
  const initialValues = useRef(branchDefaults(branch));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: initialValues.current,
  });
  const name = watch('name');

  useEffect(() => {
    if (!manualCode) {
      setValue('code', branchCodeFromName(name), { shouldDirty: true, shouldValidate: true });
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
    await onSubmit(toBranchPayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <Alert severity="info">
        The current backend Branch API stores branch name, branch code, and address. City, state, country, and postal code are UI placeholders for future location expansion.
      </Alert>

      <SectionCard title="General" description="Core branch identity within the current company workspace.">
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Branch Name" fullWidth error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextField
                {...field}
                label="Branch Code"
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

      <SectionCard title="Location" description="Branch address now, richer location metadata later.">
        <Box sx={formGrid}>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Controller control={control} name="address" render={({ field }) => <TextField {...field} label="Address" fullWidth multiline minRows={3} error={Boolean(errors.address)} helperText={errors.address?.message} />} />
          </Box>
          <Controller control={control} name="city" render={({ field }) => <TextField {...field} label="City" fullWidth helperText="Future location field" />} />
          <Controller control={control} name="state" render={({ field }) => <TextField {...field} label="State" fullWidth helperText="Future location field" />} />
          <Controller control={control} name="country" render={({ field }) => <TextField {...field} label="Country" fullWidth helperText="Future location field" />} />
          <Controller control={control} name="postalCode" render={({ field }) => <TextField {...field} label="Postal Code" fullWidth helperText="Future location field" />} />
        </Box>
      </SectionCard>

      <FormActions cancelTo="/organization/branches" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
