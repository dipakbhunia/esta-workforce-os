import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { getPlatformAuditLog, platformAccessKeys } from '../platform-access-api';
import { platformAuditError } from './platform-access-errors';
import { actorName, formatAuditTime } from './PlatformAuditList';

interface Props { open: boolean; auditId: string | null; onClose: () => void }

export function PlatformAuditDetailsDialog({ open, auditId, onClose }: Props) {
  const query = useQuery({ queryKey: platformAccessKeys.audit(auditId ?? ''), queryFn: () => getPlatformAuditLog(auditId!), enabled: open && Boolean(auditId) }); const audit = query.data?.data;
  return <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-describedby={audit ? 'platform-audit-authority' : undefined}><DialogTitle>Audit Details</DialogTitle><DialogContent dividers sx={{ overflowX: 'hidden' }}>
    {query.isLoading ? <Box role="status" aria-label="Loading audit details"><LoadingSkeleton rows={6} /></Box> : query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>{platformAuditError(query.error, 'The platform audit record could not be loaded.')}</Alert> : audit ? <Stack gap={2.5}>
      <Alert severity="info" id="platform-audit-authority">Read-only platform audit evidence. This record cannot be edited or deleted here.</Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <Fact label="Audit ID" value={audit.id} /><Fact label="Timestamp" value={formatAuditTime(audit.createdAt)} /><Fact label="Action" value={audit.action} /><Fact label="Actor name" value={actorName(audit)} /><Fact label="Actor email" value={audit.actor?.email ?? 'Unavailable'} /><Fact label="Actor ID" value={audit.actor?.id ?? audit.actorUserId ?? 'Unavailable'} /><Fact label="Actor status" value={audit.actor?.status ?? 'Unavailable'} /><Fact label="Entity type" value={audit.entityType} /><Fact label="Entity ID" value={audit.entityId ?? 'Unavailable'} /><Fact label="IP address" value={audit.ipAddress ?? 'Unavailable'} /><Fact label="User agent" value={audit.userAgent ?? 'Unavailable'} />
      </Box>
    </Stack> : null}
  </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions></Dialog>;
}
function Fact({ label, value }: { label: string; value: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography></Box>; }
