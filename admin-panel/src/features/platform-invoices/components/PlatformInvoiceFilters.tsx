import { Box, Button, Stack, TextField } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';
import { isValidPlatformInvoiceDateRange } from '../platform-invoices-url';

export interface PlatformInvoiceFilterDraft { companyId: string; subscriptionId: string; sourcePaymentId: string; invoiceNumber: string; from: string; to: string }
interface Props { draft: PlatformInvoiceFilterDraft; filtered: boolean; fetching: boolean; summary: string; onChange: (draft: PlatformInvoiceFilterDraft) => void; onApply: () => void; onClear: () => void; onRefresh: () => void }

export function PlatformInvoiceFilters({ draft, filtered, fetching, summary, onChange, onApply, onClear, onRefresh }: Props) {
  const valid = isValidPlatformInvoiceDateRange(draft.from, draft.to);
  const change = (key: keyof PlatformInvoiceFilterDraft, value: string) => onChange({ ...draft, [key]: value });
  return <EnterpriseFilterCard title="Invoice Filters" description="Draft changes are applied together to the Invoice register." loading={fetching} summary={summary} search={<Stack gap={1.25}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(190px, 1fr))' }, gap: 1 }}>
      <TextField size="small" label="Company ID" value={draft.companyId} onChange={(event) => change('companyId', event.target.value)} />
      <TextField size="small" label="Subscription ID" value={draft.subscriptionId} onChange={(event) => change('subscriptionId', event.target.value)} />
      <TextField size="small" label="Source Payment ID" value={draft.sourcePaymentId} onChange={(event) => change('sourcePaymentId', event.target.value)} />
      <TextField size="small" label="Invoice Number — exact match" value={draft.invoiceNumber} onChange={(event) => change('invoiceNumber', event.target.value)} />
      <TextField size="small" type="datetime-local" label="Issued from — inclusive" value={draft.from} onChange={(event) => change('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!valid && Boolean(draft.from)} />
      <TextField size="small" type="datetime-local" label="Issued before — exclusive" value={draft.to} onChange={(event) => change('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!valid && Boolean(draft.to)} helperText={!valid ? 'Enter both dates and ensure Issued from is earlier than Issued before.' : undefined} />
    </Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="flex-end">
      <Button variant="contained" onClick={onApply} disabled={!valid}>Apply</Button>
      <Button startIcon={<RotateCcw size={17} />} onClick={onClear} disabled={!filtered && Object.values(draft).every((value) => value === '')}>Clear</Button>
      <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button>
    </Stack>
  </Stack>} />;
}
