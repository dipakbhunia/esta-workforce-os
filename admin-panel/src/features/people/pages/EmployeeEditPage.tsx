import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { EmployeeForm } from '../components/EmployeeForm';
import { getEmployee, updateEmployee } from '../services/employees-api';
import type { EmployeeUpdatePayload } from '../types/employee.types';

export default function EmployeeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const employeeQuery = useQuery({
    queryKey: ['employee', id],
    queryFn: () => getEmployee(id!),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: (payload: EmployeeUpdatePayload) => updateEmployee(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
        queryClient.invalidateQueries({ queryKey: ['employee', id] }),
      ]);
      navigate(`/people/employees/${response.data.id}`, { replace: true, state: { success: 'Employee updated successfully.' } });
    },
    onError: () => setError('Employee could not be updated. Check permissions and try again.'),
  });

  if (employeeQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (employeeQuery.isError || !employeeQuery.data) return <Alert severity="error">Employee could not be loaded.</Alert>;

  return (
    <Stack gap={3}>
      <PageHeader title="Edit Employee" description="Update employee profile metadata." breadcrumbs={['Admin', 'People', 'Employees', 'Edit']} />
      <EmployeeForm employee={employeeQuery.data.data} submitLabel="Save employee" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload as EmployeeUpdatePayload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
