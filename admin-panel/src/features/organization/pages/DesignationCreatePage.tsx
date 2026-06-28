import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { DesignationForm } from '../components/DesignationForm';
import { createDesignation } from '../services/designations-api';
import type { DesignationPayload } from '../types/designation.types';

export default function DesignationCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: DesignationPayload) => createDesignation(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['designations'] });
      navigate(`/organization/designations/${response.data.id}`, { replace: true, state: { success: 'Designation created successfully.' } });
    },
    onError: () => setError('Designation could not be created. Check the details and try again.'),
  });

  return (
    <Stack gap={3}>
      <PageHeader title="Create Designation" description="Add a designation to the current company workspace." breadcrumbs={['Admin', 'Organization', 'Designations', 'Create']} />
      <DesignationForm submitLabel="Create designation" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
