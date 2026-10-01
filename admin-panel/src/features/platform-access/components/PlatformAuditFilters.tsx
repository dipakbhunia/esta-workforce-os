import { Box, Button, Divider, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';

export interface PlatformAuditFilterDraft { action: string; entityType: string; actorUserId: string }
interface Props { draft: PlatformAuditFilterDraft; filtered: boolean; fetching: boolean; summary: string; onChange: (value: PlatformAuditFilterDraft) => void; onApply: () => void; onReset: () => void; onRefresh: () => void }

export function PlatformAuditFilters({ draft, filtered, fetching, summary, onChange, onApply, onReset, onRefresh }: Props) {
  return <EnterpriseFilterCard title="Audit Filters" description="Filters use exact platform audit values and apply together." loading={fetching} search={<Stack gap={1.25}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
      <TextField id="platform-audit-action" size="small" label="Action" value={draft.action} onChange={(event) => onChange({ ...draft, action: event.target.value })} placeholder="PLATFORM_USER_UPDATED" />
      <TextField id="platform-audit-entity-type" size="small" label="Entity Type" value={draft.entityType} onChange={(event) => onChange({ ...draft, entityType: event.target.value })} placeholder="User" />
      <TextField id="platform-audit-actor-user-id" size="small" label="Actor User ID" value={draft.actorUserId} onChange={(event) => onChange({ ...draft, actorUserId: event.target.value })} placeholder="UUID" />
    </Box>
    <Divider />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
      <Typography variant="body2" color="text.secondary">{summary}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button startIcon={<RotateCcw size={17} />} onClick={onReset} disabled={!filtered && !draft.action && !draft.entityType && !draft.actorUserId}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={onRefresh} disabled={fetching}>Refresh</Button><Button variant="contained" onClick={onApply}>Apply</Button></Stack>
    </Stack>
  </Stack>} />;
}
