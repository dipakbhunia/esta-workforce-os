import { Alert, Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import type { CompanyStorageSummary } from './storage-usage.types';
import { exactBytes, formatBytes, formatStorageDate, formatUtilization, storageCapacityLabel, storageCapacityTone } from './storage-usage-utils';

export function StorageUsageSummary({
  value,
  title = 'Storage Usage',
  description = 'Current screenshot storage from finalized metadata and the authoritative commercial snapshot.',
  showDetailsLink = true,
}: {
  value: CompanyStorageSummary;
  title?: string;
  description?: string;
  showDetailsLink?: boolean;
}) {
  const { commercial, storage } = value;
  const commercialLabel = commercial.source === 'TRIAL'
    ? 'Trial'
    : commercial.source === 'SUBSCRIPTION'
      ? commercial.plan ? `${commercial.plan.name} (${commercial.plan.code})` : 'Subscription'
      : 'No commercial access';
  const commercialPath = commercial.referenceId
    ? commercial.source === 'TRIAL'
      ? `/saas/trials/${commercial.referenceId}`
      : `/saas/subscriptions/${commercial.referenceId}`
    : null;

  return <SectionCard title={title} description={description}>
    <Stack gap={2}>
      {storage.measurementState === 'UNMEASURABLE' ? <Alert severity="warning">Measurement incomplete: {storage.unmeasuredObjectCount} active screenshot object{storage.unmeasuredObjectCount === 1 ? '' : 's'} lack size metadata. Measured storage includes known bytes only.</Alert> : null}
      {storage.capacityState === 'OVER_LIMIT' ? <Alert severity="error">Measured screenshot storage is {formatBytes(storage.overByBytes)} over the configured snapshot limit. Reporting is informational and does not block uploads.</Alert> : null}
      {storage.capacityState === 'UNCONFIGURED' ? <Alert severity="warning">Commercial access exists, but no storage limit is configured in its immutable snapshot.</Alert> : null}
      {storage.capacityState === 'NO_ACCESS' ? <Alert severity="info">No effective Trial or current Subscription provides commercial access. Existing measured screenshot storage remains visible.</Alert> : null}
      {commercial.commercialStatus === 'SUSPENDED' ? <Alert severity="warning">The current Subscription is suspended. Storage and snapshot capacity remain visible for reporting.</Alert> : null}
      <Box sx={grid}>
        <Fact label="Commercial source" value={commercialLabel} />
        <Fact label="Commercial status" value={commercial.commercialStatus ?? 'Not applicable'} />
        <ByteFact label={storage.measurementState === 'UNMEASURABLE' ? 'Measured storage (known bytes)' : 'Measured storage'} value={storage.measuredStorageBytes} />
        <ByteFact label="Configured limit" value={storage.configuredLimitBytes} fallback={commercial.source === 'NONE' ? 'N/A' : 'Not configured'} />
        <ByteFact label="Remaining" value={storage.remainingBytes} />
        <ByteFact label="Over by" value={storage.overByBytes} />
        <Fact label="Utilization" value={formatUtilization(storage.utilizationPercent)} />
        <Fact label="Measurement" value={storage.measurementState === 'MEASURED' ? 'Complete' : 'Incomplete'} />
        <Box minWidth={0}><Typography variant="caption" color="text.secondary">Capacity state</Typography><div><StatusChip label={storageCapacityLabel(storage.capacityState)} tone={storageCapacityTone(storage.capacityState)} /></div></Box>
        <Fact label="Measured objects" value={String(storage.measuredObjectCount)} />
        <Fact label="Unmeasured objects" value={String(storage.unmeasuredObjectCount)} />
        <Fact label="Allocation allowed" value={storage.allocationAllowed ? 'Yes (informational)' : 'No (informational)'} />
      </Box>
      <Typography variant="caption" color="text.secondary">Calculated {formatStorageDate(storage.calculatedAt)}. Based on finalized screenshot metadata; no request-time MinIO reconciliation is performed.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" gap={1}>
        {commercialPath ? <Button component={Link} to={commercialPath} variant="outlined">View current {commercial.source === 'TRIAL' ? 'Trial' : 'Subscription'}</Button> : null}
        {showDetailsLink ? <Button component={Link} to={`/saas/storage/${value.company.id}`}>View storage details</Button> : null}
      </Stack>
    </Stack>
  </SectionCard>;
}

function ByteFact({ label, value, fallback = 'N/A' }: { label: string; value: string | null; fallback?: string }) {
  const formatted = value === null ? fallback : formatBytes(value);
  const exact = exactBytes(value);
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography>{exact ? <Tooltip title={exact}><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere', width: 'fit-content' }}>{formatted}</Typography></Tooltip> : <Typography fontWeight={800}>{formatted}</Typography>}</Box>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 };
