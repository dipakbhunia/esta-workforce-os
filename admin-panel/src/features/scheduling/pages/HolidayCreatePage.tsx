import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { HolidayForm } from '../components/HolidayForm';
import { createHoliday, getHolidayCalendar } from '../services/holiday-calendars-api';
import type { HolidayPayload } from '../types/holiday-calendar.types';
import { friendlyHolidayError } from '../utils/holiday-calendar-utils';

export default function HolidayCreatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const calendarQuery = useQuery({ queryKey: ['holiday-calendar', id], queryFn: () => getHolidayCalendar(id!), enabled: Boolean(id) });
  const mutation = useMutation({ mutationFn: (payload: HolidayPayload) => createHoliday(id!, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['holidays', id] }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendar', id] }); navigate(`/scheduling/holiday-calendar/${id}`, { replace: true, state: { success: 'Holiday added.' } }); }, onError: (error) => setErrorMessage(friendlyHolidayError(error)) });
  if (calendarQuery.isLoading) return <LoadingSkeleton rows={6} />;
  if (calendarQuery.isError || !calendarQuery.data) return <Alert severity="error">Holiday calendar could not be loaded.</Alert>;
  return <PageLayout><PageHeader title="Add Holiday" description={`Add a date-only holiday to ${calendarQuery.data.data.name}.`} breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar', 'Add Holiday']} /><HolidayForm calendarId={id!} calendarYear={calendarQuery.data.data.year} submitLabel="Add Holiday" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(errorMessage)} autoHideDuration={5000} onClose={() => setErrorMessage(null)}>{errorMessage ? <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert> : undefined}</Snackbar></PageLayout>;
}
