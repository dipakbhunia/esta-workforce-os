import { Alert, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '../hooks/useAuth';
import { getEmailVerificationStatus, requestEmailVerification } from '../services/auth-api';
import { authErrorMessage } from '../utils/errors';

export default function EmailVerificationSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ['auth', 'email-verification-status'],
    queryFn: () => getEmailVerificationStatus().then((response) => response.data),
  });
  const request = useMutation({
    mutationFn: requestEmailVerification,
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      setFeedback('If verification is required and the request is eligible, an email has been queued. Check your inbox before requesting again.');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'email-verification-status'] });
    },
  });

  return <Stack spacing={3}>
    <PageHeader title="Account security" description="Verify the current email address used by your platform administrator account." breadcrumbs={['Admin', 'Account', 'Security']} />
    <Card sx={{ maxWidth: 760 }}>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={2}>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">Current email</Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }} fontWeight={700}>{user?.email}</Typography>
            </Stack>
            {status.isLoading ? <CircularProgress size={24} aria-label="Loading verification status" /> : status.data?.verified ? <Chip color="success" icon={<MailCheck size={16} />} label="Verified" /> : <Chip color="warning" label="Unverified" />}
          </Stack>
          {status.isError ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => status.refetch()}>Retry</Button>}>Verification status could not be loaded.</Alert> : null}
          {feedback ? <Alert severity="success">{feedback}</Alert> : null}
          {request.isError ? <Alert severity="error">{authErrorMessage(request.error)}</Alert> : null}
          <Typography color="text.secondary">Verification links are time-limited and can be used only once. Repeated requests may be safely throttled.</Typography>
          <Button variant="contained" sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }} disabled={status.isLoading || status.data?.verified || request.isPending} onClick={() => request.mutate()} startIcon={request.isPending ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {request.isPending ? 'Requesting…' : feedback ? 'Resend verification email' : 'Request verification email'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  </Stack>;
}
