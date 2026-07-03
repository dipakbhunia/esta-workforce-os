import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { FormActions } from '@/components/form-actions';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { useAuth } from '@/features/auth';
import { useLeaveTypes } from '../hooks/useLeaveTypes';
import { createLeaveRequest } from '../services/leave-api';
import type { CreateLeaveRequestPayload } from '../types/leave.types';

const formSchema = z.object({
  leaveTypeId: z.string().uuid('Select a leave type.'),
  startDate: z.string().min(1, 'Start date is required.'),
  endDate: z.string().min(1, 'End date is required.'),
  reason: z.string().trim().min(1, 'Reason is required.').max(1000, 'Reason must be 1000 characters or fewer.'),
}).superRefine((values, context) => {
  if (values.startDate && values.endDate && new Date(values.endDate) < new Date(values.startDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date.' });
  }
});

type LeaveRequestFormValues = z.infer<typeof formSchema>;

export default function LeaveRequestCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, roles } = useAuth();
  const leaveTypesQuery = useLeaveTypes();
  const canApplyForOthers = roles.some((role) => role === 'COMPANY_ADMIN' || role === 'HR' || role === 'MANAGER');

  const { control, handleSubmit, formState: { errors } } = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leaveTypeId: '',
      startDate: '',
      endDate: '',
      reason: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateLeaveRequestPayload) => createLeaveRequest(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      navigate(`/leave/requests/${response.data.id}`, { replace: true });
    },
  });

  const submit = handleSubmit((values) => {
    mutation.mutate({
      leaveTypeId: values.leaveTypeId,
      startDate: values.startDate,
      endDate: values.endDate,
      reason: values.reason.trim(),
    });
  });

  return (
    <PageLayout>
      <PageHeader
        title="Apply Leave"
        description="Submit a leave application for review using the configured company leave types."
        breadcrumbs={['Admin', 'Leave', 'Leave Requests', 'Create']}
      />

      {canApplyForOthers && (
        <Alert severity="info">
          Employee delegation is not part of the current backend DTO. This request will be submitted for the signed-in user: {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Current user'}.
        </Alert>
      )}

      <Stack component="form" gap={3} onSubmit={submit}>
        <SectionCard title="Leave Details" description="Choose the leave type and date range.">
          <Box sx={formGrid}>
            <Controller
              control={control}
              name="leaveTypeId"
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Leave Type"
                  fullWidth
                  error={Boolean(errors.leaveTypeId)}
                  helperText={errors.leaveTypeId?.message ?? 'Only active company leave types are shown.'}
                >
                  <MenuItem value="">Select leave type</MenuItem>
                  {(leaveTypesQuery.data?.data.data ?? []).map((leaveType) => (
                    <MenuItem key={leaveType.id} value={leaveType.id}>
                      {leaveType.name} {leaveType.defaultDays ? `- ${leaveType.defaultDays} days` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <TextField {...field} type="date" label="Start Date" fullWidth error={Boolean(errors.startDate)} helperText={errors.startDate?.message} InputLabelProps={{ shrink: true }} />
              )}
            />
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <TextField {...field} type="date" label="End Date" fullWidth error={Boolean(errors.endDate)} helperText={errors.endDate?.message} InputLabelProps={{ shrink: true }} />
              )}
            />
          </Box>
          {leaveTypesQuery.isError && <Alert severity="warning" sx={{ mt: 2 }}>Leave types could not be loaded. Retry after checking backend availability.</Alert>}
          {leaveTypesQuery.data?.data.data.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>No active leave types are currently available.</Alert>}
        </SectionCard>

        <SectionCard title="Reason" description="Explain the leave request for the reviewer.">
          <Controller
            control={control}
            name="reason"
            render={({ field }) => (
              <TextField {...field} label="Reason" multiline minRows={5} fullWidth error={Boolean(errors.reason)} helperText={errors.reason?.message ?? 'Keep the reason concise and reviewer-friendly.'} />
            )}
          />
        </SectionCard>

        <FormActions cancelTo="/leave/requests" submitLabel="Submit request" loading={mutation.isPending} />
      </Stack>

      {mutation.isError && <Alert severity="error">Leave request could not be submitted. Check validation, balance, and permissions.</Alert>}
    </PageLayout>
  );
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
