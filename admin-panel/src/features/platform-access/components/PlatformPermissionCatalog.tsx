import { Alert, Box, Button, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import type { PlatformPermission } from '../platform-access.types';

interface Props { permissions: PlatformPermission[]; loading: boolean; fetching: boolean; error: string | null; retained: boolean; onRetry: () => void }

export function PlatformPermissionCatalog({ permissions, loading, fetching, error, retained, onRetry }: Props) {
  return <Card><CardContent><Stack gap={2}><Box><Typography variant="h3">Permission Catalog</Typography><Typography color="text.secondary">Complete read-only permission metadata returned by the platform-access authority.</Typography></Box>
    {fetching && !loading ? <LinearProgress aria-label="Updating permission catalog" /> : null}
    {error ? <Alert severity={retained ? 'warning' : 'error'} action={<Button color="inherit" onClick={onRetry}>Retry</Button>}>{retained ? "We couldn't refresh permissions. Showing the most recent available catalog." : error}</Alert> : null}
    {loading ? <Box role="status" aria-label="Loading permission catalog"><LoadingSkeleton rows={4} /></Box> : !error || retained ? permissions.length ? <Box data-testid="permission-catalog" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>{permissions.map((permission) => <Box key={permission.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, minWidth: 0 }}><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{permission.key}</Typography><Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{permission.description ?? 'No description'}</Typography></Box>)}</Box> : <EmptyState title="No permission metadata available." description="The platform authority returned an empty permission catalog." /> : null}
  </Stack></CardContent></Card>;
}
