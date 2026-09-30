import { Box, Button, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';

export interface PlatformRoleFilterDraft { search: string; systemName: string }
interface Props { draft: PlatformRoleFilterDraft; filtered: boolean; fetching: boolean; summary: string; onChange: (value: PlatformRoleFilterDraft) => void; onApply: () => void; onReset: () => void; onRefresh: () => void }

const systemNames = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as const;

export function PlatformRoleFilters({ draft, filtered, fetching, summary, onChange, onApply, onReset, onRefresh }: Props) {
  return <EnterpriseFilterCard title="Role Filters" description="Draft changes are applied together to the role register." loading={fetching} search={<Stack gap={1.25}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
      <TextField size="small" label="Search roles" value={draft.search} onChange={(event) => onChange({ ...draft, search: event.target.value })} placeholder="Role name or key" />
      <FormControl size="small"><InputLabel id="platform-role-system-name-label">System name</InputLabel><Select id="platform-role-system-name" labelId="platform-role-system-name-label" label="System name" value={draft.systemName} onChange={(event) => onChange({ ...draft, systemName: event.target.value })}><MenuItem value="">All</MenuItem>{systemNames.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}</Select></FormControl>
    </Box>
    <Divider />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
      <Typography variant="body2" color="text.secondary">{summary}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button startIcon={<RotateCcw size={17} />} onClick={onReset} disabled={!filtered && !draft.search && !draft.systemName}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button><Button variant="contained" onClick={onApply}>Apply</Button></Stack>
    </Stack>
  </Stack>} />;
}
