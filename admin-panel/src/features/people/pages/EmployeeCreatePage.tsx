import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { EmployeeForm } from '../components/EmployeeForm';
import { createEmployee } from '../services/employees-api';
import type { EmployeeCreatePayload } from '../types/employee.types';

export default function EmployeeCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: EmployeeCreatePayload) => createEmployee(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      navigate(`/people/employees/${response.data.id}`, { replace: true, state: { success: 'Employee created successfully.' } });
    },
    onError: () => setError('Employee could not be created. Check user, organization references, and try again.'),
  });

  return (
    <Stack gap={3}>
      <PageHeader title="Create Employee" description="Create an employee profile linked to an existing user account." breadcrumbs={['Admin', 'People', 'Employees', 'Create']} />
      <EmployeeForm submitLabel="Create employee" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload as EmployeeCreatePayload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
