import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { RotationPatternForm } from '../components/RotationPatternForm';
import { createRotationPattern } from '../services/rotation-patterns-api';
import type { RotationPatternPayload } from '../types/rotation-pattern.types';

export default function RotationPatternCreatePage() {
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [toast, setToast] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: (payload: RotationPatternPayload) => createRotationPattern(payload), onSuccess: async (response) => { await queryClient.invalidateQueries({ queryKey: ['rotation-patterns'] }); setToast('Rotation pattern created.'); navigate(`/scheduling/rotation-patterns/${response.data.id}`); } });
  return <PageLayout><PageHeader title="Create Rotation Pattern" description="Define a reusable multi-day shift rotation cycle." breadcrumbs={['Admin', 'Scheduling', 'Rotation Patterns', 'Create']} /><RotationPatternForm submitLabel="Create Pattern" loading={mutation.isPending} errorMessage={mutation.isError ? 'Rotation pattern could not be created.' : null} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>{toast ? <Alert severity="success">{toast}</Alert> : undefined}</Snackbar></PageLayout>;
}