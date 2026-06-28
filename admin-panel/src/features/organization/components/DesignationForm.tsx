import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import { useDepartments } from '../hooks';
import type { Designation, DesignationFormValues } from '../types/designation.types';
import { designationCodeFromName, designationDefaults, designationFormSchema, toDesignationPayload } from '../utils/designation-form';

interface DesignationFormProps {
  designation?: Designation;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnType<typeof toDesignationPayload>) => Promise<void>;
}

export function DesignationForm({ designation, loading = false, submitLabel, onSubmit }: DesignationFormProps) {
  const [manualCode, setManualCode] = useState(Boolean(designation));
  const initialValues = useRef(designationDefaults(designation));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<DesignationFormValues>({
    resolver: zodResolver(designationFormSchema),
    defaultValues: initialValues.current,
  });
  const name = watch('name');
  const departmentsQuery = useDepartments();
  const departments = departmentsQuery.data?.data.data ?? [];

  useEffect(() => {
    if (!manualCode) {
      setValue('code', designationCodeFromName(name), { shouldDirty: true, shouldValidate: true });
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
    await onSubmit(toDesignationPayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <SectionCard title="General" description="Core designation identity within the current company workspace.">
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Designation Name" fullWidth error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextField
                {...field}
                label="Designation Code"
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

      <SectionCard title="Organization" description="Optionally assign this designation to a department.">
        <Stack gap={2}>
          {departmentsQuery.isError && (
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" startIcon={<RefreshCw size={16} />} onClick={() => void departmentsQuery.refetch()}>Retry</Button>}
            >
              Departments could not be loaded. You can retry or save the designation without a department.
            </Alert>
          )}
          {!departmentsQuery.isLoading && !departmentsQuery.isError && departments.length === 0 && (
            <Alert severity="info">No departments found. You can save this designation without assigning a department.</Alert>
          )}
          <Controller
            control={control}
            name="departmentId"
            render={({ field }) => (
              <TextField
                select
                label="Department"
                value={field.value}
                onChange={field.onChange}
                sx={{ maxWidth: 460 }}
                helperText="Optional. Backend accepts empty department assignment."
                InputProps={{
                  endAdornment: departmentsQuery.isLoading ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined,
                }}
              >
                <MenuItem value="">No department assigned</MenuItem>
                {departments.map((department) => (
                  <MenuItem key={department.id} value={department.id}>{department.name} ({department.code})</MenuItem>
                ))}
              </TextField>
            )}
          />
          <Typography variant="caption" color="text.secondary">Department list is loaded from the existing Departments API.</Typography>
        </Stack>
      </SectionCard>

      <FormActions cancelTo="/organization/designations" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
