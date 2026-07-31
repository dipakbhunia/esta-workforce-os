import { Alert, Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getEmployee } from '@/features/people/services/employees-api';
import { getShiftAssignmentHistory } from '../services/shift-assignments-api';
import type { ShiftAssignment } from '../types/shift-assignment.types';
import {
  assignmentStatusLabel,
  assignmentStatusTone,
  employeeName,
  formatAssignmentType,
  formatDateTime,
  shiftLabel,
} from '../utils/shift-assignment-utils';

export default function ShiftAssignmentHistoryPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const employeeQuery = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => getEmployee(employeeId!),
    enabled: Boolean(employeeId),
  });
  const historyQuery = useQuery({
    queryKey: ['shift-assignment-history', employeeId],
    queryFn: () => getShiftAssignmentHistory(employeeId!, { page: 1, limit: 100 }),
    enabled: Boolean(employeeId),
  });

  if (historyQuery.isLoading || employeeQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (historyQuery.isError) return <Alert severity="error">Shift assignment history could not be loaded.</Alert>;

  const assignments = historyQuery.data?.data.data ?? [];
  const employee = employeeQuery.data?.data;

  return (
    <PageLayout>
      <PageHeader
        title="Shift Assignment History"
        description={`Newest-first assignment timeline${employee ? ` for ${employeeName(employee)}` : ''}.`}
        breadcrumbs={['Admin', 'Scheduling', 'Shift Assignments', 'History']}
      />

      <SectionCard title="Employee Assignment Timeline" description="Historical and current assignment records.">
        {assignments.length === 0 ? (
          <EmptyState title="No history available" description="No shift assignment records have been created for this employee yet." />
        ) : (
          <Stack gap={1.5}>
            {assignments.map((assignment) => <TimelineItem key={assignment.id} assignment={assignment} />)}
          </Stack>
        )}
      </SectionCard>
    </PageLayout>
  );
}

function TimelineItem({ assignment }: { assignment: ShiftAssignment }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: '#EFF6FF', color: 'primary.main', flexShrink: 0 }}>
            <CalendarClock size={19} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography fontWeight={900}>{shiftLabel(assignment)}</Typography>
              <StatusChip label={assignmentStatusLabel(assignment.status)} tone={assignmentStatusTone(assignment.status)} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {formatDateTime(assignment.effectiveFrom)} to {formatDateTime(assignment.effectiveTo)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatAssignmentType(assignment.assignmentType)} · Reason: {assignment.reason ?? 'Not provided'} · Created by {userLabel(assignment.createdBy)} on {formatDateTime(assignment.createdAt)}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function userLabel(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  if (!user) return 'Not available';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Not available';
}
