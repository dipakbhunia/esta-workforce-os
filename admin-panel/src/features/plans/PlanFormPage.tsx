import { Alert, Button } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PlanForm } from './PlanForm';
import { createPlan, getEntitlementCatalog, getPlan, updatePlan } from './plans-api';
import type { PlanPayload } from './plan.types';
import { apiError } from './plan-utils';

export default function PlanFormPage() {
  const { id } = useParams(); const navigate = useNavigate(); const client = useQueryClient(); const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['plans', id], queryFn: () => getPlan(id!), enabled: Boolean(id) });
  const catalogQuery = useQuery({ queryKey: ['plans', 'entitlement-catalog'], queryFn: getEntitlementCatalog });
  const mutation = useMutation({ mutationFn: (payload: PlanPayload) => id ? updatePlan(id, payload) : createPlan(payload), onSuccess: async ({ data }) => { await client.invalidateQueries({ queryKey: ['plans'] }); navigate(`/saas/plans/${data.id}`, { replace: true }); }, onError: (reason) => setError(apiError(reason, 'Plan could not be saved.')) });
  if (id && query.isLoading) return <LoadingSkeleton rows={8} />;
  if (id && query.isError) return <PageLayout><Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>Plan could not be loaded.</Alert></PageLayout>;
  return <PageLayout><PageHeader title={id ? 'Edit Plan' : 'Create Plan'} description="Manage the provider-neutral commercial plan catalog." breadcrumbs={['Admin', 'SaaS Management', 'Plans & Pricing', id ? 'Edit' : 'Create']} /><PlanForm plan={query.data?.data} catalog={catalogQuery.data?.data} catalogLoading={catalogQuery.isLoading} catalogError={catalogQuery.isError} retryCatalog={() => void catalogQuery.refetch()} loading={mutation.isPending} error={error} onSubmit={(payload) => { setError(null); return mutation.mutateAsync(payload).then(() => undefined); }} /></PageLayout>;
}
