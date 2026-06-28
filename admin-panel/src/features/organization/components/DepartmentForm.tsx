import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { useBranches } from '../hooks';
import type { Department, DepartmentFormValues } from '../types/department.types';
import { departmentCodeFromName, departmentDefaults, departmentFormSchema, toDepartmentPayload } from '../utils/department-form';

interface DepartmentFormProps {
  department?: Department;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnType<typeof toDepartmentPayload>) => Promise<void>;
}

export function DepartmentForm({ department, loading = false, submitLabel, onSubmit }: DepartmentFormProps) {
  const [manualCode, setManualCode] = useState(Boolean(department));
  const initialValues = useRef(departmentDefaults(department));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: initialValues.current,
  });
  const name = watch('name');
  const branchesQuery = useBranches();
  const branches = branchesQuery.data?.data.data ?? [];

  useEffect(() => {
    if (!manualCode) {
      setValue('code', departmentCodeFromName(name), { shouldDirty: true, shouldValidate: true });
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
    await onSubmit(toDepartmentPayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <SectionCard title="General" description="Core department identity within the current company workspace.">
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Department Name" fullWidth error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextField
                {...field}
                label="Department Code"
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

      <SectionCard title="Organization" description="Optionally assign this department to a branch.">
        <Stack gap={2}>
          {branchesQuery.isError && (
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" startIcon={<RefreshCw size={16} />} onClick={() => void branchesQuery.refetch()}>Retry</Button>}
            >
              Branches could not be loaded. You can retry or save the department without a branch.
            </Alert>
          )}
          {!branchesQuery.isLoading && !branchesQuery.isError && branches.length === 0 && (
            <Alert severity="info">No branches found. You can save this department without assigning a branch.</Alert>
          )}
          <Controller
            control={control}
            name="branchId"
            render={({ field }) => (
              <TextField
                select
                label="Branch"
                value={field.value}
                onChange={field.onChange}
                sx={{ maxWidth: 460 }}
                helperText="Optional. Backend accepts empty branch assignment."
                InputProps={{
                  endAdornment: branchesQuery.isLoading ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined,
                }}
              >
                <MenuItem value="">No branch assigned</MenuItem>
                {branches.map((branch) => (
                  <MenuItem key={branch.id} value={branch.id}>{branch.name} ({branch.code})</MenuItem>
                ))}
              </TextField>
            )}
          />
          <Typography variant="caption" color="text.secondary">Branch list is loaded from the existing Branches API.</Typography>
        </Stack>
      </SectionCard>

      <FormActions cancelTo="/organization/departments" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
