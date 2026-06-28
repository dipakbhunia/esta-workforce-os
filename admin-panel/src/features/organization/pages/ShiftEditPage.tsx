import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { ShiftForm } from '../components/ShiftForm';
import { getShift, updateShift } from '../services/shifts-api';
import type { ShiftPayload } from '../types/shift.types';

export default function ShiftEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const shiftQuery = useQuery({
    queryKey: ['shift', id],
    queryFn: () => getShift(id!),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: (payload: ShiftPayload) => updateShift(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['shifts'] }),
        queryClient.invalidateQueries({ queryKey: ['shift', id] }),
      ]);
      navigate(`/organization/shifts/${response.data.id}`, { replace: true, state: { success: 'Shift updated successfully.' } });
    },
    onError: () => setError('Shift could not be updated. Check permissions and try again.'),
  });

  if (shiftQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (shiftQuery.isError || !shiftQuery.data) return <Alert severity="error">Shift could not be loaded.</Alert>;

  return (
    <Stack gap={3}>
      <PageHeader title="Edit Shift" description="Update shift identity, timing, and timezone." breadcrumbs={['Admin', 'Organization', 'Shifts', 'Edit']} />
      <ShiftForm shift={shiftQuery.data.data} submitLabel="Save shift" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
