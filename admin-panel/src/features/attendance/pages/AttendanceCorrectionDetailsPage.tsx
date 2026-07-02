import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import {
  cancelAttendanceCorrection,
  getAttendanceCorrection,
  reviewAttendanceCorrection,
} from '../services/attendance-corrections-api';
import { canReviewCorrections } from '../types/attendance-correction.types';
import { formatDate, formatDateTime, formatEnum } from '../utils/attendance-format';
import {
  correctionEmployeeName,
  correctionStatusTone,
  correctionTypeLabel,
  correctionUserName,
} from '../utils/attendance-correction-format';
import { ReviewCorrectionDialog } from './components/ReviewCorrectionDialog';

export default function AttendanceCorrectionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, user } = useAuth();
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const correctionQuery = useQuery({
    queryKey: ['attendance-correction', id],
    queryFn: () => getAttendanceCorrection(id!),
    enabled: Boolean(id),
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: { status: 'APPROVED' | 'REJECTED'; reviewerComment?: string }) => reviewAttendanceCorrection(id!, payload),
    onSuccess: async () => {
      setReviewAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-correction', id] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] }),
      ]);
      setToast('Correction request reviewed successfully.');
    },
    onError: () => setToast('Review failed. Check permissions and try again.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAttendanceCorrection(id!),
    onSuccess: async () => {
      setCancelOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-correction', id] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] }),
      ]);
      setToast('Correction request cancelled.');
    },
    onError: () => setToast('Cancellation failed. Check permissions and try again.'),
  });

  if (correctionQuery.isLoading) return <LoadingSkeleton rows={10} />;

  const request = correctionQuery.data?.data;
  if (correctionQuery.isError || !request) {
    return (
      <Stack gap={3}>
        <PageHeader title="Correction Details" description="Review attendance regularization request details." breadcrumbs={['Admin', 'Attendance', 'Corrections', 'Details']} />
        <Alert severity="error" action={<Button color="inherit" onClick={() => correctionQuery.refetch()}>Retry</Button>}>
          Correction request could not be loaded.
        </Alert>
      </Stack>
    );
  }

  const pending = request.status === 'PENDING';
  const canReview = pending && canReviewCorrections(roles);
  const canCancel = pending && (request.requestedByUserId === user?.id || roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR'));

  return (
    <Stack gap={3}>
      <PageHeader
        title="Correction Details"
        description="Read-only request details, review context, and future audit placeholders."
        breadcrumbs={['Admin', 'Attendance', 'Corrections', correctionEmployeeName(request)]}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} gap={1} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/attendance/corrections')}>Back to list</Button>
        {canReview && (
          <>
            <Button color="success" variant="contained" startIcon={<Check size={17} />} onClick={() => setReviewAction('APPROVED')}>Approve</Button>
            <Button color="error" variant="contained" startIcon={<X size={17} />} onClick={() => setReviewAction('REJECTED')}>Reject</Button>
          </>
        )}
        {canCancel && <Button color="warning" variant="outlined" startIcon={<RotateCcw size={17} />} onClick={() => setCancelOpen(true)}>Cancel Request</Button>}
      </Stack>

      <SectionCard title="Employee" description="Employee and attendance session linked to this request.">
        <Box sx={detailGrid}>
          <Detail label="Employee" value={correctionEmployeeName(request)} />
          <Detail label="Employee Code" value={request.employee?.employeeCode ?? 'Not available'} />
          <Detail label="Email" value={request.employee?.user?.email ?? 'Not available'} />
          <Detail label="Attendance Date" value={formatDate(request.attendance?.attendanceDate)} />
        </Box>
      </SectionCard>

      <SectionCard title="Request Summary" description="Correction type, status, and submitted reason.">
        <Box sx={detailGrid}>
          <Detail label="Type" value={correctionTypeLabel(request.type)} />
          <Box>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <Box sx={{ mt: 0.75 }}>
              <StatusChip label={formatEnum(request.status)} tone={correctionStatusTone(request.status)} />
            </Box>
          </Box>
          <Detail label="Reason" value={request.reason || 'Not available'} />
          <Detail label="Reviewer Comment" value={request.reviewerComment || 'Not available'} />
        </Box>
      </SectionCard>

      <Box sx={twoColumnGrid}>
        <SectionCard title="Original Times" description="Current attendance values captured when the request was created.">
          <Box sx={detailGrid}>
            <Detail label="Original Punch In" value={formatDateTime(request.originalPunchInAt)} />
            <Detail label="Original Punch Out" value={formatDateTime(request.originalPunchOutAt)} />
            <Detail label="Attendance Punch In" value={formatDateTime(request.attendance?.punchInAt)} />
            <Detail label="Attendance Punch Out" value={formatDateTime(request.attendance?.punchOutAt)} />
          </Box>
        </SectionCard>

        <SectionCard title="Requested Times" description="Proposed values awaiting approval.">
          <Box sx={detailGrid}>
            <Detail label="Requested Punch In" value={formatDateTime(request.requestedPunchInAt)} />
            <Detail label="Requested Punch Out" value={formatDateTime(request.requestedPunchOutAt)} />
            <Detail label="Created At" value={formatDateTime(request.createdAt)} />
            <Detail label="Reviewed At" value={formatDateTime(request.reviewedAt)} />
          </Box>
        </SectionCard>
      </Box>

      <SectionCard title="People" description="Requester and reviewer context.">
        <Box sx={detailGrid}>
          <Detail label="Requested By" value={correctionUserName(request.requestedBy)} />
          <Detail label="Reviewed By" value={correctionUserName(request.reviewedBy)} />
          <Detail label="Request ID" value={request.id} />
          <Detail label="Attendance ID" value={request.attendanceId} />
        </Box>
      </SectionCard>

      <Box sx={twoColumnGrid}>
        <SectionCard title="Timeline" description="Future workflow events.">
          <EmptyState title="Timeline placeholder" description="Approval history and workflow milestones will appear here in a future update." />
        </SectionCard>
        <SectionCard title="Audit" description="Future audit trail.">
          <Card variant="outlined">
            <CardContent>
              <Typography fontWeight={900}>Audit placeholder</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Audit log details will be connected after the admin audit viewer is introduced.
              </Typography>
            </CardContent>
          </Card>
        </SectionCard>
      </Box>

      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      <ReviewCorrectionDialog
        open={Boolean(reviewAction)}
        action={reviewAction ?? 'APPROVED'}
        employeeName={correctionEmployeeName(request)}
        loading={reviewMutation.isPending}
        onClose={() => setReviewAction(null)}
        onSubmit={(reviewerComment) => {
          if (!reviewAction) return;
          reviewMutation.mutate({ status: reviewAction, reviewerComment });
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel correction request"
        description="This will cancel the pending correction request. Attendance will not be changed."
        confirmLabel="Cancel request"
        loading={cancelMutation.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
      />
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

const detailGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};

const twoColumnGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};
