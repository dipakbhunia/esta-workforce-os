import { Box, Button, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';
import { validDunningDateRange } from '../platform-dunning-url';

export interface PlatformDunningFilterDraft {
  companyId: string;
  subscriptionId: string;
  renewalId: string;
  paymentId: string;
  paymentStatus: string;
  from: string;
  to: string;
}

interface Props {
  draft: PlatformDunningFilterDraft;
  filtered: boolean;
  fetching: boolean;
  summary: string;
  onChange: (value: PlatformDunningFilterDraft) => void;
  onApply: () => void;
  onClear: () => void;
  onRefresh: () => void;
}

export function PlatformDunningFilters({ draft, filtered, fetching, summary, onChange, onApply, onClear, onRefresh }: Props) {
  const valid = validDunningDateRange(draft.from, draft.to);
  const change = (key: keyof PlatformDunningFilterDraft, value: string) => onChange({ ...draft, [key]: value });
  return <EnterpriseFilterCard title="Dunning Filters" description="Draft changes are applied together to the open Dunning register." loading={fetching}
    search={<Stack gap={1.25}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
        <TextField size="small" label="Company ID" value={draft.companyId} onChange={event => change('companyId', event.target.value)} />
        <TextField size="small" label="Subscription ID" value={draft.subscriptionId} onChange={event => change('subscriptionId', event.target.value)} />
        <TextField size="small" label="Renewal ID" value={draft.renewalId} onChange={event => change('renewalId', event.target.value)} />
        <TextField size="small" label="Payment ID" value={draft.paymentId} onChange={event => change('paymentId', event.target.value)} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25, alignItems: 'start' }}>
        <FormControl size="small"><InputLabel id="dunning-payment-status-label">Payment Status</InputLabel><Select id="dunning-payment-status" labelId="dunning-payment-status-label" label="Payment Status" value={draft.paymentStatus} onChange={event => change('paymentStatus', event.target.value)}><MenuItem value="">All</MenuItem>{['PENDING', 'AUTHORIZED', 'FAILED'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
        <TextField size="small" type="datetime-local" label="Cycle Due From — inclusive" value={draft.from} onChange={event => change('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!valid && Boolean(draft.from)} />
        <TextField size="small" type="datetime-local" label="Cycle Due Before — exclusive" value={draft.to} onChange={event => change('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!valid && Boolean(draft.to)} helperText={!valid ? 'Enter both dates and ensure Due From is earlier than Due Before.' : undefined} />
      </Box>
      <Divider />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">{summary}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap" sx={{ '& .MuiButton-root': { minHeight: 40, whiteSpace: 'nowrap' } }}>
          <Button startIcon={<RotateCcw size={17} />} onClick={onClear} disabled={!filtered && Object.values(draft).every(value => value === '')}>Reset</Button>
          <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button>
          <Button variant="contained" onClick={onApply} disabled={!valid}>Apply</Button>
        </Stack>
      </Stack>
    </Stack>} />;
}
