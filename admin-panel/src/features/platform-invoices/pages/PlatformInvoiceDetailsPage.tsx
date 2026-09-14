import { Alert, Box, Button, Card, CardContent, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { getPlatformInvoice, platformInvoiceKeys } from '../platform-invoices-api';
import { formatPlatformInvoiceAmount, formatPlatformInvoiceDate } from '../platform-invoices-format';
import type { PlatformInvoiceDetails, PlatformInvoiceLine, PlatformInvoicePartySnapshot } from '../platform-invoices.types';

export default function PlatformInvoiceDetailsPage() {
  const { invoiceId = '' } = useParams();
  const query = useQuery({ queryKey: platformInvoiceKeys.details(invoiceId), queryFn: () => getPlatformInvoice(invoiceId), enabled: Boolean(invoiceId) });
  const invoice = query.data?.data;
  const hasRetainedData = invoice !== undefined;
  return <PageLayout>
    <PageHeader title="Invoice Details" description="Read-only immutable issued Invoice evidence." breadcrumbs={['Admin', 'Billing', 'Invoices', 'Details']} />
    <Button component={Link} to="/billing/invoices" variant="outlined" sx={{ alignSelf: 'flex-start' }}>Back to Invoices</Button>
    {!invoiceId ? <Alert severity="warning">The Invoice reference is missing.</Alert> : null}
    {query.isLoading ? <><Box role="status" sx={visuallyHidden}>Loading Invoice details</Box><LoadingSkeleton rows={10} /></> : null}
    {query.isFetching && !query.isLoading ? <Box aria-live="polite"><LinearProgress aria-label="Updating Invoice details" /></Box> : null}
    {query.isRefetchError && hasRetainedData ? <Alert severity="warning" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>We couldn't refresh the Invoice details. Showing the most recent available evidence.</Alert> : null}
    {query.isError && !hasRetainedData ? <DetailsError error={query.error} retry={() => void query.refetch()} /> : null}
    {invoice ? <InvoiceDetails invoice={invoice} /> : null}
  </PageLayout>;
}

function InvoiceDetails({ invoice }: { invoice: PlatformInvoiceDetails }) {
  return <Stack gap={2}>
    <SectionCard title="Summary" description="Persisted Invoice identity and totals."><DetailGrid>
      <Fact name="Invoice Number" value={invoice.invoiceNumber} exact /><Fact name="Invoice ID" value={invoice.id} exact /><Fact name="Company ID" value={invoice.companyId} exact /><Fact name="Subscription ID" value={invoice.subscriptionId} exact /><Fact name="Source Payment ID" value={invoice.sourcePaymentId} exact />
      <Fact name="Issued At" value={formatPlatformInvoiceDate(invoice.issuedAt)} /><Fact name="Due At" value={formatPlatformInvoiceDate(invoice.dueAt)} /><Fact name="Currency" value={invoice.currency} /><Fact name="Subtotal" value={formatPlatformInvoiceAmount(invoice.subtotalMinor, invoice.currency)} /><Fact name="Total" value={formatPlatformInvoiceAmount(invoice.totalMinor, invoice.currency)} />
    </DetailGrid></SectionCard>
    <SectionCard title="Seller" description="Immutable seller snapshot captured when this Invoice was issued."><Party party={invoice.seller} identity={<><Fact name="Legal Name" value={invoice.seller.legalName} /><Fact name="State Code" value={available(invoice.seller.stateCode)} /></>} /></SectionCard>
    <SectionCard title="Bill To" description="Immutable customer snapshot captured when this Invoice was issued."><Party party={invoice.billTo} identity={<><Fact name="Name" value={invoice.billTo.name} /><Fact name="Phone" value={available(invoice.billTo.phone)} /></>} /></SectionCard>
    <SectionCard title="Subscription / Plan" description="Subscription identity and persisted plan snapshots from the Invoice lines."><Stack gap={1.5}><Fact name="Subscription ID" value={invoice.subscriptionId} exact />{invoice.lines.map((line) => <Box component="article" key={line.id} sx={snapshotCard}><Typography variant="subtitle2">Line {line.lineSequence}</Typography><DetailGrid><Fact name="Plan ID" value={line.planId} exact /><Fact name="Plan Code Snapshot" value={line.planCodeSnapshot} /><Fact name="Plan Name Snapshot" value={line.planNameSnapshot} /></DetailGrid></Box>)}</Stack></SectionCard>
    <SectionCard title="Service Period" description="Service coverage uses a half-open interval: start inclusive, end exclusive."><DetailGrid><Fact name="Starts (inclusive)" value={formatPlatformInvoiceDate(invoice.servicePeriodStart)} /><Fact name="Ends (exclusive)" value={formatPlatformInvoiceDate(invoice.servicePeriodEnd)} /></DetailGrid></SectionCard>
    <SectionCard title="Lines" description="Persisted line evidence; displayed totals are not recalculated."><InvoiceLines lines={invoice.lines} /></SectionCard>
    <SectionCard title="Source Payment" description="Safe source Payment evidence returned with this Invoice."><DetailGrid><Fact name="Source Payment ID" value={invoice.sourcePaymentId} exact /><Fact name="Purpose" value={label(invoice.sourcePaymentPurpose)} /><Fact name="Captured At" value={formatPlatformInvoiceDate(invoice.sourceCapturedAt)} /></DetailGrid></SectionCard>
    <SectionCard title="Numbering" description="Immutable numbering snapshot used to issue this Invoice."><DetailGrid><Fact name="Prefix" value={invoice.numbering.prefix} /><Fact name="Reset Policy" value={label(invoice.numbering.resetPolicy)} /><Fact name="Reset Bucket" value={invoice.numbering.resetBucket} /><Fact name="Sequence" value={invoice.numbering.sequence} exact /></DetailGrid></SectionCard>
  </Stack>;
}

function Party({ party, identity }: { party: PlatformInvoicePartySnapshot; identity: ReactNode }) {
  return <DetailGrid>{identity}<Fact name="Billing Email" value={available(party.billingEmail)} /><Fact name="Address Line 1" value={available(party.addressLine1)} /><Fact name="Address Line 2" value={available(party.addressLine2)} /><Fact name="City" value={available(party.city)} /><Fact name="State" value={available(party.state)} /><Fact name="Postal Code" value={available(party.postalCode)} /><Fact name="Country" value={available(party.country)} /></DetailGrid>;
}

function InvoiceLines({ lines }: { lines: PlatformInvoiceLine[] }) {
  if (!lines.length) return <Typography color="text.secondary" variant="body2">No Invoice lines available.</Typography>;
  return <>
    <TableContainer sx={{ display: { xs: 'none', md: 'block' }, maxWidth: '100%' }}><Table size="small" aria-label="Invoice lines"><TableHead><TableRow><TableCell>Line</TableCell><TableCell>Description</TableCell><TableCell>Plan Snapshot</TableCell><TableCell align="right">Quantity</TableCell><TableCell align="right">Unit Amount</TableCell><TableCell align="right">Subtotal</TableCell></TableRow></TableHead><TableBody>{lines.map((line) => <TableRow key={line.id}><TableCell>{line.lineSequence}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{line.description}</TableCell><TableCell><Exact value={`${line.planNameSnapshot} (${line.planCodeSnapshot})`} /><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{line.planId}</Typography></TableCell><TableCell align="right">{line.quantity}</TableCell><TableCell align="right">{formatPlatformInvoiceAmount(line.unitAmountMinor, line.currency)}</TableCell><TableCell align="right">{formatPlatformInvoiceAmount(line.subtotalMinor, line.currency)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <Stack sx={{ display: { xs: 'flex', md: 'none' } }} gap={1.5}>{lines.map((line) => <Card variant="outlined" key={line.id}><CardContent><Stack gap={1}><Typography variant="subtitle2">Line {line.lineSequence}: {line.description}</Typography><DetailGrid><Fact name="Plan ID" value={line.planId} exact /><Fact name="Plan" value={`${line.planNameSnapshot} (${line.planCodeSnapshot})`} /><Fact name="Quantity" value={String(line.quantity)} /><Fact name="Unit Amount" value={formatPlatformInvoiceAmount(line.unitAmountMinor, line.currency)} /><Fact name="Subtotal" value={formatPlatformInvoiceAmount(line.subtotalMinor, line.currency)} /></DetailGrid></Stack></CardContent></Card>)}</Stack>
  </>;
}

function DetailGrid({ children }: { children: ReactNode }) { return <Box sx={detailGrid}>{children}</Box>; }
function Fact({ name, value, exact = false }: { name: string; value: string; exact?: boolean }) {
  const content = <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>;
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography>{exact ? <Tooltip title={value}>{content}</Tooltip> : content}</Box>;
}
function Exact({ value }: { value: string }) { return <Tooltip title={value}><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Tooltip>; }
function DetailsError({ error, retry }: { error: unknown; retry: () => void }) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 404) return <Alert severity="warning">Invoice not found. <Button component={Link} color="inherit" to="/billing/invoices">Back to Invoices</Button></Alert>;
  if (status === 403) return <Alert severity="error">Access restricted. You do not have permission to view this Invoice.</Alert>;
  if (status === 400) return <Alert severity="warning">The Invoice reference is invalid. <Button component={Link} color="inherit" to="/billing/invoices">Back to Invoices</Button></Alert>;
  return <Alert severity="error" action={<Button color="inherit" onClick={retry}>Retry loading</Button>}>Invoice details could not be loaded. Check connectivity and try again.</Alert>;
}
function available(value: string | null | undefined) { return value?.trim() || 'Not available'; }
function label(value: string) { return value.replaceAll('_', ' '); }
const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 } as const;
const snapshotCard = { p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 } as const;
const visuallyHidden = { position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
