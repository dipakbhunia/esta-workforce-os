import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { HolidayCalendarForm } from '../components/HolidayCalendarForm';
import { createHolidayCalendar } from '../services/holiday-calendars-api';
import type { HolidayCalendarPayload } from '../types/holiday-calendar.types';
import { friendlyHolidayError } from '../utils/holiday-calendar-utils';

export default function HolidayCalendarCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: (payload: HolidayCalendarPayload) => createHolidayCalendar(payload), onSuccess: async (response) => { await queryClient.invalidateQueries({ queryKey: ['holiday-calendars'] }); navigate(`/scheduling/holiday-calendar/${response.data.id}`, { replace: true, state: { success: 'Holiday calendar created.' } }); }, onError: (error) => setErrorMessage(friendlyHolidayError(error)) });
  return <PageLayout><PageHeader title="Create Holiday Calendar" description="Create a company or branch holiday calendar for scheduling workflows." breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar', 'Create']} /><HolidayCalendarForm submitLabel="Create Calendar" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(errorMessage)} autoHideDuration={5000} onClose={() => setErrorMessage(null)}>{errorMessage ? <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert> : undefined}</Snackbar></PageLayout>;
}
