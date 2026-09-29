import { Alert, Box, Button, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { getPlatformDunning, platformDunningKeys } from '../platform-dunning-api';
import { formatPlatformDunningAmount, formatPlatformDunningDate } from '../platform-dunning-format';
import type { DunningClassification, PlatformDunningDetails } from '../platform-dunning.types';

export default function PlatformDunningDetailsPage() {
  const { renewalId = '' } = useParams();
  const query = useQuery({ queryKey: platformDunningKeys.details(renewalId), queryFn: () => getPlatformDunning(renewalId), enabled: Boolean(renewalId), placeholderData: previous => previous });
  const detail = query.data?.data;
  return <PageLayout>
    <PageHeader title="Dunning Details" description="Current Dunning classification and bounded supporting commercial evidence." breadcrumbs={['Admin', 'Billing', { label: 'Dunning', to: '/billing/dunning' }, 'Details']} />
    <Button component={Link} to="/billing/dunning" variant="outlined" sx={{ alignSelf: 'flex-start' }}>Back to Dunning</Button>
    {!renewalId ? <Alert severity="warning">The Dunning reference is missing.</Alert> : null}
    {query.isLoading ? <><Box role="status" sx={hidden}>Loading Dunning details</Box><LoadingSkeleton rows={10} /></> : null}
    {query.isFetching && !query.isLoading ? <LinearProgress aria-label="Updating Dunning details" /> : null}
    {query.isRefetchError && detail ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>We couldn't refresh the Dunning details. Showing the most recent available evidence.</Alert> : null}
    {query.isError && !detail ? <DetailsError error={query.error} retry={() => void query.refetch()} /> : null}
    {detail ? <Details detail={detail} /> : null}
  </PageLayout>;
}

function Details({ detail }: { detail: PlatformDunningDetails }) {
  const r = detail.renewal, p = detail.payment;
  return <Stack gap={2}>
    <SectionCard title="Dunning Summary" description="Backend-evaluated current Dunning state."><Grid><StatusFact name="Classification" value={label(detail.classification)} tone={classificationTone(detail.classification)} /><Fact name="Active" value={detail.active ? 'Yes' : 'No'} />{detail.reason ? <StatusFact name="Open reason" value={label(detail.reason)} tone={detail.reason === 'PAYMENT_FAILED' ? 'danger' : detail.reason === 'PAYMENT_AUTHORIZED' ? 'info' : 'warning'} /> : null}<TimeFact name="Evaluated" value={detail.evaluationTime} /><TimeFact name="Due" value={detail.dueAt} /></Grid></SectionCard>
    <SectionCard title="Company & Subscription" description="Company identity and immutable Plan snapshot."><Grid><LinkFact name="Company" text={detail.company.name} to={'/organization/companies/' + detail.company.id} /><Fact name="Company ID" value={detail.company.id} /><LinkFact name="Subscription / Plan" text={detail.subscription.plan.name + ' (' + detail.subscription.plan.code + ')'} to={'/saas/subscriptions/' + detail.subscription.id} /><Fact name="Subscription ID" value={detail.subscription.id} /><StatusFact name="Subscription status" value={detail.subscription.status} /><Fact name="Plan snapshot ID" value={detail.subscription.plan.id} /></Grid></SectionCard>
    <SectionCard title="Renewal Cycle" description="Persisted Renewal lifecycle and commercial snapshot; values are not recalculated."><Grid><LinkFact name="Renewal ID" text={r.id} to={'/billing/renewals/' + r.id} /><StatusFact name="Renewal status" value={r.status} /><Fact name="Billing interval" value={r.billingInterval} /><TimeFact name="Cycle starts" value={r.cycleStart} /><TimeFact name="Cycle ends" value={r.cycleEnd} /><Fact name="Price basis" value={label(r.recurringPriceBasis)} /><Fact name="Seats" value={String(r.seatQuantity)} /><Fact name="Unit price" value={r.recurringUnitPriceMinor === null ? 'Not available' : formatPlatformDunningAmount(r.recurringUnitPriceMinor, r.currency)} /><Fact name="Recurring total" value={formatPlatformDunningAmount(r.recurringTotalPriceMinor, r.currency)} /><Fact name="Prepared by user ID" value={available(r.preparedByUserId)} /></Grid></SectionCard>
    <SectionCard title="Payment Truth" description="Current Payment state is authoritative; historical evidence below does not override it."><Grid><LinkFact name="Payment ID" text={p.id} to={'/billing/payments/' + p.id} /><StatusFact name="Current Payment status" value={p.status} tone={paymentTone(p.status)} /><Fact name="Purpose" value={label(p.purpose)} /><Fact name="Amount" value={formatPlatformDunningAmount(p.amountMinor, p.currency)} /><Fact name="Provider" value={p.provider} /><Fact name="Mode" value={p.mode} /><Fact name="Provider status" value={available(p.providerStatus)} /><TimeFact name="Created" value={p.createdAt} /><TimeFact name="Authorized" value={p.authorizedAt} /><TimeFact name="Captured" value={p.capturedAt} /><TimeFact name="Updated" value={p.updatedAt} /></Grid></SectionCard>
    <HistoricalFailure detail={detail} />
    <SectionCard title="Latest Provider Order" description="Supplemental safe provider-order evidence; it does not override Payment truth.">{detail.latestProviderOrder ? <Grid><Fact name="Internal order ID" value={detail.latestProviderOrder.id} /><StatusFact name="Order status" value={detail.latestProviderOrder.status} /><Fact name="Provider status" value={detail.latestProviderOrder.providerStatus} /><TimeFact name="Created" value={detail.latestProviderOrder.createdAt} /><TimeFact name="Updated" value={detail.latestProviderOrder.updatedAt} /></Grid> : <Empty>No provider order available.</Empty>}</SectionCard>
    <Attempts detail={detail} />
    <Tax detail={detail} />
    <SectionCard title="Linked Invoice" description="Persisted Invoice summary; no Invoice data is fetched or recalculated.">{detail.invoice ? <Grid><LinkFact name="Invoice" text={detail.invoice.invoiceNumber} to={'/billing/invoices/' + detail.invoice.id} /><Fact name="Invoice ID" value={detail.invoice.id} /><Fact name="Subtotal" value={formatPlatformDunningAmount(detail.invoice.subtotalMinor, detail.invoice.currency)} /><Fact name="Tax" value={detail.invoice.totalTaxMinor === null ? 'Not available' : formatPlatformDunningAmount(detail.invoice.totalTaxMinor, detail.invoice.currency)} /><Fact name="Total" value={formatPlatformDunningAmount(detail.invoice.totalMinor, detail.invoice.currency)} /><TimeFact name="Issued" value={detail.invoice.issuedAt} /></Grid> : <Empty>No linked Invoice available.</Empty>}</SectionCard>
    <SectionCard title="Application & Recovery Evidence" description="Persisted application evidence interpreted only through the backend classification."><Grid><Fact name="Application attempts" value={String(r.applicationAttemptCount)} /><TimeFact name="Last application attempt" value={r.lastApplicationAttemptAt} /><TimeFact name="Applied" value={r.appliedAt} /><TimeFact name="Blocked" value={r.blockedAt} /><Fact name="Block code" value={available(r.blockCode)} /><Fact name="Safe block message" value={available(r.safeBlockMessage)} /></Grid></SectionCard>
  </Stack>;
}

function HistoricalFailure({ detail }: { detail: PlatformDunningDetails }) {
  const p = detail.payment;
  const present = Boolean(p.failedAt || p.failureCode || p.safeFailureMessage);
  return <SectionCard title="Historical Failure Evidence" description="Retained supplemental evidence, separate from current Payment truth.">{present ? <Stack gap={1.5}>{p.status === 'CAPTURED' ? <Alert severity="info">This Payment is currently CAPTURED. Earlier failure evidence is retained for history only.</Alert> : null}<Grid><TimeFact name="Failure recorded" value={p.failedAt} /><Fact name="Failure code" value={available(p.failureCode)} /><Fact name="Safe failure message" value={available(p.safeFailureMessage)} /></Grid></Stack> : <Empty>No historical failure evidence available.</Empty>}</SectionCard>;
}

function Attempts({ detail }: { detail: PlatformDunningDetails }) {
  return <SectionCard title="Payment Attempts" description="Latest bounded attempts in authoritative API order.">{detail.attempts.data.length ? <Stack divider={<Divider flexItem />} gap={1.5}>{detail.attempts.data.map(a => <Box component="article" key={a.id}><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography variant="subtitle2">Attempt {a.sequence}</Typography><StatusChip label={a.status} tone={a.status === 'SUCCEEDED' ? 'success' : a.status === 'FAILED' ? 'danger' : 'info'} /></Stack><Grid><Fact name="Attempt ID" value={a.id} /><Fact name="Operation" value={label(a.operation)} /><Fact name="Provider status" value={available(a.providerStatus)} /><Fact name="Failure code" value={available(a.failureCode)} /><Fact name="Safe failure message" value={available(a.safeFailureMessage)} /><TimeFact name="Started" value={a.startedAt} /><TimeFact name="Completed" value={a.completedAt} /></Grid></Box>)}</Stack> : <Empty>No Payment attempts available.</Empty>}{detail.attempts.truncated ? <Typography role="note" variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>Showing the latest 25 Payment attempts.</Typography> : null}</SectionCard>;
}

function Tax({ detail }: { detail: PlatformDunningDetails }) {
  const tax = detail.tax;
  return <SectionCard title="GST / Tax Snapshot" description="Persisted tax evidence only; no current policy is consulted.">{tax ? <Stack gap={1.5}><Grid><Fact name="Treatment" value={label(tax.treatment)} /><Fact name="Jurisdiction" value={tax.jurisdictionClassification ? label(tax.jurisdictionClassification) : 'Not available'} /><Fact name="Service classification" value={available(tax.serviceClassification)} /><Fact name="Taxable subtotal" value={formatPlatformDunningAmount(tax.taxableSubtotalMinor, tax.currency)} /><Fact name="Total tax" value={formatPlatformDunningAmount(tax.totalTaxMinor, tax.currency)} /><Fact name="Gross total" value={formatPlatformDunningAmount(tax.grossTotalMinor, tax.currency)} /><TimeFact name="Decision time" value={tax.decisionAt} /></Grid>{tax.components.length ? <Stack divider={<Divider flexItem />} gap={1}>{tax.components.map(c => <Box component="article" key={c.type}><Grid><Fact name="Component" value={c.type} /><Fact name="Rate (basis points)" value={String(c.rateBasisPoints)} /><Fact name="Taxable amount" value={formatPlatformDunningAmount(c.taxableAmountMinor, c.currency)} /><Fact name="Tax amount" value={formatPlatformDunningAmount(c.taxAmountMinor, c.currency)} /></Grid></Box>)}</Stack> : <Empty>No tax components available.</Empty>}</Stack> : <Empty>No persisted tax evidence available.</Empty>}</SectionCard>;
}

function DetailsError({ error, retry }: { error: unknown; retry: () => void }) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 404) return <Alert severity="warning">Dunning record not found. <Button component={Link} color="inherit" to="/billing/dunning">Back to Dunning</Button></Alert>;
  if (status === 403) return <Alert severity="error">Access restricted. You do not have permission to view this Dunning record.</Alert>;
  if (status === 400) return <Alert severity="warning">The Dunning reference is invalid. <Button component={Link} color="inherit" to="/billing/dunning">Back to Dunning</Button></Alert>;
  return <Alert severity="error" action={<Button color="inherit" onClick={retry}>Retry loading</Button>}>Dunning details could not be loaded. Check connectivity and try again.</Alert>;
}
function Grid({ children }: { children: ReactNode }) { return <Box sx={grid}>{children}</Box>; }
function Fact({ name, value }: { name: string; value: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
function LinkFact({ name, text, to }: { name: string; text: string; to: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography><Typography component={Link} to={to} display="block" variant="body2" fontWeight={700} color="text.primary" sx={{ overflowWrap: 'anywhere' }}>{text}</Typography></Box>; }
function StatusFact({ name, value, tone = 'neutral' }: { name: string; value: string; tone?: StatusTone }) { return <Box><Typography variant="caption" color="text.secondary">{name}</Typography><div><StatusChip label={value} tone={tone} /></div></Box>; }
function TimeFact({ name, value }: { name: string; value: string | null }) { return <Fact name={name} value={value ? formatPlatformDunningDate(value) : 'Not available'} />; }
function Empty({ children }: { children: ReactNode }) { return <Typography variant="body2" color="text.secondary">{children}</Typography>; }
function available(value: string | null | undefined) { return value?.trim() || 'Not available'; }
function label(value: string) { return value.replaceAll('_', ' '); }
function classificationTone(value: DunningClassification): StatusTone { return value === 'RESOLVED' ? 'success' : value === 'OPEN' ? 'warning' : value === 'RECOVERY_PENDING' ? 'info' : 'neutral'; }
function paymentTone(value: PlatformDunningDetails['payment']['status']): StatusTone { return value === 'CAPTURED' ? 'success' : value === 'FAILED' ? 'danger' : value === 'AUTHORIZED' ? 'info' : 'warning'; }
const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 } as const;
const hidden = { position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
