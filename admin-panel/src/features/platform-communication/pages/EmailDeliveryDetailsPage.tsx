import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { getEmailDelivery, platformCommunicationKeys } from '../platform-communication-api';
import {
  claimLabel,
  emailDeliveryStatusLabel,
  emailEventLabel,
  formatEmailDeliveryDate,
} from '../platform-communication-format';
import type { PlatformEmailDelivery } from '../platform-communication.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EmailDeliveryDetailsPage() {
  const { deliveryId = '' } = useParams();
  const valid = UUID.test(deliveryId);
  const query = useQuery({
    queryKey: platformCommunicationKeys.detail(deliveryId),
    queryFn: () => getEmailDelivery(deliveryId),
    enabled: valid,
    placeholderData: previous => previous,
  });
  const data = query.data?.data;

  return (
    <PageLayout>
      <PageHeader
        title="Email Delivery Details"
        description="Read-only bounded delivery, retry, provider, and claim-lease evidence."
        breadcrumbs={[
          'Admin',
          'Platform Communication',
          { label: 'Email Delivery Logs', to: '/platform-communication/email-delivery-logs' },
          'Details',
        ]}
      />
      <Button
        component={Link}
        to="/platform-communication/email-delivery-logs"
        variant="outlined"
        sx={{ alignSelf: 'flex-start' }}
      >
        Back to Email Delivery Logs
      </Button>
      {!valid ? <Alert severity="warning">The email delivery reference is invalid.</Alert> : null}
      {query.isLoading ? (
        <>
          <Box role="status" sx={visuallyHidden}>Loading email delivery details</Box>
          <LoadingSkeleton rows={8} />
        </>
      ) : null}
      {query.isFetching && !query.isLoading ? (
        <LinearProgress aria-label="Updating email delivery details" />
      ) : null}
      {query.isRefetchError && data ? (
        <Alert
          severity="warning"
          action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}
        >
          We couldn't refresh these delivery details. Showing the most recent available evidence.
        </Alert>
      ) : null}
      {query.isError && !data ? (
        <EmailDeliveryDetailsErrorState
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : null}
      {data ? <Details data={data} /> : null}
    </PageLayout>
  );
}

function Details({ data }: { data: PlatformEmailDelivery }) {
  return (
    <Stack gap={2}>
      <SectionCard
        title="Delivery Status"
        description="Persisted status and separate operational claim-lease context."
      >
        <DetailsGrid>
          <StatusFact
            name="Status"
            value={emailDeliveryStatusLabel(data.status)}
            tone={statusTone(data.status)}
          />
          <Fact name="Claim context" value={claimLabel(data) ?? 'No active claim evidence'} />
          <Fact name="Attempt count" value={String(data.attemptCount)} />
          <TimeFact name="Claim expires" value={data.claimExpiresAt} />
          <TimeFact name="Last attempt" value={data.lastAttemptAt} />
          <TimeFact name="Next retry" value={data.nextRetryAt} />
        </DetailsGrid>
      </SectionCard>
      <SectionCard
        title="Authority & Recipient"
        description="Bounded event and recipient evidence from the delivery projection."
      >
        <DetailsGrid>
          <Fact name="Delivery ID" value={data.deliveryId} />
          <Fact name="Notification ID" value={data.notificationId} />
          <Fact name="Event type" value={emailEventLabel(data.eventType)} />
          <Fact name="Channel" value={data.channel} />
          <Fact name="Recipient" value={data.recipient} />
          <Fact name="Company ID" value={data.companyId ?? 'Platform'} />
          <Fact name="Recipient User ID" value={data.recipientUserId} />
        </DetailsGrid>
      </SectionCard>
      <SectionCard
        title="Provider & Error Evidence"
        description="Safe allow-listed evidence only; provider exceptions and credentials are never exposed."
      >
        <DetailsGrid>
          <Fact name="Provider Message ID" value={data.providerMessageId ?? 'Not available'} />
          <Fact name="Safe error code" value={data.errorCode ?? 'Not available'} />
          <Fact name="Safe error message" value={data.safeErrorMessage ?? 'Not available'} />
          <TimeFact name="Sent" value={data.sentAt} />
          <TimeFact name="Failed" value={data.failedAt} />
        </DetailsGrid>
      </SectionCard>
      <SectionCard title="Record Timeline">
        <DetailsGrid>
          <TimeFact name="Created" value={data.createdAt} />
          <TimeFact name="Updated" value={data.updatedAt} />
        </DetailsGrid>
      </SectionCard>
    </Stack>
  );
}

export function EmailDeliveryDetailsErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const status = httpStatus(error);
  if (status === 404) {
    return (
      <Alert severity="warning">
        Email delivery not found.{' '}
        <Button
          component={Link}
          color="inherit"
          to="/platform-communication/email-delivery-logs"
        >
          Back to logs
        </Button>
      </Alert>
    );
  }
  if (status === 400) {
    return <Alert severity="warning">The email delivery reference is invalid.</Alert>;
  }
  if (status === 403) {
    return (
      <Alert severity="error">
        Access restricted. You do not have permission to view this email delivery.
      </Alert>
    );
  }
  return (
    <Alert
      severity="error"
      action={<Button color="inherit" onClick={retry}>Retry loading</Button>}
    >
      Email delivery details could not be loaded. Check connectivity and try again.
    </Alert>
  );
}

function httpStatus(error: unknown) {
  if (axios.isAxiosError(error)) return error.response?.status;
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;
  const response = error.response;
  if (typeof response !== 'object' || response === null || !('status' in response)) return undefined;
  return typeof response.status === 'number' ? response.status : undefined;
}

function DetailsGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2,minmax(0,1fr))',
          lg: 'repeat(3,minmax(0,1fr))',
        },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  );
}

function Fact({ name, value }: { name: string; value: string }) {
  return (
    <Box minWidth={0}>
      <Typography variant="caption" color="text.secondary">{name}</Typography>
      <Typography
        variant="body2"
        fontWeight={700}
        sx={{ overflowWrap: 'anywhere', userSelect: 'text' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function TimeFact({ name, value }: { name: string; value: string | null }) {
  return <Fact name={name} value={formatEmailDeliveryDate(value)} />;
}

function StatusFact({
  name,
  value,
  tone,
}: {
  name: string;
  value: string;
  tone: StatusTone;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{name}</Typography>
      <div><StatusChip label={value} tone={tone} /></div>
    </Box>
  );
}

function statusTone(status: string): StatusTone {
  if (status === 'DELIVERED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'PENDING') return 'warning';
  return 'neutral';
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
