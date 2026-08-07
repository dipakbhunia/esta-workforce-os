import { Alert, Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Edit3 } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getHoliday } from '../services/holiday-calendars-api';
import { dayOfWeek, formatDate, formatDateTime, holidayTypeLabel, mandatoryLabel, recurringLabel } from '../utils/holiday-calendar-utils';

interface LocationState { success?: string }

export default function HolidayDetailsPage() {
  const { id, holidayId } = useParams<{ id: string; holidayId: string }>();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(() => (location.state as LocationState | null)?.success ?? null);
  const holidayQuery = useQuery({ queryKey: ['holiday', id, holidayId], queryFn: () => getHoliday(id!, holidayId!), enabled: Boolean(id && holidayId) });
  if (holidayQuery.isLoading) return <LoadingSkeleton rows={6} />;
  if (holidayQuery.isError || !holidayQuery.data) return <Alert severity="error">Holiday could not be loaded.</Alert>;
  const holiday = holidayQuery.data.data;
  return <PageLayout><PageHeader title={holiday.name} description="Review the saved holiday record." breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar', 'Holiday Details']} /><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="flex-end"><Button component={RouterLink} to={`/scheduling/holiday-calendar/${id}/holidays/${holiday.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Holiday</Button></Stack><SectionCard title="Holiday Summary" description="Holiday date, type, and scheduling flags."><Box sx={detailGrid}><Detail label="Holiday Date" value={formatDate(holiday.date)} /><Detail label="Day of Week" value={dayOfWeek(holiday.date)} /><Detail label="Holiday Type" value={holidayTypeLabel(holiday.type)} /><Detail label="Mandatory/Optional" value={mandatoryLabel(holiday.optional)} /><Detail label="Recurring" value={recurringLabel(holiday.recurring)} /><Box><Typography variant="caption" color="text.secondary">Status</Typography><div><StatusChip label="Active" tone="success" /></div></Box><Detail label="Notes" value={holiday.notes ?? 'Not configured'} /><Detail label="Updated" value={formatDateTime(holiday.updatedAt)} /></Box></SectionCard><Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}</Snackbar></PageLayout>;
}

function Detail({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={850}>{value}</Typography></Box>; }
const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 };
