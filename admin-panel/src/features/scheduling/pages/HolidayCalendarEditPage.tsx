import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { HolidayCalendarForm } from '../components/HolidayCalendarForm';
import { getHolidayCalendar, updateHolidayCalendar } from '../services/holiday-calendars-api';
import type { HolidayCalendarPayload } from '../types/holiday-calendar.types';
import { friendlyHolidayError } from '../utils/holiday-calendar-utils';

export default function HolidayCalendarEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const calendarQuery = useQuery({ queryKey: ['holiday-calendar', id], queryFn: () => getHolidayCalendar(id!), enabled: Boolean(id) });
  const mutation = useMutation({ mutationFn: (payload: HolidayCalendarPayload) => updateHolidayCalendar(id!, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['holiday-calendar', id] }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendars'] }); navigate(`/scheduling/holiday-calendar/${id}`, { replace: true, state: { success: 'Holiday calendar updated.' } }); }, onError: (error) => setErrorMessage(friendlyHolidayError(error)) });
  if (calendarQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (calendarQuery.isError || !calendarQuery.data) return <Alert severity="error">Holiday calendar could not be loaded.</Alert>;
  return <PageLayout><PageHeader title="Edit Holiday Calendar" description="Update calendar scope, year, timezone, notes, or active state." breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar', 'Edit']} /><HolidayCalendarForm calendar={calendarQuery.data.data} submitLabel="Save Calendar" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(errorMessage)} autoHideDuration={5000} onClose={() => setErrorMessage(null)}>{errorMessage ? <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert> : undefined}</Snackbar></PageLayout>;
}
