import { Alert } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { ShiftAssignmentForm } from '../components/ShiftAssignmentForm';
import { getShiftAssignment, updateShiftAssignment } from '../services/shift-assignments-api';
import type { ShiftAssignmentPayload } from '../types/shift-assignment.types';
import { employeeName, friendlyAssignmentError } from '../utils/shift-assignment-utils';

export default function ShiftAssignmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const assignmentQuery = useQuery({
    queryKey: ['shift-assignment', id],
    queryFn: () => getShiftAssignment(id!),
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: (payload: ShiftAssignmentPayload) => updateShiftAssignment(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['shift-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['shift-assignment', id] }),
      ]);
      navigate(`/scheduling/shift-assignments/${response.data.id}`, { replace: true, state: { success: 'Shift assignment updated.' } });
    },
    onError: (error) => setErrorMessage(friendlyAssignmentError(error)),
  });

  if (assignmentQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (assignmentQuery.isError || !assignmentQuery.data) return <Alert severity="error">Shift assignment could not be loaded.</Alert>;

  const assignment = assignmentQuery.data.data;

  return (
    <PageLayout>
      <PageHeader title="Edit Shift Assignment" description={`Update assignment for ${employeeName(assignment.employee)}.`} breadcrumbs={['Admin', 'Scheduling', 'Shift Assignments', 'Edit']} />
      {assignment.status === 'CANCELLED' ? (
        <Alert severity="warning">Cancelled assignments cannot be edited. Create a new assignment if this employee needs a future shift change.</Alert>
      ) : (
        <ShiftAssignmentForm assignment={assignment} submitLabel="Save Assignment" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      )}
    </PageLayout>
  );
}
