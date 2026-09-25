import { Box, Button, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';
import { validRenewalDateRange } from '../platform-renewals-url';

export interface PlatformRenewalFilterDraft {
  companyId: string;
  subscriptionId: string;
  paymentId: string;
  status: string;
  billingInterval: string;
  from: string;
  to: string;
}

interface Props {
  draft: PlatformRenewalFilterDraft;
  filtered: boolean;
  fetching: boolean;
  summary: string;
  onChange: (value: PlatformRenewalFilterDraft) => void;
  onApply: () => void;
  onClear: () => void;
  onRefresh: () => void;
}

export function PlatformRenewalFilters({ draft, filtered, fetching, summary, onChange, onApply, onClear, onRefresh }: Props) {
  const valid = validRenewalDateRange(draft.from, draft.to);
  const change = (key: keyof PlatformRenewalFilterDraft, value: string) => onChange({ ...draft, [key]: value });

  return <EnterpriseFilterCard
    title="Renewal Filters"
    description="Draft changes are applied together to the Renewal register."
    loading={fetching}
    search={<Stack gap={1.25}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
        <TextField size="small" label="Company ID" value={draft.companyId} onChange={(event) => change('companyId', event.target.value)} />
        <TextField size="small" label="Subscription ID" value={draft.subscriptionId} onChange={(event) => change('subscriptionId', event.target.value)} />
        <TextField size="small" label="Payment ID" value={draft.paymentId} onChange={(event) => change('paymentId', event.target.value)} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1, alignItems: 'start' }}>
        <SelectField label="Renewal Status" value={draft.status} values={['PREPARED', 'APPLIED', 'BLOCKED']} change={(value) => change('status', value)} />
        <SelectField label="Billing Interval" value={draft.billingInterval} values={['MONTHLY', 'YEARLY', 'CUSTOM']} change={(value) => change('billingInterval', value)} />
        <TextField size="small" type="datetime-local" label="Created from — inclusive" value={draft.from} onChange={(event) => change('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!valid && Boolean(draft.from)} />
        <TextField size="small" type="datetime-local" label="Created before — exclusive" value={draft.to} onChange={(event) => change('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!valid && Boolean(draft.to)} helperText={!valid ? 'Enter both dates and ensure Created from is earlier than Created before.' : undefined} />
      </Box>
      <Divider />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">{summary}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap" sx={{ '& .MuiButton-root': { minHeight: 40, whiteSpace: 'nowrap' } }}>
          <Button startIcon={<RotateCcw size={17} />} onClick={onClear} disabled={!filtered && Object.values(draft).every((value) => value === '')}>Reset</Button>
          <Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button>
          <Button variant="contained" onClick={onApply} disabled={!valid}>Apply</Button>
        </Stack>
      </Stack>
    </Stack>}
  />;
}

function SelectField({ label, value, values, change }: { label: string; value: string; values: string[]; change: (value: string) => void }) {
  const id = `renewal-${label.toLowerCase().replaceAll(' ', '-')}`;
  return <FormControl size="small">
    <InputLabel id={`${id}-label`}>{label}</InputLabel>
    <Select id={id} labelId={`${id}-label`} label={label} value={value} onChange={(event) => change(event.target.value)}>
      <MenuItem value="">All</MenuItem>
      {values.map((item) => <MenuItem key={item} value={item}>{item.replaceAll('_', ' ')}</MenuItem>)}
    </Select>
  </FormControl>;
}
