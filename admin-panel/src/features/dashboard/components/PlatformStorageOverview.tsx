import { Box, Card, CardContent, Grid, Stack, Tooltip, Typography } from '@mui/material';
import { StatusChip } from '@/components/status-chip';
import { exactBytes, formatBytes, formatUtilization, storageCapacityLabel, storageCapacityTone } from '@/features/storage-usage/storage-usage-utils';
import type { PlatformDashboardResponse } from '../platform-dashboard.types';

const countFormatter = new Intl.NumberFormat('en-IN');

export function PlatformStorageOverview({ storage }: { storage: PlatformDashboardResponse['storage'] }) {
  return (
    <Card>
      <CardContent>
        <Stack gap={2.5}>
          <Box>
            <Typography component="h2" variant="h4">Storage Overview</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
              Platform screenshot storage from finalized metadata and commercial allocation snapshots.
            </Typography>
          </Box>
          <Grid container spacing={2} aria-label="Platform storage summary">
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><ByteMetric label="Measured Storage" value={storage.measuredStorageBytes} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><ByteMetric label="Configured Allocation" value={storage.configuredAllocationBytes} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Measured Objects" value={countFormatter.format(storage.measuredObjectCount)} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Unmeasured Objects" value={countFormatter.format(storage.unmeasuredObjectCount)} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Configured Companies" value={countFormatter.format(storage.companiesWithConfiguredLimit)} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Without Configured Limit" value={countFormatter.format(storage.companiesWithoutConfiguredLimit)} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Companies at Limit" value={countFormatter.format(storage.companiesAtLimit)} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Metric label="Companies over Limit" value={countFormatter.format(storage.companiesOverLimit)} /></Grid>
          </Grid>
          <Box>
            <Typography component="h3" variant="h5" sx={{ mb: 1 }}>Capacity Distribution</Typography>
            {storage.capacityDistribution.length ? (
              <Stack direction="row" gap={1} flexWrap="wrap">
                {storage.capacityDistribution.map((item) => (
                  <StatusChip
                    key={item.state}
                    label={`${storageCapacityLabel(item.state)}: ${countFormatter.format(item.companyCount)}`}
                    tone={storageCapacityTone(item.state)}
                  />
                ))}
              </Stack>
            ) : <Typography color="text.secondary">No storage capacity distribution is available.</Typography>}
          </Box>
          <Box>
            <Typography component="h3" variant="h5" sx={{ mb: 1 }}>High Usage Companies</Typography>
            {storage.highUsageCompanies.length ? (
              <Stack gap={1}>
                {storage.highUsageCompanies.map((company) => (
                  <Stack key={company.companyId} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Box><Typography fontWeight={800}>{company.companyName}</Typography><StatusChip label={storageCapacityLabel(company.capacityState)} tone={storageCapacityTone(company.capacityState)} /></Box>
                    <Stack direction="row" gap={2} flexWrap="wrap">
                      <ByteMetric label="Measured" value={company.measuredStorageBytes} compact />
                      <ByteMetric label="Limit" value={company.configuredLimitBytes} compact />
                      <Metric label="Utilization" value={formatUtilization(company.utilizationPercent)} compact />
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            ) : <Typography color="text.secondary">No high-usage companies are present.</Typography>}
          </Box>
          <Typography variant="caption" color="text.secondary">Measurement coverage: {displayEnum(storage.measurementCoverage)}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ByteMetric({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <Box minWidth={compact ? 110 : 0}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Tooltip title={exactBytes(value)}>
        <Typography variant={compact ? 'body2' : 'h5'} fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{formatBytes(value)}</Typography>
      </Tooltip>
    </Box>
  );
}

function Metric({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return <Box minWidth={compact ? 100 : 0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant={compact ? 'body2' : 'h5'} fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

function displayEnum(value: string) {
  return value.toLowerCase().split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
