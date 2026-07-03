import { Alert, Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileClock, RotateCcw, Send, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AvatarCell } from '@/components/avatar-cell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import { cancelLeaveRequest, getLeaveRequest, getLeaveRequestHistory, reviewLeaveRequest } from '../services/leave-api';
import type { LeaveApprovalHistory, ReviewLeaveRequestPayload } from '../types/leave.types';
import {
  employeeCode,
  employeeEmail,
  employeeName,
  formatDate,
  formatDateTime,
  formatEnum,
  formatNumber,
  historyActionTone,
  leaveStatusTone,
  userName,
} from '../utils/leave-format';
import { ReviewLeaveDialog } from './components/ReviewLeaveDialog';

export default function LeaveRequestDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, user } = useAuth();
  const [reviewMode, setReviewMode] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const requestQuery = useQuery({
    queryKey: ['leave-request', id],
    queryFn: () => getLeaveRequest(id!),
    enabled: Boolean(id),
  });

  const historyQuery = useQuery({
    queryKey: ['leave-request-history', id],
    queryFn: () => getLeaveRequestHistory(id!),
    enabled: Boolean(id),
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: ReviewLeaveRequestPayload) => reviewLeaveRequest(id!, payload),
    onSuccess: async () => {
      setReviewMode(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leave-request', id] }),
        queryClient.invalidateQueries({ queryKey: ['leave-request-history', id] }),
        queryClient.invalidateQueries({ queryKey: ['leave-requests'] }),
      ]);
      setToast('Leave request reviewed successfully.');
    },
    onError: () => setToast('Review failed. Check permissions and try again.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelLeaveRequest(id!),
    onSuccess: async () => {
      setCancelOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leave-request', id] }),
        queryClient.invalidateQueries({ queryKey: ['leave-request-history', id] }),
        queryClient.invalidateQueries({ queryKey: ['leave-requests'] }),
      ]);
      setToast('Leave request cancelled.');
    },
    onError: () => setToast('Cancellation failed. Check permissions and try again.'),
  });

  if (requestQuery.isLoading) return <LoadingSkeleton rows={10} />;

  const request = requestQuery.data?.data;
  if (requestQuery.isError || !request) {
    return (
      <PageLayout>
        <PageHeader title="Leave Request Details" description="Review leave application details." breadcrumbs={['Admin', 'Leave', 'Leave Requests', 'Details']} />
        <Alert severity="error" action={<Button color="inherit" onClick={() => void requestQuery.refetch()}>Retry</Button>}>
          Leave request could not be loaded.
        </Alert>
      </PageLayout>
    );
  }

  const pending = request.status === 'PENDING';
  const canReview = pending && roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR' || role === 'MANAGER');
  const canCancel = pending && (request.employee?.user?.id === user?.id || roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR'));

  return (
    <PageLayout>
      <PageHeader
        title="Leave Request Details"
        description="Read-only leave request, reviewer context, and approval history."
        breadcrumbs={['Admin', 'Leave', 'Leave Requests', employeeName(request)]}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} gap={1} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/leave/requests')}>Back to list</Button>
        {canReview && (
          <>
            <Button color="success" variant="contained" startIcon={<Check size={17} />} onClick={() => setReviewMode('APPROVED')}>Approve</Button>
            <Button color="error" variant="contained" startIcon={<X size={17} />} onClick={() => setReviewMode('REJECTED')}>Reject</Button>
          </>
        )}
        {canCancel && <Button color="warning" variant="outlined" startIcon={<RotateCcw size={17} />} onClick={() => setCancelOpen(true)}>Cancel Request</Button>}
      </Stack>

      <SectionCard title="Employee" description="Employee linked to this leave application.">
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <AvatarCell name={employeeName(request)} email={employeeEmail(request)} />
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary">Employee Code</Typography>
            <Typography fontWeight={900}>{employeeCode(request)}</Typography>
          </Box>
          <Box sx={{ minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <Box sx={{ mt: 0.75 }}>
              <StatusChip label={formatEnum(request.status)} tone={leaveStatusTone(request.status)} />
            </Box>
          </Box>
        </Stack>
      </SectionCard>

      <Box sx={twoColumnGrid}>
        <SectionCard title="Leave Details" description="Requested dates and leave type.">
          <Box sx={detailGrid}>
            <Detail label="Leave Type" value={request.leaveType?.name ?? 'Not available'} />
            <Detail label="Start Date" value={formatDate(request.startDate)} />
            <Detail label="End Date" value={formatDate(request.endDate)} />
            <Detail label="Total Days" value={formatNumber(request.totalDays)} />
            <Detail label="Created At" value={formatDateTime(request.createdAt)} />
            <Detail label="Updated At" value={formatDateTime(request.updatedAt)} />
          </Box>
        </SectionCard>

        <SectionCard title="Review" description="Reviewer outcome and comments.">
          <Box sx={detailGrid}>
            <Detail label="Approver" value={approverName(request.approver)} />
            <Detail label="Approver Email" value={request.approver?.user?.email ?? 'Not available'} />
            <Detail label="Reviewed At" value={formatDateTime(request.reviewedAt)} />
            <Detail label="Review Comment" value={request.reviewComment || 'Not available'} />
            <Detail label="Request ID" value={request.id} />
          </Box>
        </SectionCard>
      </Box>

      <SectionCard title="Reason" description="Employee submitted reason.">
        <Typography color={request.reason ? 'text.primary' : 'text.secondary'}>
          {request.reason || 'No reason provided.'}
        </Typography>
      </SectionCard>

      <SectionCard title="Approval History" description="Submitted, reviewed, and cancellation milestones.">
        {historyQuery.isLoading && <LoadingSkeleton rows={4} />}
        {historyQuery.isError && <Alert severity="warning" action={<Button color="inherit" onClick={() => void historyQuery.refetch()}>Retry</Button>}>Approval history could not be loaded.</Alert>}
        {!historyQuery.isLoading && !historyQuery.isError && (historyQuery.data?.data.length ?? 0) === 0 && (
          <EmptyState title="No history yet" description="Workflow history will appear after the request is submitted or reviewed." />
        )}
        <Stack gap={0}>
          {(historyQuery.data?.data ?? []).map((item, index, items) => (
            <HistoryItem key={item.id} item={item} last={index === items.length - 1} />
          ))}
        </Stack>
      </SectionCard>

      <Box sx={twoColumnGrid}>
        <SectionCard title="Timeline Placeholder" description="Future leave workflow timeline.">
          <EmptyState title="Timeline placeholder" description="Detailed approval timeline will be expanded in a future leave workflow phase." />
        </SectionCard>
        <SectionCard title="Audit Placeholder" description="Future audit visibility.">
          <Card variant="outlined">
            <CardContent>
              <Typography fontWeight={900}>Audit trail coming later</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Audit log details will be connected after the admin audit viewer is introduced.
              </Typography>
            </CardContent>
          </Card>
        </SectionCard>
      </Box>

      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      <ReviewLeaveDialog
        open={Boolean(reviewMode)}
        mode={reviewMode ?? 'APPROVED'}
        loading={reviewMutation.isPending}
        onClose={() => setReviewMode(null)}
        onSubmit={(payload) => reviewMutation.mutate(payload)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel leave request"
        description="This will cancel the pending leave request. Approved leave cannot be cancelled from this action."
        confirmLabel="Cancel request"
        loading={cancelMutation.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
      />
    </PageLayout>
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

function approverName(approver: { user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null } | null | undefined) {
  const user = approver?.user;
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Not available';
}

function HistoryItem({ item, last }: { item: LeaveApprovalHistory; last: boolean }) {
  const Icon = item.action === 'SUBMITTED' ? Send : item.action === 'APPROVED' ? Check : item.action === 'REJECTED' ? X : RotateCcw;
  return (
    <Stack direction="row" gap={2}>
      <Stack alignItems="center">
        <Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: '#F3F4F6', display: 'grid', placeItems: 'center' }}>
          <Icon size={17} />
        </Box>
        {!last && <Divider orientation="vertical" flexItem sx={{ minHeight: 38 }} />}
      </Stack>
      <Box sx={{ pb: last ? 0 : 2, flex: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
          <Stack direction="row" gap={1} alignItems="center">
            <Typography fontWeight={900}>{formatEnum(item.action)}</Typography>
            <StatusChip label={formatEnum(item.action)} tone={historyActionTone(item.action)} />
          </Stack>
          <Typography variant="caption" color="text.secondary">{formatDateTime(item.createdAt)}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {userName(item.actor)}{item.comment ? ` - ${item.comment}` : ''}
        </Typography>
      </Box>
    </Stack>
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
