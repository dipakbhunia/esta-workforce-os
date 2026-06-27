import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { DepartmentForm } from '../components/DepartmentForm';
import { getDepartment, updateDepartment } from '../services/departments-api';
import type { DepartmentPayload } from '../types/department.types';

export default function DepartmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const departmentQuery = useQuery({
    queryKey: ['department', id],
    queryFn: () => getDepartment(id!),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: (payload: DepartmentPayload) => updateDepartment(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
        queryClient.invalidateQueries({ queryKey: ['department', id] }),
      ]);
      navigate(`/organization/departments/${response.data.id}`, { replace: true, state: { success: 'Department updated successfully.' } });
    },
    onError: () => setError('Department could not be updated. Check permissions and try again.'),
  });

  if (departmentQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (departmentQuery.isError || !departmentQuery.data) return <Alert severity="error">Department could not be loaded.</Alert>;

  return (
    <Stack gap={3}>
      <PageHeader title="Edit Department" description="Update department identity and branch assignment." breadcrumbs={['Admin', 'Organization', 'Departments', 'Edit']} />
      <DepartmentForm department={departmentQuery.data.data} submitLabel="Save department" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
