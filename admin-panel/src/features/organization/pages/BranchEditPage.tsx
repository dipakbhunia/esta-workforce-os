import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { BranchForm } from '../components/BranchForm';
import { getBranch, updateBranch } from '../services/branches-api';
import type { BranchPayload } from '../types/branch.types';

export default function BranchEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const branchQuery = useQuery({
    queryKey: ['branch', id],
    queryFn: () => getBranch(id!),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: (payload: BranchPayload) => updateBranch(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['branches'] }),
        queryClient.invalidateQueries({ queryKey: ['branch', id] }),
      ]);
      navigate(`/organization/branches/${response.data.id}`, { replace: true, state: { success: 'Branch updated successfully.' } });
    },
    onError: () => setError('Branch could not be updated. Check permissions and try again.'),
  });

  if (branchQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (branchQuery.isError || !branchQuery.data) return <Alert severity="error">Branch could not be loaded.</Alert>;

  return (
    <Stack gap={3}>
      <PageHeader title="Edit Branch" description="Update branch identity and location details." breadcrumbs={['Admin', 'Organization', 'Branches', 'Edit']} />
      <BranchForm branch={branchQuery.data.data} submitLabel="Save branch" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
