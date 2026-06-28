import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { ShiftForm } from '../components/ShiftForm';
import { createShift } from '../services/shifts-api';
import type { ShiftPayload } from '../types/shift.types';

export default function ShiftCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: ShiftPayload) => createShift(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['shifts'] });
      navigate(`/organization/shifts/${response.data.id}`, { replace: true, state: { success: 'Shift created successfully.' } });
    },
    onError: () => setError('Shift could not be created. Check the details and try again.'),
  });

  return (
    <Stack gap={3}>
      <PageHeader title="Create Shift" description="Add a shift schedule to the current company workspace." breadcrumbs={['Admin', 'Organization', 'Shifts', 'Create']} />
      <ShiftForm submitLabel="Create shift" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
