import { Alert, Box, Button, Divider, Stack, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { getPlatformPayment } from '../platform-payments-api';
import { formatPlatformPaymentAmount } from '../platform-payments-format';
import type { BoundedPaymentHistory, PlatformPaymentActivationStatus, PlatformPaymentAttemptHistory, PlatformPaymentAuditEvidence, PlatformPaymentDetails, PlatformPaymentOrderHistory, PlatformPaymentProviderEvent, PaymentStatus } from '../platform-payments.types';

export default function PlatformPaymentDetailsPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['platform-payment', id], queryFn: () => getPlatformPayment(id), enabled: Boolean(id) });
  const payment = query.data?.data;
  return <PageLayout>
    <PageHeader title="Payment Details" description="Read-only operational payment truth and bounded history." breadcrumbs={['Admin', 'Billing', 'Payments', 'Details']} />
    <Button component={Link} to="/billing/payments" variant="outlined" sx={{ alignSelf: 'flex-start' }}>Back to Payments</Button>
    {!id ? <Alert severity="warning">The Payment reference is missing.</Alert> : query.isLoading ? <LoadingSkeleton rows={10} /> : query.isError ? <DetailsError error={query.error} retry={() => void query.refetch()} /> : payment ? <PaymentDetails payment={payment} /> : <Alert severity="warning">Payment not found.</Alert>}
  </PageLayout>;
}

function PaymentDetails({ payment }: { payment: PlatformPaymentDetails }) {
  return <Stack gap={2}>
    <SectionCard title="Payment Truth" description="Current persisted Payment state; provider and activation states remain independent."><DetailGrid>
      <Fact name="Payment ID" value={payment.id} exact /><Fact name="Purpose" value={label(payment.purpose)} /><Fact name="Amount" value={formatPlatformPaymentAmount(payment.amountMinor, payment.currency)} /><StatusFact name="Payment status" value={payment.status} tone={paymentTone(payment.status)} />
      <Fact name="Provider" value={payment.provider} /><Fact name="Provider mode" value={payment.mode} /><Fact name="Provider status" value={payment.providerStatus ?? 'Not available'} /><Fact name="Captured provider payment ID" value={payment.capturedProviderPaymentId ?? 'Not available'} exact={Boolean(payment.capturedProviderPaymentId)} />
      <TimeFact name="Authorized" value={payment.authorizedAt} /><TimeFact name="Captured" value={payment.capturedAt} /><TimeFact name="Failed" value={payment.failedAt} /><TimeFact name="Created" value={payment.createdAt} /><TimeFact name="Updated" value={payment.updatedAt} />
    </DetailGrid></SectionCard>
    <SectionCard title="Company & Subscription" description="Commercial context comes from the immutable Subscription snapshot stored with this Payment."><DetailGrid>
      <LinkFact name="Company" text={payment.company.name} to={`/organization/companies/${payment.company.id}`} /><Fact name="Company ID" value={payment.company.id} exact />
      <LinkFact name="Subscription" text={`${payment.subscription.plan.name} (${payment.subscription.plan.code})`} to={`/saas/subscriptions/${payment.subscription.id}`} /><Fact name="Subscription ID" value={payment.subscription.id} exact /><Fact name="Plan snapshot ID" value={payment.subscription.plan.id} exact />
      <Fact name="Subscription status" value={payment.subscription.status} /><Fact name="Activation source" value={label(payment.subscription.activationSource)} /><Fact name="Activated by Payment ID" value={payment.subscription.activatedByPaymentId ?? 'Not available'} exact={Boolean(payment.subscription.activatedByPaymentId)} />
    </DetailGrid></SectionCard>
    <SectionCard title="Subscription Activation" description="Derived activation evidence; this does not replace Payment status."><StatusFact name="Activation status" value={payment.activation.status} tone={activationTone(payment.activation.status)} /></SectionCard>
    <HistoricalFailure payment={payment} />
    <OrderHistory history={payment.providerOrders} /><AttemptHistory history={payment.attempts} /><EventHistory history={payment.providerEvents} /><AuditHistory history={payment.auditEvidence} />
  </Stack>;
}

function HistoricalFailure({ payment }: { payment: PlatformPaymentDetails }) {
  const failure = payment.historicalFailure;
  return <SectionCard title="Historical Failure" description="Safe retained failure evidence, separate from current Payment truth.">{!failure ? <EmptyLine>No historical failure recorded.</EmptyLine> : <Stack gap={1}>
    <Alert severity={failure.recovered ? 'success' : payment.status === 'FAILED' ? 'error' : 'info'}>{failure.recovered ? 'This Payment previously failed and was later recovered to CAPTURED.' : payment.status === 'FAILED' ? 'This is the current Payment failure.' : 'Historical failure evidence is retained.'}</Alert>
    <DetailGrid><Fact name="Failure code" value={failure.code ?? 'Not available'} /><Fact name="Safe failure message" value={failure.message ?? 'Not available'} /><TimeFact name="Failure recorded" value={failure.failedAt} /><Fact name="Recovered" value={failure.recovered ? 'Yes' : 'No'} /></DetailGrid>
  </Stack>}</SectionCard>;
}

