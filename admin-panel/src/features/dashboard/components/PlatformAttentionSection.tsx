import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { formatBytes } from '@/features/storage-usage/storage-usage-utils';
import type { PlatformDashboardResponse, PlatformAttentionSeverity } from '../platform-dashboard.types';

export function PlatformAttentionSection({ attention }: { attention: PlatformDashboardResponse['attention'] }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack gap={2}>
          <Box>
            <Typography component="h2" variant="h4">Attention Required</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>Backend-prioritized platform conditions requiring review.</Typography>
          </Box>
          {attention.length ? attention.map((item) => (
            <Stack key={item.id} gap={0.75} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                <Box minWidth={0}><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{item.companyName}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{displayEnum(item.type)}</Typography></Box>
                <StatusChip label={displayEnum(item.severity)} tone={severityTone(item.severity)} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {displayEnum(item.resourceType)}{item.relevantAt ? ` · ${formatDateTime(item.relevantAt)}` : ''}{item.metricValue && item.metricUnit === 'BYTES' ? ` · ${formatBytes(item.metricValue)}` : ''}
              </Typography>
            </Stack>
          )) : <Typography color="text.secondary">No platform attention items are present.</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

function severityTone(severity: PlatformAttentionSeverity): StatusTone {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}

function displayEnum(value: string) {
  return value.toLowerCase().split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN');
}
