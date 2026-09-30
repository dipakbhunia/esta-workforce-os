import { Box, Button, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';

export interface PlatformUserFilterDraft { search: string; status: string }
interface Props { draft: PlatformUserFilterDraft; filtered: boolean; fetching: boolean; summary: string; onChange: (value: PlatformUserFilterDraft) => void; onApply: () => void; onReset: () => void; onRefresh: () => void }

export function PlatformUserFilters({ draft, filtered, fetching, summary, onChange, onApply, onReset, onRefresh }: Props) {
  return <EnterpriseFilterCard title="Platform User Filters" description="Draft changes are applied together to the user register." loading={fetching} search={<Stack gap={1.25}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
      <TextField size="small" label="Search users" value={draft.search} onChange={(event) => onChange({ ...draft, search: event.target.value })} placeholder="Name or email" />
      <FormControl size="small"><InputLabel id="platform-user-status-label">Status</InputLabel><Select id="platform-user-status" labelId="platform-user-status-label" label="Status" value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value })}><MenuItem value="">All</MenuItem>{['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}</Select></FormControl>
    </Box>
    <Divider />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
      <Typography variant="body2" color="text.secondary">{summary}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button startIcon={<RotateCcw size={17} />} onClick={onReset} disabled={!filtered && !draft.search && !draft.status}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button><Button variant="contained" onClick={onApply}>Apply</Button></Stack>
    </Stack>
  </Stack>} />;
}
