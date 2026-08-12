import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Autocomplete, Box, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormActions } from '@/components/form-actions';
import { SectionCard } from '@/components/section-card';
import type { Company, CompanyFormValues } from '../types/company.types';
import { companyDefaults, companyFormSchema, slugifyCompanyName, toCompanyPayload } from '../utils/company-form';
import {
  companyCountryOptions,
  companyCurrencyOptions,
  companyTimezoneOptions,
  currencyOptionLabel,
  getCountryRegionalDefaults,
  includePersistedOption,
} from '../utils/company-regional-options';

interface CompanyFormProps {
  company?: Company;
  loading?: boolean;
  submitLabel: string;
  errorMessage?: string | null;
  onSubmit: (values: ReturnType<typeof toCompanyPayload>) => Promise<void>;
}

export function CompanyForm({ company, loading = false, submitLabel, errorMessage, onSubmit }: CompanyFormProps) {
  const [manualSlug, setManualSlug] = useState(Boolean(company));
  const initialValues = useRef(companyDefaults(company));
  const { control, handleSubmit, formState: { errors, isDirty }, reset, watch, setValue } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: initialValues.current,
    mode: 'onBlur',
  });
  const name = watch('name');
  const slug = watch('slug');

  useEffect(() => {
    if (!manualSlug) {
      const generatedSlug = slugifyCompanyName(name);
      if (generatedSlug !== slug) {
        setValue('slug', generatedSlug, { shouldDirty: Boolean(name), shouldValidate: false });
      }
    }
  }, [manualSlug, name, setValue, slug]);

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
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

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
          <Controller control={control} name="primaryEmail" render={({ field }) => <TextField {...field} label="Primary Email" type="email" fullWidth error={Boolean(errors.primaryEmail)} helperText={errors.primaryEmail?.message ?? 'Optional company contact email.'} />} />
          <Controller control={control} name="phone" render={({ field }) => <TextField {...field} label="Phone" fullWidth error={Boolean(errors.phone)} helperText={errors.phone?.message ?? 'Optional company contact number.'} />} />
          <Controller control={control} name="website" render={({ field }) => <TextField {...field} label="Website" fullWidth error={Boolean(errors.website)} helperText={errors.website?.message ?? 'Include https:// in the address.'} />} />
        </Box>
      </SectionCard>

      <SectionCard title="Business Information" description="Regional settings used to present company information consistently.">
        <Box sx={formGrid}>
          <Controller control={control} name="country" render={({ field }) => (
            <Autocomplete
              options={includePersistedOption(companyCountryOptions, field.value)}
              value={field.value || null}
              onChange={(_, value) => {
                const nextCountry = value ?? '';
                field.onChange(nextCountry);
                if (!nextCountry) return;

                const defaults = getCountryRegionalDefaults(nextCountry);
                if (defaults.currency) setValue('currency', defaults.currency, { shouldDirty: true, shouldValidate: true });
                if (defaults.timezone) setValue('timezone', defaults.timezone, { shouldDirty: true, shouldValidate: true });
              }}
              onBlur={field.onBlur}
              disabled={loading}
              autoHighlight
              renderInput={(params) => <TextField {...params} label="Country" error={Boolean(errors.country)} helperText={errors.country?.message ?? 'Optional operating country.'} />}
            />
          )} />
          <Controller control={control} name="timezone" render={({ field }) => (
            <Autocomplete
              options={includePersistedOption(companyTimezoneOptions, field.value)}
              value={field.value || null}
              onChange={(_, value) => field.onChange(value ?? '')}
              onBlur={field.onBlur}
              disabled={loading}
              autoHighlight
              renderInput={(params) => <TextField {...params} label="Timezone" required error={Boolean(errors.timezone)} helperText={errors.timezone?.message ?? 'Select the IANA timezone used for company operations.'} />}
            />
          )} />
          <Controller control={control} name="currency" render={({ field }) => (
            <Autocomplete
              options={includePersistedOption(companyCurrencyOptions, field.value)}
              value={field.value || null}
              getOptionLabel={currencyOptionLabel}
              onChange={(_, value) => field.onChange(value ?? '')}
              onBlur={field.onBlur}
              disabled={loading}
              autoHighlight
              renderInput={(params) => <TextField {...params} label="Currency" error={Boolean(errors.currency)} helperText={errors.currency?.message ?? 'Optional ISO currency used for company reporting.'} />}
            />
          )} />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Controller control={control} name="address" render={({ field }) => <TextField {...field} label="Primary Address" fullWidth multiline minRows={3} error={Boolean(errors.address)} helperText={errors.address?.message ?? 'Optional primary company address.'} />} />
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
