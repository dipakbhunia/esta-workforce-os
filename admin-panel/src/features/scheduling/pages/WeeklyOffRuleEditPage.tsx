import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { WeeklyOffRuleForm } from '../components/WeeklyOffRuleForm';
import { getWeeklyOffRule, updateWeeklyOffRule } from '../services/weekly-off-rules-api';
import type { WeeklyOffRulePayload } from '../types/weekly-off-rule.types';
import { friendlyWeeklyOffError } from '../utils/weekly-off-rule-utils';

export default function WeeklyOffRuleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ruleQuery = useQuery({ queryKey: ['weekly-off-rule', id], queryFn: () => getWeeklyOffRule(id!), enabled: Boolean(id) });
  const mutation = useMutation({
    mutationFn: (payload: Partial<WeeklyOffRulePayload>) => updateWeeklyOffRule(id!, payload),
    onSuccess: async (response) => { await queryClient.invalidateQueries({ queryKey: ['weekly-off-rules'] }); await queryClient.invalidateQueries({ queryKey: ['weekly-off-rule', id] }); navigate(`/scheduling/weekly-off-rules/${response.data.id}`, { replace: true, state: { success: 'Weekly off rule updated.' } }); },
    onError: (error) => setErrorMessage(friendlyWeeklyOffError(error)),
  });
  if (ruleQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (ruleQuery.isError || !ruleQuery.data) return <Alert severity="error">Weekly off rule could not be loaded.</Alert>;
  return <PageLayout><PageHeader title="Edit Weekly Off Rule" description="Update the effective scope, weekdays, priority, or enabled state." breadcrumbs={['Admin', 'Scheduling', 'Weekly Off Rules', 'Edit']} /><WeeklyOffRuleForm rule={ruleQuery.data.data} submitLabel="Save Rule" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(errorMessage)} autoHideDuration={5000} onClose={() => setErrorMessage(null)}>{errorMessage ? <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert> : undefined}</Snackbar></PageLayout>;
}