function OrderHistory({ history }: { history: BoundedPaymentHistory<PlatformPaymentOrderHistory> }) {
  return <HistorySection title="Provider Order History" empty="No provider orders recorded." history={history} bound={25} render={(item) => <HistoryRow key={item.id} title={`Order sequence ${item.sequence}`} status={item.status} facts={[["Provider order ID", item.providerOrderId], ["Provider status", item.providerStatus], ["Created", formatTime(item.createdAt)], ["Updated", formatTime(item.updatedAt)]]} />} />;
}
function AttemptHistory({ history }: { history: BoundedPaymentHistory<PlatformPaymentAttemptHistory> }) {
  return <HistorySection title="Payment Attempt History" empty="No payment attempts recorded." history={history} bound={100} render={(item) => <HistoryRow key={item.id} title={`Attempt sequence ${item.sequence}`} status={item.status} facts={[["Operation", label(item.operation)], ["Amount", formatPlatformPaymentAmount(item.amountMinor, item.currency)], ["Provider order ID", item.providerOrderId ?? 'Not available'], ["Provider payment ID", item.providerPaymentId ?? 'Not available'], ["Provider status", item.providerStatus ?? 'Not available'], ["Failure code", item.failureCode ?? 'Not available'], ["Safe failure message", item.safeFailureMessage ?? 'Not available'], ["Started", formatTime(item.startedAt)], ["Completed", formatTime(item.completedAt)]]} />} />;
}
function EventHistory({ history }: { history: BoundedPaymentHistory<PlatformPaymentProviderEvent> }) {
  return <HistorySection title="Provider Event History" empty="No provider events recorded." history={history} bound={100} render={(item) => <HistoryRow key={item.id} title={item.eventType} status={item.status} facts={[["Provider event ID", item.providerEventId ?? 'Not available'], ["Provider order ID", item.providerOrderId ?? 'Not available'], ["Provider payment ID", item.providerPaymentId ?? 'Not available'], ["Provider created", formatTime(item.providerCreatedAt)], ["Received", formatTime(item.receivedAt)], ["Processed", formatTime(item.processedAt)]]} />} />;
}
function AuditHistory({ history }: { history: BoundedPaymentHistory<PlatformPaymentAuditEvidence> }) {
  return <HistorySection title="Selected Audit Evidence" empty="No selected audit evidence recorded." history={history} bound={20} render={(item) => <HistoryRow key={item.id} title={label(item.action)} facts={[["Recorded", formatTime(item.recordedAt)]]} />} />;
}

function HistorySection<T extends { id: string }>({ title, empty, history, bound, render }: { title: string; empty: string; history: BoundedPaymentHistory<T>; bound: number; render: (item: T) => ReactNode }) {
  return <SectionCard title={title} description="Read-only records in authoritative API order.">{history.data.length ? <Stack divider={<Divider flexItem />} gap={1.5}>{history.data.map(render)}</Stack> : <EmptyLine>{empty}</EmptyLine>}{history.truncated ? <Typography role="note" variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>Showing the most recent {bound} records.</Typography> : null}</SectionCard>;
}
function HistoryRow({ title, status, facts }: { title: string; status?: string; facts: Array<[string, string]> }) { return <Box component="article"><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={1}><Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>{title}</Typography>{status ? <StatusChip label={status} /> : null}</Stack><Box sx={detailGrid}>{facts.map(([name, value]) => <Fact key={name} name={name} value={value} />)}</Box></Box>; }
function DetailGrid({ children }: { children: ReactNode }) { return <Box sx={detailGrid}>{children}</Box>; }
function Fact({ name, value, exact = false }: { name: string; value: string; exact?: boolean }) {
  const content = <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>;
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography>{exact ? <Tooltip title={value}>{content}</Tooltip> : content}</Box>;
}
function LinkFact({ name, text, to }: { name: string; text: string; to: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography><Typography component={Link} to={to} display="block" variant="body2" fontWeight={700} color="text.primary" sx={{ overflowWrap: 'anywhere' }}>{text}</Typography></Box>; }
function StatusFact({ name, value, tone = 'neutral' }: { name: string; value: string; tone?: StatusTone }) { return <Box><Typography variant="caption" color="text.secondary">{name}</Typography><div><StatusChip label={value} tone={tone} /></div></Box>; }
function TimeFact({ name, value }: { name: string; value: string | null }) { return <Fact name={name} value={formatTime(value)} exact={Boolean(value)} />; }
function EmptyLine({ children }: { children: ReactNode }) { return <Typography color="text.secondary" variant="body2">{children}</Typography>; }

function DetailsError({ error, retry }: { error: unknown; retry: () => void }) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 404) return <Alert severity="warning">Payment not found. <Button component={Link} color="inherit" to="/billing/payments">Back to Payments</Button></Alert>;
  if (status === 403) return <Alert severity="error">Access restricted. You do not have permission to view this Payment.</Alert>;
  if (status === 400) return <Alert severity="warning">The Payment reference is invalid. <Button component={Link} color="inherit" to="/billing/payments">Back to Payments</Button></Alert>;
  return <Alert severity="error" action={<Button color="inherit" onClick={retry}>Retry loading</Button>}>Payment details could not be loaded. Check connectivity and try again.</Alert>;
}
function formatTime(value: string | null) { if (!value) return 'Not available'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable'; }
function label(value: string) { return value.replaceAll('_', ' '); }
function paymentTone(status: PaymentStatus): StatusTone { return status === 'CAPTURED' ? 'success' : status === 'FAILED' ? 'danger' : status === 'AUTHORIZED' ? 'info' : 'warning'; }
function activationTone(status: PlatformPaymentActivationStatus): StatusTone { return status === 'COMPLETED' ? 'success' : status === 'BLOCKED' ? 'danger' : status === 'PENDING' ? 'warning' : status === 'UNRESOLVED' ? 'info' : 'neutral'; }
const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 } as const;
