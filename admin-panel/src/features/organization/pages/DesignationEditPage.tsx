import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { DesignationForm } from '../components/DesignationForm';
import { getDesignation, updateDesignation } from '../services/designations-api';
import type { DesignationPayload } from '../types/designation.types';

export default function DesignationEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const designationQuery = useQuery({
    queryKey: ['designation', id],
    queryFn: () => getDesignation(id!),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: (payload: DesignationPayload) => updateDesignation(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['designations'] }),
        queryClient.invalidateQueries({ queryKey: ['designation', id] }),
      ]);
      navigate(`/organization/designations/${response.data.id}`, { replace: true, state: { success: 'Designation updated successfully.' } });
    },
    onError: () => setError('Designation could not be updated. Check permissions and try again.'),
  });

  if (designationQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (designationQuery.isError || !designationQuery.data) return <Alert severity="error">Designation could not be loaded.</Alert>;

  return (
    <Stack gap={3}>
      <PageHeader title="Edit Designation" description="Update designation identity and department assignment." breadcrumbs={['Admin', 'Organization', 'Designations', 'Edit']} />
      <DesignationForm designation={designationQuery.data.data} submitLabel="Save designation" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
