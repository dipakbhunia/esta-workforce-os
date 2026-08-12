import { Alert, Button, Snackbar } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { CompanyForm } from '../components/CompanyForm';
import { getCompany, updateCompany } from '../services/companies-api';
import type { CompanyPayload } from '../types/company.types';
import { companyErrorMessage } from '../utils/company-form';

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const companyQuery = useQuery({
    queryKey: ['company', id],
    queryFn: () => getCompany(id!),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: (payload: CompanyPayload) => updateCompany(id!, payload),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({ queryKey: ['company', id] }),
      ]);
      navigate(`/organization/companies/${response.data.id}`, { replace: true, state: { success: 'Company updated successfully.' } });
    },
    onError: (mutationError) => setError(companyErrorMessage(mutationError, 'Company could not be updated. Check permissions and try again.')),
  });

  return (
    <PageLayout>
      <PageHeader title="Edit Company" description="Update tenant company foundation details." breadcrumbs={['Admin', 'Organization', 'Companies', 'Edit']} />
      {companyQuery.isLoading ? <LoadingSkeleton rows={8} /> : companyQuery.isError || !companyQuery.data ? <Alert severity="error" action={<Button color="inherit" onClick={() => void companyQuery.refetch()}>Retry</Button>}>Company could not be loaded.</Alert> : <CompanyForm company={companyQuery.data.data} submitLabel="Save company" loading={mutation.isPending} errorMessage={error} onSubmit={(payload) => { setError(null); return mutation.mutateAsync(payload).then(() => undefined); }} />}
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </PageLayout>
  );
}
