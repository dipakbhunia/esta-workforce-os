import { Alert, Button } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { getLeaveTypes, updateLeaveType } from '../services/leave-api';
import type { LeaveTypePayload } from '../types/leave.types';
import { LeaveTypeForm } from './components/LeaveTypeForm';

export default function LeaveTypeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const leaveTypesQuery = useQuery({
    queryKey: ['leave-types', 'edit-selector'],
    queryFn: () => getLeaveTypes({ page: 1, limit: 100 }),
  });

  const leaveType = useMemo(() => leaveTypesQuery.data?.data.data.find((item) => item.id === id), [id, leaveTypesQuery.data?.data.data]);

  const mutation = useMutation({
    mutationFn: (payload: LeaveTypePayload) => updateLeaveType(id!, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      navigate('/leave/types', { replace: true });
    },
    onError: () => setError('Leave type could not be updated. Check permissions and try again.'),
  });

  if (leaveTypesQuery.isLoading) return <LoadingSkeleton rows={8} />;

  if (leaveTypesQuery.isError) {
    return (
      <PageLayout>
        <PageHeader title="Edit Leave Type" description="Update leave type defaults and approval behavior." breadcrumbs={['Admin', 'Leave', 'Leave Types', 'Edit']} />
        <Alert severity="error" action={<Button color="inherit" onClick={() => void leaveTypesQuery.refetch()}>Retry</Button>}>
          Leave types could not be loaded.
        </Alert>
      </PageLayout>
    );
  }

  if (!leaveType) {
    return (
      <PageLayout>
        <PageHeader title="Edit Leave Type" description="Update leave type defaults and approval behavior." breadcrumbs={['Admin', 'Leave', 'Leave Types', 'Edit']} />
        <Alert severity="warning">Leave type was not found in the visible leave type directory.</Alert>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Edit Leave Type"
        description="Update leave category defaults and approval behavior."
        breadcrumbs={['Admin', 'Leave', 'Leave Types', 'Edit']}
      />
      <LeaveTypeForm leaveType={leaveType} submitLabel="Save leave type" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    </PageLayout>
  );
}
