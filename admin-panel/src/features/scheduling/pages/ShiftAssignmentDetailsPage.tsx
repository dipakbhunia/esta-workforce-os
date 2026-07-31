import { Alert, Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Edit3, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getShiftAssignment } from '../services/shift-assignments-api';
import {
  assignmentStatusLabel,
  assignmentStatusTone,
  employeeEmail,
  employeeName,
  formatAssignmentType,
  formatDateTime,
  shiftLabel,
} from '../utils/shift-assignment-utils';

interface LocationState {
  success?: string;
}

export default function ShiftAssignmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [toast, setToast] = useState<string | null>(null);
  const assignmentQuery = useQuery({
    queryKey: ['shift-assignment', id],
    queryFn: () => getShiftAssignment(id!),
    enabled: Boolean(id),
  });

  useEffect(() => {
    const success = (location.state as LocationState | null)?.success;
    if (success) setToast(success);
  }, [location.state]);

  if (assignmentQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (assignmentQuery.isError || !assignmentQuery.data) return <Alert severity="error">Shift assignment could not be loaded.</Alert>;

  const assignment = assignmentQuery.data.data;

  return (
    <PageLayout>
      <PageHeader title="Shift Assignment Details" description="Review employee shift assignment, effective range, and audit context." breadcrumbs={['Admin', 'Scheduling', 'Shift Assignments', 'Details']} />

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="flex-end">
        <Button component={RouterLink} to={`/scheduling/shift-assignments/employee/${assignment.employeeId}/history`} variant="outlined" startIcon={<History size={18} />}>History</Button>
        {assignment.status !== 'CANCELLED' && <Button component={RouterLink} to={`/scheduling/shift-assignments/${assignment.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Assignment</Button>}
      </Stack>

      <SectionCard title="Assignment" description="Effective shift configuration.">
        <Box sx={detailGrid}>
          <Detail label="Employee" value={employeeName(assignment.employee)} helper={employeeEmail(assignment.employee)} />
          <Detail label="Employee Code" value={assignment.employee?.employeeCode ?? '-'} />
          <Detail label="Shift" value={shiftLabel(assignment)} helper={assignment.shift ? `${assignment.shift.startTime} - ${assignment.shift.endTime} · ${assignment.shift.timezone}` : undefined} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <div><StatusChip label={assignmentStatusLabel(assignment.status)} tone={assignmentStatusTone(assignment.status)} /></div>
          </Box>
          <Detail label="Effective From" value={formatDateTime(assignment.effectiveFrom)} />
          <Detail label="Effective To" value={formatDateTime(assignment.effectiveTo)} />
          <Detail label="Assignment Type" value={formatAssignmentType(assignment.assignmentType)} />
          <Detail label="Source" value={formatAssignmentType(assignment.source)} />
        </Box>
      </SectionCard>

      <SectionCard title="Reason and Notes" description="Context captured for HR review.">
        <Box sx={detailGrid}>
          <Detail label="Reason" value={assignment.reason ?? 'Not provided'} />
          <Detail label="Notes" value={assignment.notes ?? 'Not provided'} />
        </Box>
      </SectionCard>

      <SectionCard title="Audit" description="Created and updated metadata.">
        <Box sx={detailGrid}>
          <Detail label="Created" value={formatDateTime(assignment.createdAt)} />
          <Detail label="Updated" value={formatDateTime(assignment.updatedAt)} />
          <Detail label="Created By" value={userLabel(assignment.createdBy)} />
          <Detail label="Updated By" value={userLabel(assignment.updatedBy)} />
        </Box>
      </SectionCard>

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}
      </Snackbar>
    </PageLayout>
  );
}

function Detail({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={850}>{value}</Typography>
      {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
    </Box>
  );
}

function userLabel(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  if (!user) return 'Not available';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Not available';
}

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 2,
};
