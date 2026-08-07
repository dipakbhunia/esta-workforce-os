import { Alert } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { RosterTemplateForm } from '../components/RosterTemplateForm';
import { getRosterTemplate, updateRosterTemplate } from '../services/roster-templates-api';
import type { RosterTemplatePayload } from '../types/roster-template.types';

export default function RosterTemplateEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const templateQuery = useQuery({ queryKey: ['roster-template', id], queryFn: () => getRosterTemplate(id!), enabled: Boolean(id) });
  const mutation = useMutation({
    mutationFn: (payload: RosterTemplatePayload) => updateRosterTemplate(id!, payload),
    onSuccess: async (response) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['roster-templates'] }), queryClient.invalidateQueries({ queryKey: ['roster-template', id] })]); navigate(`/scheduling/roster-templates/${response.data.id}`, { state: { success: 'Roster template updated.' } }); },
    onError: () => setError('Roster template could not be updated. Check the weekly pattern and try again.'),
  });
  if (!id) return <Navigate to="/scheduling/roster-templates" replace />;
  if (templateQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (templateQuery.isError || !templateQuery.data?.data) return <PageLayout><Alert severity="error">Roster template could not be loaded.</Alert></PageLayout>;
  return <PageLayout><PageHeader title="Edit Roster Template" description="Update the reusable weekly pattern. Existing roster days remain unchanged." breadcrumbs={['Admin', 'Scheduling', 'Roster Templates', 'Edit']} /><RosterTemplateForm template={templateQuery.data.data} submitLabel="Save Template" loading={mutation.isPending} errorMessage={error} onSubmit={async (payload) => { setError(null); await mutation.mutateAsync(payload); }} /></PageLayout>;
}
