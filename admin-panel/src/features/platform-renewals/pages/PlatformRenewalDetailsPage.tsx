import { Alert, Box, Button, Divider, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { getPlatformRenewal, platformRenewalKeys, recoverPlatformRenewal } from '../platform-renewals-api';
import { formatPlatformRenewalAmount, formatPlatformRenewalDate } from '../platform-renewals-format';
import type { PlatformRenewalDetails, RenewalPaymentStatus, RenewalStatus } from '../platform-renewals.types';

export default function PlatformRenewalDetailsPage() {
  const { renewalId = '' } = useParams();
  const location = useLocation();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [success, setSuccess] = useState((location.state as { success?: string } | null)?.success ?? '');
  const query = useQuery({ queryKey: platformRenewalKeys.details(renewalId), queryFn: () => getPlatformRenewal(renewalId), enabled: Boolean(renewalId), placeholderData: (previous) => previous });
  const renewal = query.data?.data;
  const recovery = useMutation({ mutationFn: () => recoverPlatformRenewal(renewalId), onSuccess: async ({ data }) => {
    setConfirm(false); setSuccess(data.outcome === 'ALREADY_APPLIED' ? 'Renewal was already applied. Current evidence has been refreshed.' : 'Renewal applied successfully.');
    await Promise.all([
      client.invalidateQueries({ queryKey: platformRenewalKeys.details(renewalId) }),
      client.invalidateQueries({ queryKey: [...platformRenewalKeys.all, 'list'] }),
      client.invalidateQueries({ queryKey: ['subscription', data.subscriptionId] }),
      client.invalidateQueries({ queryKey: ['subscriptions'] }),
      client.invalidateQueries({ queryKey: ['platform-invoices', 'list'] }),
      client.invalidateQueries({ queryKey: ['platform-dashboard'] }),
    ]);
  } });
  return <PageLayout>
    <PageHeader title="Renewal Details" description="Read-only persisted Renewal, Payment, tax, provider-order, and Invoice evidence." breadcrumbs={['Admin', 'Billing', { label: 'Renewals', to: '/billing/renewals' }, 'Details']} />
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1.5 }}>
      <Button component={Link} to="/billing/renewals" variant="outlined" sx={{ width: { xs: '100%', sm: 'auto' } }}>Back to Renewals</Button>
      {renewal?.status === 'PREPARED' ? <Button variant="contained" onClick={() => { recovery.reset(); setConfirm(true); }} sx={{ width: { xs: '100%', sm: 'auto' } }}>Recover Renewal</Button> : null}
    </Box>
    {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
    {recovery.isError ? <Alert severity="error">{recoveryError(recovery.error)}</Alert> : null}
    {!renewalId ? <Alert severity="warning">The Renewal reference is missing.</Alert> : null}
    {query.isLoading ? <><Box role="status" sx={hidden}>Loading Renewal details</Box><LoadingSkeleton rows={10} /></> : null}
    {query.isFetching && !query.isLoading ? <LinearProgress aria-label="Updating Renewal details" /> : null}
    {query.isRefetchError && renewal ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>We couldn't refresh the Renewal details. Showing the most recent available evidence.</Alert> : null}
    {query.isError && !renewal ? <DetailsError error={query.error} retry={() => void query.refetch()} /> : null}
    {renewal ? <Details renewal={renewal} /> : null}
    <ConfirmDialog open={confirm} title="Recover Renewal?" description="This asks the backend to apply the captured Renewal Payment. It does not capture a Payment or create replacement commercial evidence." descriptionId="recover-renewal-description" confirmLabel="Recover Renewal" loading={recovery.isPending} onClose={() => { if (!recovery.isPending) setConfirm(false); }} onConfirm={() => recovery.mutate()} />
  </PageLayout>;
}

function Details({ renewal }: { renewal: PlatformRenewalDetails }) {
  return <Stack gap={2}>
    <SectionCard title="Renewal Summary" description="Persisted Renewal identity and lifecycle evidence."><Grid><Fact name="Renewal ID" value={renewal.id} exact /><StatusFact name="Renewal status" value={renewal.status} tone={renewalTone(renewal.status)} /><Fact name="Billing interval" value={renewal.billingInterval} /><TimeFact name="Cycle starts" value={renewal.cycleStart} /><TimeFact name="Cycle ends" value={renewal.cycleEnd} /><TimeFact name="Prepared" value={renewal.createdAt} /><TimeFact name="Applied" value={renewal.appliedAt} /><TimeFact name="Blocked" value={renewal.blockedAt} /></Grid></SectionCard>
    <SectionCard title="Company & Subscription" description="Company and immutable Plan snapshot returned with this Renewal."><Grid><LinkFact name="Company" text={renewal.company.name} to={`/organization/companies/${renewal.company.id}`} /><Fact name="Company ID" value={renewal.company.id} exact /><LinkFact name="Subscription / Plan" text={`${renewal.subscription.plan.name} (${renewal.subscription.plan.code})`} to={`/saas/subscriptions/${renewal.subscription.id}`} /><Fact name="Subscription ID" value={renewal.subscription.id} exact /><Fact name="Subscription status" value={renewal.subscription.status} /><Fact name="Plan snapshot ID" value={renewal.subscription.plan.id} exact /></Grid></SectionCard>
    <SectionCard title="Commercial & Cycle Snapshot" description="Immutable Renewal commercial evidence; totals are displayed without recalculation."><Grid><Fact name="Price basis" value={label(renewal.recurringPriceBasis)} /><Fact name="Seats" value={String(renewal.seatQuantity)} /><Fact name="Unit price" value={renewal.recurringUnitPriceMinor === null ? 'Not available' : formatPlatformRenewalAmount(renewal.recurringUnitPriceMinor, renewal.currency)} /><Fact name="Recurring total" value={formatPlatformRenewalAmount(renewal.recurringTotalPriceMinor, renewal.currency)} /><Fact name="Currency" value={renewal.currency} /><TimeFact name="Cycle starts" value={renewal.cycleStart} /><TimeFact name="Cycle ends" value={renewal.cycleEnd} /></Grid></SectionCard>
    <SectionCard title="Payment Truth" description="Payment truth remains separate from Renewal lifecycle state."><Grid><LinkFact name="Payment ID" text={renewal.payment.id} to={`/billing/payments/${renewal.payment.id}`} /><StatusFact name="Payment status" value={renewal.payment.status} tone={paymentTone(renewal.payment.status)} /><Fact name="Purpose" value={label(renewal.payment.purpose)} /><Fact name="Amount" value={formatPlatformRenewalAmount(renewal.payment.amountMinor, renewal.payment.currency)} /><Fact name="Provider" value={renewal.payment.provider} /><Fact name="Mode" value={renewal.payment.mode} /><TimeFact name="Captured" value={renewal.payment.capturedAt} /></Grid></SectionCard>
    <TaxEvidence renewal={renewal} />
    <SectionCard title="Provider Order" description="Latest safe provider-order summary; order state does not imply Payment capture.">{renewal.providerOrder ? <Grid><Fact name="Provider order ID" value={renewal.providerOrder.providerOrderId} exact /><Fact name="Sequence" value={String(renewal.providerOrder.sequence)} /><StatusFact name="Order status" value={renewal.providerOrder.status} /><Fact name="Provider status" value={renewal.providerOrder.providerStatus} /><TimeFact name="Created" value={renewal.providerOrder.createdAt} /><TimeFact name="Updated" value={renewal.providerOrder.updatedAt} /></Grid> : <Empty>No provider order available.</Empty>}</SectionCard>
    <SectionCard title="Linked Invoice" description="Read-only Invoice evidence associated with the Renewal Payment.">{renewal.invoice ? <Grid><LinkFact name="Invoice" text={renewal.invoice.invoiceNumber} to={`/billing/invoices/${renewal.invoice.id}`} /><Fact name="Invoice ID" value={renewal.invoice.id} exact /><Fact name="Subtotal" value={formatPlatformRenewalAmount(renewal.invoice.subtotalMinor, renewal.invoice.currency)} /><Fact name="Tax" value={renewal.invoice.totalTaxMinor === null ? 'Not available' : formatPlatformRenewalAmount(renewal.invoice.totalTaxMinor, renewal.invoice.currency)} /><Fact name="Total" value={formatPlatformRenewalAmount(renewal.invoice.totalMinor, renewal.invoice.currency)} /><TimeFact name="Issued" value={renewal.invoice.issuedAt} /><TimeFact name="Service starts" value={renewal.invoice.servicePeriodStart} /><TimeFact name="Service ends" value={renewal.invoice.servicePeriodEnd} /></Grid> : <Empty>No linked Invoice available.</Empty>}</SectionCard>
    <SectionCard title="Application & Block Evidence" description="Bounded safe application evidence; no attempt history is inferred."><Grid><Fact name="Application attempts" value={String(renewal.applicationAttemptCount)} /><TimeFact name="Last attempt" value={renewal.lastApplicationAttemptAt} /><TimeFact name="Applied" value={renewal.appliedAt} /><TimeFact name="Blocked" value={renewal.blockedAt} /><Fact name="Block code" value={available(renewal.blockCode)} /><Fact name="Safe block message" value={available(renewal.safeBlockMessage)} /></Grid></SectionCard>
    <SectionCard title="Preparation & Audit Evidence" description="Safe preparation identity and record timestamps."><Grid><Fact name="Prepared by" value={renewal.preparedBy ? `${renewal.preparedBy.firstName} ${renewal.preparedBy.lastName}`.trim() || renewal.preparedBy.email : 'Not available'} /><Fact name="Prepared-by email" value={renewal.preparedBy?.email ?? 'Not available'} /><TimeFact name="Created" value={renewal.createdAt} /><TimeFact name="Updated" value={renewal.updatedAt} /></Grid></SectionCard>
  </Stack>;
}

function TaxEvidence({ renewal }: { renewal: PlatformRenewalDetails }) { const tax = renewal.tax; return <SectionCard title="GST / Tax Evidence" description="Persisted historical tax evidence; no tax is recalculated.">{!tax ? <Empty>No persisted tax evidence available.</Empty> : <Stack gap={1.5}><Grid><Fact name="Treatment" value={label(tax.treatment)} /><Fact name="Jurisdiction" value={tax.jurisdictionClassification ? label(tax.jurisdictionClassification) : 'Not available'} /><Fact name="Service classification" value={available(tax.serviceClassification)} /><Fact name="Place of supply" value={[tax.placeOfSupplyState, tax.placeOfSupplyStateCode].filter(Boolean).join(' / ') || 'Not available'} /><Fact name="Taxable subtotal" value={formatPlatformRenewalAmount(tax.taxableSubtotalMinor, tax.currency)} /><Fact name="Total tax" value={formatPlatformRenewalAmount(tax.totalTaxMinor, tax.currency)} /><Fact name="Gross total" value={formatPlatformRenewalAmount(tax.grossTotalMinor, tax.currency)} /><TimeFact name="Decision time" value={tax.decisionAt} /></Grid>{tax.components.length ? <Stack divider={<Divider flexItem />} gap={1}>{tax.components.map((component) => <Grid key={component.type}><Fact name="Component" value={component.type} /><Fact name="Rate (basis points)" value={String(component.rateBasisPoints)} /><Fact name="Taxable amount" value={formatPlatformRenewalAmount(component.taxableAmountMinor, component.currency)} /><Fact name="Tax amount" value={formatPlatformRenewalAmount(component.taxAmountMinor, component.currency)} /></Grid>)}</Stack> : <Empty>No tax components available.</Empty>}</Stack>}</SectionCard>; }
function DetailsError({ error, retry }: { error: unknown; retry: () => void }) { const status = axios.isAxiosError(error) ? error.response?.status : undefined; if (status === 404) return <Alert severity="warning">Renewal not found. <Button component={Link} color="inherit" to="/billing/renewals">Back to Renewals</Button></Alert>; if (status === 403) return <Alert severity="error">Access restricted. You do not have permission to view this Renewal.</Alert>; if (status === 400) return <Alert severity="warning">The Renewal reference is invalid. <Button component={Link} color="inherit" to="/billing/renewals">Back to Renewals</Button></Alert>; return <Alert severity="error" action={<Button color="inherit" onClick={retry}>Retry loading</Button>}>Renewal details could not be loaded. Check connectivity and try again.</Alert>; }
function recoveryError(error: unknown) { if (axios.isAxiosError(error)) { const code = error.response?.data?.code; if (code === 'PAYMENT_NOT_CAPTURED') return 'The Renewal Payment is not captured yet. No Renewal period was applied.'; if (error.response?.status === 404) return 'The Renewal was not found. Return to the register and refresh.'; if (error.response?.status === 409) return 'Renewal recovery is blocked by the current durable state. Refresh the details before retrying.'; } return 'Renewal recovery failed. Check connectivity and refresh the current evidence.'; }
function Grid({ children }: { children: ReactNode }) { return <Box sx={grid}>{children}</Box>; }
function Fact({ name, value, exact = false }: { name: string; value: string; exact?: boolean }) { const content = <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>; return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography>{exact ? <Tooltip title={value}>{content}</Tooltip> : content}</Box>; }
function LinkFact({ name, text, to }: { name: string; text: string; to: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography><Typography component={Link} to={to} display="block" variant="body2" fontWeight={700} color="text.primary" sx={{ overflowWrap: 'anywhere' }}>{text}</Typography></Box>; }
function StatusFact({ name, value, tone = 'neutral' }: { name: string; value: string; tone?: StatusTone }) { return <Box><Typography variant="caption" color="text.secondary">{name}</Typography><div><StatusChip label={value} tone={tone} /></div></Box>; }
function TimeFact({ name, value }: { name: string; value: string | null }) { return <Fact name={name} value={value ? formatPlatformRenewalDate(value) : 'Not available'} exact={Boolean(value)} />; }
function Empty({ children }: { children: ReactNode }) { return <Typography variant="body2" color="text.secondary">{children}</Typography>; }
function available(value: string | null | undefined) { return value?.trim() || 'Not available'; }
function label(value: string) { return value.replaceAll('_', ' '); }
function renewalTone(status: RenewalStatus): StatusTone { return status === 'APPLIED' ? 'success' : status === 'BLOCKED' ? 'danger' : 'warning'; }
function paymentTone(status: RenewalPaymentStatus): StatusTone { return status === 'CAPTURED' ? 'success' : status === 'FAILED' ? 'danger' : status === 'AUTHORIZED' ? 'info' : 'warning'; }
const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 } as const;
const hidden = { position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
