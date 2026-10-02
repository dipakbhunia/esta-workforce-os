import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import {
  PlatformEmailDeliveryFilters,
  type EmailDeliveryFilterDraft,
} from '../components/PlatformEmailDeliveryFilters';
import { PlatformEmailDeliveryList } from '../components/PlatformEmailDeliveryList';
import {
  getEmailCapability,
  listEmailDeliveries,
  platformCommunicationKeys,
} from '../platform-communication-api';
import type { EmailCapability, EmailDeliveryQuery } from '../platform-communication.types';
import {
  isoToLocal,
  localDateTimeToIso,
  parseEmailDeliveryUrl,
  serializeEmailDeliveryUrl,
  validCompanyId,
  validDateRange,
  validRecipient,
} from '../platform-communication-url';

export default function EmailDeliveryLogsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseEmailDeliveryUrl(params), [params]);
  const applied = parsed.query;
  const [draft, setDraft] = useState(() => toDraft(applied));

  useEffect(() => {
    if (parsed.shouldNormalize) setParams(parsed.normalized, { replace: true });
    setDraft(toDraft(applied));
  }, [
    applied.companyId,
    applied.eventType,
    applied.from,
    applied.limit,
    applied.page,
    applied.recipient,
    applied.status,
    applied.to,
    parsed.normalized,
    parsed.shouldNormalize,
    setParams,
  ]);

  const capabilityQuery = useQuery({
    queryKey: platformCommunicationKeys.capability,
    queryFn: getEmailCapability,
  });
  const deliveriesQuery = useQuery({
    queryKey: platformCommunicationKeys.list(applied),
    queryFn: () => listEmailDeliveries(applied),
    placeholderData: previous => previous,
  });
  const response = deliveriesQuery.data?.data;
  const rows = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const filtered = hasFilters(applied);
  const retained = Boolean(response);

  useEffect(() => {
    const totalPages = response?.meta.totalPages ?? 0;
    if (totalPages && applied.page > totalPages) {
      setParams(
        serializeEmailDeliveryUrl({ ...applied, page: totalPages }, params),
        { replace: true },
      );
    }
  }, [applied, params, response?.meta.totalPages, setParams]);

  const apply = () => {
    if (
      !validDateRange(draft.from, draft.to) ||
      !validCompanyId(draft.companyId) ||
      !validRecipient(draft.recipient)
    ) {
      return;
    }
    const next: EmailDeliveryQuery = { page: 1, limit: applied.limit };
    if (draft.status) next.status = draft.status as EmailDeliveryQuery['status'];
    if (draft.companyId.trim()) next.companyId = draft.companyId.trim();
    if (draft.recipient.trim()) next.recipient = draft.recipient.trim().toLowerCase();
    if (draft.eventType) next.eventType = draft.eventType as EmailDeliveryQuery['eventType'];
    if (draft.from) next.from = localDateTimeToIso(draft.from)!;
    if (draft.to) next.to = localDateTimeToIso(draft.to)!;
    setParams(serializeEmailDeliveryUrl(next, params));
  };

  const reset = () => {
    const resetQuery: EmailDeliveryQuery = { page: 1, limit: applied.limit };
    setDraft(toDraft(resetQuery));
    setParams(serializeEmailDeliveryUrl(resetQuery, params));
  };

  const paginate = (page: number, limit: number) => {
    setParams(
      serializeEmailDeliveryUrl(
        { ...applied, page: limit === applied.limit ? page : 1, limit },
        params,
      ),
    );
  };

  const summary = total
    ? `${total} email deliver${total === 1 ? 'y' : 'ies'}`
    : filtered
      ? 'No deliveries match the applied filters.'
      : 'No email deliveries available.';

  return (
    <PageLayout>
      <PageHeader
        title="Email Delivery Logs"
        description="Review bounded operational evidence for durable platform email deliveries."
        breadcrumbs={['Admin', 'Platform Communication', 'Email Delivery Logs']}
      />
      <Capability
        capability={capabilityQuery.data?.data}
        loading={capabilityQuery.isLoading}
        failed={capabilityQuery.isError}
        onRetry={() => void capabilityQuery.refetch()}
      />
      <PlatformEmailDeliveryFilters
        draft={draft}
        fetching={deliveriesQuery.isFetching}
        filtered={filtered}
        summary={summary}
        onChange={setDraft}
        onApply={apply}
        onReset={reset}
        onRefresh={() => void deliveriesQuery.refetch()}
      />
      {deliveriesQuery.isLoading ? (
        <Box role="status" sx={visuallyHidden}>Loading email delivery logs</Box>
      ) : null}
      {deliveriesQuery.isFetching && !deliveriesQuery.isLoading ? (
        <LinearProgress aria-label="Updating email delivery logs" />
      ) : null}
      {deliveriesQuery.isRefetchError && retained ? (
        <Alert
          severity="warning"
          action={<Button color="inherit" onClick={() => void deliveriesQuery.refetch()}>Retry</Button>}
        >
          We couldn't refresh the email delivery logs. Showing the most recent available data.
        </Alert>
      ) : null}
      {deliveriesQuery.isError && !retained ? (
        <Alert
          severity="error"
          action={<Button onClick={() => void deliveriesQuery.refetch()}>Retry</Button>}
        >
          {listError(deliveriesQuery.error)}
        </Alert>
      ) : (
        <PlatformEmailDeliveryList
          rows={rows}
          total={total}
          page={applied.page}
          limit={applied.limit}
          loading={deliveriesQuery.isLoading}
          filtered={filtered}
          onPaginationChange={paginate}
        />
      )}
    </PageLayout>
  );
}

interface CapabilityProps {
  capability?: EmailCapability;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

function Capability({ capability, loading, failed, onRetry }: CapabilityProps) {
  if (loading) return <Alert severity="info">Checking email delivery capability…</Alert>;
  if (failed) {
    return (
      <Alert severity="warning" action={<Button color="inherit" onClick={onRetry}>Retry</Button>}>
        Email capability could not be checked. Delivery logs remain available.
      </Alert>
    );
  }
  if (!capability) return null;
  if (!capability.enabled) {
    return <Alert severity="warning">Email delivery is disabled. Existing delivery evidence remains available.</Alert>;
  }
  if (!capability.configured) {
    return <Alert severity="warning">Email delivery is enabled, but SMTP configuration is incomplete. Connectivity has not been verified.</Alert>;
  }
  if (!capability.fromEmailConfigured) {
    return <Alert severity="warning">Sender email configuration is incomplete. Connectivity has not been verified.</Alert>;
  }
  return (
    <Alert severity="success">
      Email delivery is enabled and required configuration is present. This does not verify provider connectivity or authentication.
    </Alert>
  );
}

function toDraft(query: EmailDeliveryQuery): EmailDeliveryFilterDraft {
  return {
    status: query.status ?? '',
    companyId: query.companyId ?? '',
    recipient: query.recipient ?? '',
    eventType: query.eventType ?? '',
    from: query.from ? isoToLocal(query.from) : '',
    to: query.to ? isoToLocal(query.to) : '',
  };
}

function hasFilters(query: EmailDeliveryQuery) {
  return Boolean(
    query.status || query.companyId || query.recipient ||
    query.eventType || query.from || query.to,
  );
}

function listError(error: unknown) {
  if (axios.isAxiosError(error) && error.response?.status === 400) {
    return 'The applied email delivery filters are invalid. Reset or adjust them and try again.';
  }
  if (axios.isAxiosError(error) && error.response?.status === 403) {
    return 'Access restricted. You do not have permission to view platform email deliveries.';
  }
  return 'Email deliveries could not be loaded. Check connectivity and try again.';
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
