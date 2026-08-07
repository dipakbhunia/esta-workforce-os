import { Alert, Snackbar } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { HolidayForm } from '../components/HolidayForm';
import { getHoliday, getHolidayCalendar, updateHoliday } from '../services/holiday-calendars-api';
import type { HolidayPayload } from '../types/holiday-calendar.types';
import { friendlyHolidayError } from '../utils/holiday-calendar-utils';

export default function HolidayEditPage() {
  const { id, holidayId } = useParams<{ id: string; holidayId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const calendarQuery = useQuery({ queryKey: ['holiday-calendar', id], queryFn: () => getHolidayCalendar(id!), enabled: Boolean(id) });
  const holidayQuery = useQuery({ queryKey: ['holiday', id, holidayId], queryFn: () => getHoliday(id!, holidayId!), enabled: Boolean(id && holidayId) });
  const mutation = useMutation({ mutationFn: (payload: HolidayPayload) => updateHoliday(id!, holidayId!, payload), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['holiday', id, holidayId] }); await queryClient.invalidateQueries({ queryKey: ['holidays', id] }); await queryClient.invalidateQueries({ queryKey: ['holiday-calendar', id] }); navigate(`/scheduling/holiday-calendar/${id}/holidays/${holidayId}`, { replace: true, state: { success: 'Holiday updated.' } }); }, onError: (error) => setErrorMessage(friendlyHolidayError(error)) });
  if (calendarQuery.isLoading || holidayQuery.isLoading) return <LoadingSkeleton rows={6} />;
  if (calendarQuery.isError || !calendarQuery.data || holidayQuery.isError || !holidayQuery.data) return <Alert severity="error">Holiday could not be loaded.</Alert>;
  return <PageLayout><PageHeader title="Edit Holiday" description="Update holiday date, type, notes, recurrence, or optional status." breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar', 'Edit Holiday']} /><HolidayForm calendarId={id!} calendarYear={calendarQuery.data.data.year} holiday={holidayQuery.data.data} submitLabel="Save Holiday" loading={mutation.isPending} errorMessage={errorMessage} onSubmit={(payload) => mutation.mutateAsync(payload).then(() => undefined)} /><Snackbar open={Boolean(errorMessage)} autoHideDuration={5000} onClose={() => setErrorMessage(null)}>{errorMessage ? <Alert severity="error" onClose={() => setErrorMessage(null)}>{errorMessage}</Alert> : undefined}</Snackbar></PageLayout>;
}
