import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { getPlatformRole, platformAccessKeys } from '../platform-access-api';
import { platformAccessError } from './platform-access-errors';

interface Props { open: boolean; roleId: string | null; onClose: () => void }

export function PlatformRoleDetailsDialog({ open, roleId, onClose }: Props) {
  const query = useQuery({ queryKey: platformAccessKeys.role(roleId ?? ''), queryFn: () => getPlatformRole(roleId!), enabled: open && Boolean(roleId) });
  const role = query.data?.data;
  return <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-describedby="platform-role-authority"><DialogTitle>Role Details</DialogTitle><DialogContent dividers sx={{ overflowX: 'hidden' }}>
    {query.isLoading ? <Box role="status" aria-label="Loading role details"><LoadingSkeleton rows={5} /></Box> : query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>{platformAccessError(query.error, 'The platform role could not be loaded.')}</Alert> : role ? <Stack gap={2.5}>
      <Alert severity="info" id="platform-role-authority">Read-only reference. These permission assignments are configuration metadata; runtime access remains enforced by the application's established authorization rules.</Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}><Fact label="Name" value={role.name} /><Fact label="Key" value={role.key} /><Fact label="System name" value={role.systemName ?? 'Custom'} /><Fact label="Assigned users" value={String(role._count.users)} /><Fact label="Created" value={formatDate(role.createdAt)} /><Fact label="Updated" value={formatDate(role.updatedAt)} /></Box>
      <Box><Typography variant="caption" color="text.secondary">Description</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{role.description ?? 'No description'}</Typography></Box><Divider />
      <Box><Typography variant="h4" sx={{ mb: 1 }}>Assigned Permissions ({role.permissions.length})</Typography>{role.permissions.length ? <Stack gap={1}>{role.permissions.map((assignment) => <Box key={assignment.permission.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{assignment.permission.key}</Typography><Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{assignment.permission.description ?? 'No description'}</Typography><Typography variant="caption" color="text.secondary">Assigned {formatDate(assignment.assignedAt)}</Typography></Box>)}</Stack> : <Typography color="text.secondary">No permission metadata is assigned to this role.</Typography>}</Box>
    </Stack> : null}
  </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions></Dialog>;
}

function Fact({ label, value }: { label: string; value: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Not available' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
