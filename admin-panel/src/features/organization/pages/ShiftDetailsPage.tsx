import { Alert, Box, Button, Card, CardContent, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Clock3, Edit3, TimerReset, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { useAuth } from '@/features/auth';
import { getShift } from '../services/shifts-api';
import { formatDateTime, formatWorkingHours } from '../utils/shift-form';

interface LocationState {
  success?: string;
}

export default function ShiftDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const shiftQuery = useQuery({
    queryKey: ['shift', id],
    queryFn: () => getShift(id!),
    enabled: Boolean(id),
  });
  const canManage = roles.includes('COMPANY_ADMIN') || roles.includes('HR');

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (shiftQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (shiftQuery.isError || !shiftQuery.data) return <Alert severity="error">Shift could not be loaded.</Alert>;

  const shift = shiftQuery.data.data;
  const timezone = shift.timezone ?? 'UTC';
  const timingHelper = shift.startTime && shift.endTime ? `${shift.startTime} to ${shift.endTime}` : 'Timing not available';

  return (
    <Stack gap={3}>
      <PageHeader title={shift.name} description="Read-only shift schedule foundation profile." breadcrumbs={['Admin', 'Organization', 'Shifts', shift.name]} />

      {canManage && (
        <Stack direction="row" justifyContent="flex-end">
          <Button component={RouterLink} to={`/organization/shifts/${shift.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Shift</Button>
        </Stack>
      )}

      <Box sx={statGrid}>
        <StatCard label="Working Hours" value={formatWorkingHours(shift.startTime, shift.endTime)} helper={timingHelper} icon={Clock3} tone="#2563EB" />
        <StatCard label="Timezone" value={timezone} helper="Safe fallback: UTC" icon={TimerReset} tone="#16A34A" />
        <StatCard label="Employees" value={String(shift._count?.employees ?? 'Future')} helper="Employee count when exposed" icon={Users} tone="#F59E0B" />
      </Box>

      <SectionCard title="General" description="Core shift fields currently persisted by the backend.">
        <Box sx={detailGrid}>
          <Detail label="Shift Name" value={shift.name} />
          <Detail label="Shift Code" value={shift.code} />
          <Detail label="Created Date" value={formatDateTime(shift.createdAt)} />
          <Detail label="Updated Date" value={formatDateTime(shift.updatedAt)} />
        </Box>
      </SectionCard>

      <SectionCard title="Timing" description="Shift working window and timezone.">
        <Box sx={detailGrid}>
          <Detail label="Start Time" value={shift.startTime} />
          <Detail label="End Time" value={shift.endTime} />
          <Detail label="Working Hours" value={formatWorkingHours(shift.startTime, shift.endTime)} />
          <Detail label="Timezone" value={timezone} />
        </Box>
      </SectionCard>

      <SectionCard title="Future Placeholders" description="These areas will connect as related modules expand.">
        <Box sx={detailGrid}>
          {['Employees', 'Attendance Policy'].map((item) => (
            <Card variant="outlined" key={item}>
              <CardContent>
                <Typography fontWeight={800}>{item}</Typography>
                <Typography variant="body2" color="text.secondary">Reserved for upcoming module integration.</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </SectionCard>

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}
      </Snackbar>
    </Stack>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
    </Box>
  );
}

const statGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
