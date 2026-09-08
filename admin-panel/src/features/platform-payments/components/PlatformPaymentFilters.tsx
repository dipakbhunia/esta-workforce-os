import { Box, Button, Collapse, MenuItem, Stack, TextField } from '@mui/material';
import { ChevronDown, ChevronUp, RefreshCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';
import type { PaymentProviderMode, PaymentProviderType, PaymentPurpose, PaymentStatus } from '../platform-payments.types';
import { isValidPlatformPaymentDateRange } from '../platform-payments-url';

export interface PlatformPaymentFilterDraft {
  status: PaymentStatus | '';
  companyId: string;
  provider: PaymentProviderType | '';
  mode: PaymentProviderMode | '';
  purpose: PaymentPurpose | '';
  subscriptionId: string;
  from: string;
  to: string;
}

interface Props {
  draft: PlatformPaymentFilterDraft;
  filtered: boolean;
  fetching: boolean;
  summary: string;
  onChange: (draft: PlatformPaymentFilterDraft) => void;
  onApply: () => void;
  onClear: () => void;
  onRefresh: () => void;
}

export function PlatformPaymentFilters({ draft, filtered, fetching, summary, onChange, onApply, onClear, onRefresh }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const rangeValid = isValidPlatformPaymentDateRange(draft.from, draft.to);
  const change = <K extends keyof PlatformPaymentFilterDraft>(key: K, value: PlatformPaymentFilterDraft[K]) => onChange({ ...draft, [key]: value });

  return <EnterpriseFilterCard title="Payment Filters" description="Draft changes are applied together to the read-only payment register." loading={fetching} summary={summary} search={<Stack gap={1.25}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(160px, .7fr) repeat(2, minmax(220px, 1fr)) auto auto auto' }, gap: 1, alignItems: 'start' }}>
      <Select label="Payment Status" value={draft.status} values={['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED']} onChange={(value) => change('status', value as PaymentStatus | '')} />
      <TextField size="small" type="datetime-local" label="Created from — inclusive" value={draft.from} onChange={(event) => change('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!rangeValid && Boolean(draft.from)} />
      <TextField size="small" type="datetime-local" label="Created before — exclusive" value={draft.to} onChange={(event) => change('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!rangeValid && Boolean(draft.to)} helperText={!rangeValid ? 'Enter both dates and ensure Created from is earlier than Created before.' : undefined} />
      <Button variant="contained" onClick={onApply} disabled={!rangeValid}>Apply</Button>
      <Button startIcon={<RotateCcw size={17} />} onClick={onClear} disabled={!filtered && isBlank(draft)}>Clear</Button>
      <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button>
    </Box>
    <Button sx={{ alignSelf: 'flex-start' }} endIcon={advanced ? <ChevronUp size={17} /> : <ChevronDown size={17} />} onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>Advanced filters</Button>
    <Collapse in={advanced} unmountOnExit>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(150px, 1fr))' }, gap: 1 }}>
        <TextField size="small" label="Company ID" value={draft.companyId} onChange={(event) => change('companyId', event.target.value)} />
        <Select label="Provider" value={draft.provider} values={['RAZORPAY']} onChange={(value) => change('provider', value as PaymentProviderType | '')} />
        <Select label="Mode" value={draft.mode} values={['TEST', 'LIVE']} onChange={(value) => change('mode', value as PaymentProviderMode | '')} />
        <Select label="Purpose" value={draft.purpose} values={['SUBSCRIPTION_ACTIVATION']} onChange={(value) => change('purpose', value as PaymentPurpose | '')} />
        <TextField size="small" label="Subscription ID" value={draft.subscriptionId} onChange={(event) => change('subscriptionId', event.target.value)} />
      </Box>
    </Collapse>
  </Stack>} />;
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <TextField select size="small" label={label} value={value} onChange={(event) => onChange(event.target.value)}><MenuItem value="">All</MenuItem>{values.map((item) => <MenuItem key={item} value={item}>{item.replaceAll('_', ' ')}</MenuItem>)}</TextField>;
}

function isBlank(draft: PlatformPaymentFilterDraft) {
  return Object.values(draft).every((value) => value === '');
}
