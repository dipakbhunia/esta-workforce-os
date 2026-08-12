import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { CompanyForm } from '../components/CompanyForm';
import { createCompany } from '../services/companies-api';
import type { CompanyPayload } from '../types/company.types';
import { companyErrorMessage } from '../utils/company-form';

export default function CompanyCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: CompanyPayload) => createCompany(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      navigate(`/organization/companies/${response.data.id}`, { replace: true, state: { success: 'Company created successfully.' } });
    },
    onError: (mutationError) => setError(companyErrorMessage(mutationError, 'Company could not be created. Check the details and try again.')),
  });

  return (
    <PageLayout>
      <PageHeader title="Create Company" description="Add a new company tenant foundation." breadcrumbs={['Admin', 'Organization', 'Companies', 'Create']} />
      <CompanyForm submitLabel="Create company" loading={mutation.isPending} errorMessage={error} onSubmit={(payload) => { setError(null); return mutation.mutateAsync(payload).then(() => undefined); }} />
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </PageLayout>
  );
}
