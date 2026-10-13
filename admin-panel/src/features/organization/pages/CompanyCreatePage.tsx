import { Alert, Button, Snackbar, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { CompanyForm } from '../components/CompanyForm';
import { createCompany, resendInitialAdminInvitation } from '../services/companies-api';
import type { CompanyPayload } from '../types/company.types';
import { companyErrorMessage } from '../utils/company-form';

export default function CompanyCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; adminUserId: string; adminEmail: string } | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: CompanyPayload) => createCompany(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      if (response.data.initialAdminInvitation.queued) {
        navigate(`/organization/companies/${response.data.id}`, { replace: true, state: { success: 'Company created successfully. The initial administrator invitation was queued for delivery.' } });
        return;
      }
      setCreated({
        id: response.data.id,
        adminUserId: response.data.initialAdminInvitation.userId,
        adminEmail: response.data.initialAdminInvitation.email,
      });
    },
    onError: (mutationError) => setError(companyErrorMessage(mutationError, 'Company could not be created. Check the details and try again.')),
  });
  const resendMutation = useMutation({
    mutationFn: (userId: string) => resendInitialAdminInvitation(userId),
    onSuccess: (response) => {
      if (!created) return;
      if (!response.data.invitationQueued) {
        setRecoveryError('The replacement invitation could not be queued. Please try again.');
        return;
      }
      navigate(`/organization/companies/${created.id}`, { replace: true, state: { success: 'Company created successfully. A replacement initial administrator invitation was queued for delivery.' } });
    },
    onError: (mutationError) => setRecoveryError(companyErrorMessage(mutationError, 'The replacement invitation could not be queued. Please try again.')),
  });

  return (
    <PageLayout>
      <PageHeader title="Create Company" description="Add a new company tenant foundation." breadcrumbs={['Admin', 'Organization', 'Companies', 'Create']} />
      {created ? (
        <Alert severity="warning">
          <Stack gap={1.5}>
            <span>Company creation succeeded, but the invitation for {created.adminEmail} was not queued. The company will not be created again.</span>
            {recoveryError ? <span role="alert">{recoveryError}</span> : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <Button variant="contained" disabled={resendMutation.isPending} onClick={() => { setRecoveryError(null); resendMutation.mutate(created.adminUserId); }}>
                {resendMutation.isPending ? 'Queuing invitation…' : 'Retry invitation'}
              </Button>
              <Button variant="outlined" disabled={resendMutation.isPending} onClick={() => navigate(`/organization/companies/${created.id}`)}>
                View company
              </Button>
            </Stack>
          </Stack>
        </Alert>
      ) : <CompanyForm submitLabel="Create company" loading={mutation.isPending} errorMessage={error} onSubmit={(payload) => { setError(null); return mutation.mutateAsync(payload).then(() => undefined); }} />}
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </PageLayout>
  );
}
