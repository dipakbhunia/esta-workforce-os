import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { ShiftAssignmentForm } from '../components/ShiftAssignmentForm';
import { createShiftAssignment } from '../services/shift-assignments-api';
import type { ShiftAssignmentPayload } from '../types/shift-assignment.types';
import { friendlyAssignmentError } from '../utils/shift-assignment-utils';

export default function ShiftAssignmentCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ShiftAssignmentPayload) => createShiftAssignment(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      setToast('Shift assignment created.');
      navigate(`/scheduling/shift-assignments/${response.data.id}`, { replace: true, state: { success: 'Shift assignment created.' } });
    },
    onError: (error) => setErrorMessage(friendlyAssignmentError(error)),
  });

  return (
    <PageLayout>
      <PageHeader title="Create Shift Assignment" description="Assign an employee to a shift for a defined effective period." breadcrumbs={['Admin', 'Scheduling', 'Shift Assignments', 'Create']} />
      <ShiftAssignmentForm submitLabel="Create Assignment" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}
      </Snackbar>
    </PageLayout>
  );
}
