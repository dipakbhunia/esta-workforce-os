import { Alert, Snackbar, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { DepartmentForm } from '../components/DepartmentForm';
import { createDepartment } from '../services/departments-api';
import type { DepartmentPayload } from '../types/department.types';

export default function DepartmentCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: DepartmentPayload) => createDepartment(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      navigate(`/organization/departments/${response.data.id}`, { replace: true, state: { success: 'Department created successfully.' } });
    },
    onError: () => setError('Department could not be created. Check the details and try again.'),
  });

  return (
    <Stack gap={3}>
      <PageHeader title="Create Department" description="Add a department to the current company workspace." breadcrumbs={['Admin', 'Organization', 'Departments', 'Create']} />
      <DepartmentForm submitLabel="Create department" loading={mutation.isPending} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Stack>
  );
}
