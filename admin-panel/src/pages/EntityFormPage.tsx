import { Box, Grid, Stack, TextField } from '@mui/material';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormActions } from '@/components/form-actions';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';

const schema = z.object({ name: z.string().min(2), code: z.string().min(2), description: z.string().optional() });
type FormValues = z.infer<typeof schema>;

export default function EntityFormPage({ title, description }: { title: string; description: string }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', code: '', description: '' } });
  return (
    <Box component="form" onSubmit={handleSubmit(() => undefined)}>
      <Stack gap={3}>
        <PageHeader title={title} description={description} breadcrumbs={['Admin', title]} />
        <SectionCard title="Basic information" description="Dedicated create/edit pages keep enterprise workflows calm and auditable.">
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Name" {...register('name')} error={Boolean(errors.name)} helperText={errors.name?.message ?? ' '} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Code" {...register('code')} error={Boolean(errors.code)} helperText={errors.code?.message ?? ' '} /></Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={4} label="Description" {...register('description')} /></Grid>
          </Grid>
        </SectionCard>
        <SectionCard title="Permissions and visibility" description="Placeholder for future role, company, branch, and workflow controls.">
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Company" value="Demo Company" disabled /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Status" value="Active" disabled /></Grid>
          </Grid>
        </SectionCard>
        <FormActions />
      </Stack>
    </Box>
  );
}
