import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Snackbar, Stack, TextField } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { FormActions } from '@/components/form-actions';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { getAttendance } from '../services/attendance-api';
import { createAttendanceCorrection } from '../services/attendance-corrections-api';
import type { AttendanceCorrectionType, CreateAttendanceCorrectionPayload } from '../types/attendance-correction.types';
import { employeeName, formatDate, formatDateTime, formatEnum } from '../utils/attendance-format';

const correctionTypes: AttendanceCorrectionType[] = [
  'MISSED_PUNCH_IN',
  'MISSED_PUNCH_OUT',
  'TIME_CORRECTION',
  'FULL_DAY_REGULARIZATION',
];

const formSchema = z.object({
  attendanceId: z.string().uuid('Select an attendance record.'),
  type: z.enum(correctionTypes),
  reason: z.string().trim().min(1, 'Reason is required.').max(1000, 'Reason must be 1000 characters or fewer.'),
  requestedPunchInAt: z.string().optional(),
  requestedPunchOutAt: z.string().optional(),
}).superRefine((values, context) => {
  if (values.type === 'MISSED_PUNCH_IN' && !values.requestedPunchInAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPunchInAt'], message: 'Requested punch in is required.' });
  }
  if (values.type === 'MISSED_PUNCH_OUT' && !values.requestedPunchOutAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPunchOutAt'], message: 'Requested punch out is required.' });
  }
  if (values.type === 'TIME_CORRECTION' && !values.requestedPunchInAt && !values.requestedPunchOutAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPunchInAt'], message: 'At least one requested time is required.' });
  }
  if (values.type === 'FULL_DAY_REGULARIZATION') {
    if (!values.requestedPunchInAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPunchInAt'], message: 'Requested punch in is required.' });
    }
    if (!values.requestedPunchOutAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPunchOutAt'], message: 'Requested punch out is required.' });
    }
  }
  if (values.requestedPunchInAt && values.requestedPunchOutAt && new Date(values.requestedPunchOutAt) <= new Date(values.requestedPunchInAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPunchOutAt'], message: 'Requested punch out must be after punch in.' });
  }
});

type CorrectionFormValues = z.infer<typeof formSchema>;

export default function AttendanceCorrectionCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { control, handleSubmit, formState: { errors } } = useForm<CorrectionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      attendanceId: '',
      type: 'TIME_CORRECTION',
      reason: '',
      requestedPunchInAt: '',
      requestedPunchOutAt: '',
    },
  });
  const attendanceQuery = useQuery({
    queryKey: ['attendance-correction-attendance-selector'],
    queryFn: () => getAttendance({ page: 1, limit: 100 }),
  });
  const mutation = useMutation({
    mutationFn: (payload: CreateAttendanceCorrectionPayload) => createAttendanceCorrection(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      navigate(`/attendance/corrections/${response.data.id}`, { replace: true });
    },
  });

  const submit = handleSubmit((values) => {
    const payload: CreateAttendanceCorrectionPayload = {
      attendanceId: values.attendanceId,
      type: values.type,
      reason: values.reason.trim(),
      ...(values.requestedPunchInAt ? { requestedPunchInAt: toIso(values.requestedPunchInAt) } : {}),
      ...(values.requestedPunchOutAt ? { requestedPunchOutAt: toIso(values.requestedPunchOutAt) } : {}),
    };
    mutation.mutate(payload);
  });

  return (
    <Stack gap={3}>
      <PageHeader
        title="Create Correction Request"
        description="Submit a regularization request for missed punches or time corrections."
        breadcrumbs={['Admin', 'Attendance', 'Corrections', 'Create']}
      />

      <Stack component="form" gap={3} onSubmit={submit}>
        <SectionCard title="Attendance" description="Choose the attendance session that needs correction.">
          <Controller
            control={control}
            name="attendanceId"
            render={({ field }) => (
              <TextField
                {...field}
                select
                label="Attendance Record"
                fullWidth
                error={Boolean(errors.attendanceId)}
                helperText={errors.attendanceId?.message ?? 'Showing the latest visible attendance records.'}
              >
                <MenuItem value="">Select attendance</MenuItem>
                {(attendanceQuery.data?.data.data ?? []).map((record) => (
                  <MenuItem key={record.id} value={record.id}>
                    {formatDate(record.attendanceDate)} - {employeeName(record)} - In {formatDateTime(record.punchInAt)} / Out {record.punchOutAt ? formatDateTime(record.punchOutAt) : 'Open session'}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          {attendanceQuery.isError && <Alert severity="warning" sx={{ mt: 2 }}>Attendance records could not be loaded. Retry after checking backend availability.</Alert>}
          {attendanceQuery.data?.data.data.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>No attendance records are currently visible for correction.</Alert>}
        </SectionCard>

        <SectionCard title="Correction Details" description="Enter only the requested values that should be reviewed.">
          <Box sx={formGrid}>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <TextField {...field} select label="Correction Type" fullWidth error={Boolean(errors.type)} helperText={errors.type?.message}>
                  {correctionTypes.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
                </TextField>
              )}
            />
            <Controller
              control={control}
              name="requestedPunchInAt"
              render={({ field }) => (
                <TextField {...field} type="datetime-local" label="Requested Punch In" fullWidth error={Boolean(errors.requestedPunchInAt)} helperText={errors.requestedPunchInAt?.message} InputLabelProps={{ shrink: true }} />
              )}
            />
            <Controller
              control={control}
              name="requestedPunchOutAt"
              render={({ field }) => (
                <TextField {...field} type="datetime-local" label="Requested Punch Out" fullWidth error={Boolean(errors.requestedPunchOutAt)} helperText={errors.requestedPunchOutAt?.message} InputLabelProps={{ shrink: true }} />
              )}
            />
          </Box>
          <Box sx={{ mt: 2 }}>
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <TextField {...field} label="Reason" multiline minRows={4} fullWidth error={Boolean(errors.reason)} helperText={errors.reason?.message ?? 'Explain why this correction is needed.'} />
              )}
            />
          </Box>
        </SectionCard>

        <FormActions cancelTo="/attendance/corrections" submitLabel="Submit request" loading={mutation.isPending} />
      </Stack>

      <Snackbar open={mutation.isError} autoHideDuration={5000}>
        <Alert severity="error">Correction request could not be submitted. Check the form and permissions.</Alert>
      </Snackbar>
    </Stack>
  );
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

const formGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};
