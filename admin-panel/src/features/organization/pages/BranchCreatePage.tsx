import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { BranchForm } from '../components/BranchForm';
import { createBranch } from '../services/branches-api';
import type { BranchPayload } from '../types/branch.types';

export default function BranchCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: BranchPayload) => createBranch(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
      navigate(`/organization/branches/${response.data.id}`, { replace: true, state: { success: 'Branch created successfully.' } });
    },
    onError: () => setError('Branch could not be created. Check the details and try again.'),
  });

  return (
    <Stack gap={3}>
      <PageHeader title="Create Branch" description="Add a branch to the current company workspace." breadcrumbs={['Admin', 'Organization', 'Branches', 'Create']} />
      <BranchForm submitLabel="Create branch" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
