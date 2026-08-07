import { Alert } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { RotationPatternForm } from '../components/RotationPatternForm';
import { getRotationPattern, updateRotationPattern } from '../services/rotation-patterns-api';
import type { RotationPatternPayload } from '../types/rotation-pattern.types';

export default function RotationPatternEditPage() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const patternQuery = useQuery({ queryKey: ['rotation-patterns', id], queryFn: () => getRotationPattern(id), enabled: Boolean(id) });
  const mutation = useMutation({ mutationFn: (payload: RotationPatternPayload) => updateRotationPattern(id, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['rotation-patterns'] }); navigate(`/scheduling/rotation-patterns/${id}`); } });
  const pattern = patternQuery.data?.data;
  return <PageLayout><PageHeader title="Edit Rotation Pattern" description="Update this reusable rotation cycle." breadcrumbs={['Admin', 'Scheduling', 'Rotation Patterns', 'Edit']} />{patternQuery.isLoading ? <LoadingSkeleton rows={8} /> : patternQuery.isError ? <Alert severity="error">Rotation pattern could not be loaded.</Alert> : !pattern ? <EmptyState title="Rotation pattern not found" description="The selected pattern may have been archived or removed." /> : <RotationPatternForm pattern={pattern} submitLabel="Save Changes" loading={mutation.isPending} errorMessage={mutation.isError ? 'Rotation pattern could not be updated.' : null} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} />}</PageLayout>;
}