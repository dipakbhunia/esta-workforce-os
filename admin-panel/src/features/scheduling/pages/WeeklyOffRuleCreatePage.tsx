import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { WeeklyOffRuleForm } from '../components/WeeklyOffRuleForm';
import { createWeeklyOffRule } from '../services/weekly-off-rules-api';
import type { WeeklyOffRulePayload } from '../types/weekly-off-rule.types';
import { friendlyWeeklyOffError } from '../utils/weekly-off-rule-utils';

export default function WeeklyOffRuleCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: WeeklyOffRulePayload) => createWeeklyOffRule(payload),
    onSuccess: async (response) => { await queryClient.invalidateQueries({ queryKey: ['weekly-off-rules'] }); setToast('Weekly off rule created.'); navigate(`/scheduling/weekly-off-rules/${response.data.id}`, { replace: true, state: { success: 'Weekly off rule created.' } }); },
    onError: (error) => setErrorMessage(friendlyWeeklyOffError(error)),
  });
  return <PageLayout><PageHeader title="Create Weekly Off Rule" description="Define weekly non-working days for a company, branch, department, or employee scope." breadcrumbs={['Admin', 'Scheduling', 'Weekly Off Rules', 'Create']} /><WeeklyOffRuleForm submitLabel="Create Rule" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}</Snackbar></PageLayout>;
}