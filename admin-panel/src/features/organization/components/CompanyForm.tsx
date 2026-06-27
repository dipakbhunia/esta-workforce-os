import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import type { Company, CompanyFormValues } from '../types/company.types';
import { companyDefaults, companyFormSchema, slugifyCompanyName, toCompanyPayload } from '../utils/company-form';

interface CompanyFormProps {
  company?: Company;
  loading?: boolean;
  submitLabel: string;
  onSubmit: (values: ReturnType<typeof toCompanyPayload>) => Promise<void>;
}

export function CompanyForm({ company, loading = false, submitLabel, onSubmit }: CompanyFormProps) {
  const [manualSlug, setManualSlug] = useState(Boolean(company));
  const initialValues = useRef(companyDefaults(company));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: initialValues.current,
  });
  const name = watch('name');

  useEffect(() => {
    if (!manualSlug) {
      setValue('slug', slugifyCompanyName(name), { shouldDirty: true, shouldValidate: true });
    }
  }, [manualSlug, name, setValue]);

  useEffect(() => {
    // TODO: Add in-app route blocking once the router layer exposes a stable blocker API for data routers.
    // Browser refresh/close protection is active today; internal navigation currently relies on the sticky action bar.
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toCompanyPayload(values));
    reset(values);
  });

  return (
    <Stack component="form" gap={3} onSubmit={submit}>
      <Alert severity="info">
        The current backend Company API stores company name, company code, and status. Contact, address, timezone, and currency fields are UI placeholders for the company profile expansion.
      </Alert>

      <SectionCard title="General Information" description="Core tenant identity used across Esta Workforce OS.">
        <Box sx={formGrid}>
          <Controller control={control} name="name" render={({ field }) => <TextField {...field} label="Company Name" fullWidth error={Boolean(errors.name)} helperText={errors.name?.message} />} />
          <Controller
            control={control}
            name="slug"
            render={({ field }) => (
              <TextField
                {...field}
                label="Company Code"
                fullWidth
                error={Boolean(errors.slug)}
                helperText={errors.slug?.message ?? 'Auto-generated from name until manually edited.'}
                onChange={(event) => {
                  setManualSlug(true);
                  field.onChange(event);
                }}
              />
            )}
          />
          <Controller control={control} name="email" render={({ field }) => <TextField {...field} label="Email" fullWidth error={Boolean(errors.email)} helperText={errors.email?.message ?? 'Future profile field'} />} />
          <Controller control={control} name="phone" render={({ field }) => <TextField {...field} label="Phone" fullWidth error={Boolean(errors.phone)} helperText={errors.phone?.message ?? 'Future profile field'} />} />
          <Controller control={control} name="website" render={({ field }) => <TextField {...field} label="Website" fullWidth error={Boolean(errors.website)} helperText={errors.website?.message ?? 'Future profile field'} />} />
        </Box>
      </SectionCard>

      <SectionCard title="Business Information" description="Regional and billing metadata placeholders for future company settings.">
        <Box sx={formGrid}>
          <Controller control={control} name="country" render={({ field }) => <TextField {...field} label="Country" fullWidth helperText="Future profile field" />} />
          <Controller control={control} name="timezone" render={({ field }) => <TextField {...field} label="Timezone" fullWidth helperText="Future profile field" />} />
          <Controller control={control} name="currency" render={({ field }) => <TextField {...field} label="Currency" fullWidth helperText="Future profile field" />} />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Controller control={control} name="address" render={({ field }) => <TextField {...field} label="Address" fullWidth multiline minRows={3} helperText="Future profile field" />} />
          </Box>
        </Box>
      </SectionCard>

      <SectionCard title="Settings" description="Control whether this company tenant can actively operate.">
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <TextField select label="Status" value={field.value} onChange={field.onChange} sx={{ maxWidth: 280 }}>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
              <MenuItem value="TRIAL">Trial</MenuItem>
              <MenuItem value="SUSPENDED">Suspended</MenuItem>
            </TextField>
          )}
        />
      </SectionCard>

      <FormActions cancelTo="/organization/companies" submitLabel={submitLabel} loading={loading} />
    </Stack>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
