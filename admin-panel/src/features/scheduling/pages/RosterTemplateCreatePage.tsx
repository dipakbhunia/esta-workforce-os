import { Alert } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { RosterTemplateForm } from '../components/RosterTemplateForm';
import { createRosterTemplate } from '../services/roster-templates-api';
import type { RosterTemplatePayload } from '../types/roster-template.types';

export default function RosterTemplateCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: RosterTemplatePayload) => createRosterTemplate(payload),
    onSuccess: async (response) => { await queryClient.invalidateQueries({ queryKey: ['roster-templates'] }); navigate(`/scheduling/roster-templates/${response.data.id}`, { state: { success: 'Roster template created.' } }); },
    onError: () => setError('Roster template could not be created. Check the weekly pattern and try again.'),
  });
  return <PageLayout><PageHeader title="Create Roster Template" description="Create a reusable weekly pattern for future draft rosters." breadcrumbs={['Admin', 'Scheduling', 'Roster Templates', 'Create']} /><RosterTemplateForm submitLabel="Create Template" loading={mutation.isPending} errorMessage={error} onSubmit={async (payload) => { setError(null); await mutation.mutateAsync(payload); }} />{mutation.isError ? <Alert severity="error" sx={{ display: 'none' }}>{error}</Alert> : null}</PageLayout>;
}
