import { Alert } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { createLeaveType } from '../services/leave-api';
import type { LeaveTypePayload } from '../types/leave.types';
import { LeaveTypeForm } from './components/LeaveTypeForm';

export default function LeaveTypeCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: LeaveTypePayload) => createLeaveType(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      navigate('/leave/types', { replace: true });
    },
    onError: () => setError('Leave type could not be created. Check the details and try again.'),
  });

  return (
    <PageLayout>
      <PageHeader
        title="Create Leave Type"
        description="Add a leave category and approval behavior for the current company."
        breadcrumbs={['Admin', 'Leave', 'Leave Types', 'Create']}
      />
      <LeaveTypeForm submitLabel="Create leave type" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    </PageLayout>
  );
}
