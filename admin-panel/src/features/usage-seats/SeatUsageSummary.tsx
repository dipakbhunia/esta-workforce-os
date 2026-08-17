import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import type { CompanySeatSummary, SeatCapacityState } from './usage-seats.types';

export function SeatUsageSummary({
  value,
  title = 'Seat Usage',
  description = 'Current workforce-seat usage resolved from the authoritative commercial source.',
  showDetailsLink = true,
}: {
  value: CompanySeatSummary;
  title?: string;
  description?: string;
  showDetailsLink?: boolean;
}) {
  const { commercial, seats } = value;
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
      {seats.capacityState === 'OVER_LIMIT' ? <Alert severity="error">This company is {seats.overBy} seat{seats.overBy === 1 ? '' : 's'} over its current allowance. New seat allocation is blocked.</Alert> : null}
      {seats.capacityState === 'NO_ACCESS' ? <Alert severity="warning">No effective Trial or current Subscription provides a seat allowance. Existing Employees remain counted and intact.</Alert> : null}
      {commercial.commercialStatus === 'SUSPENDED' ? <Alert severity="warning">The current Subscription is suspended. Capacity remains visible, but new seat allocation is unavailable.</Alert> : null}
      <Box sx={grid}>
        <Fact label="Commercial source" value={commercialLabel} />
        <Fact label="Commercial status" value={commercial.commercialStatus ?? 'Not applicable'} />
        <Fact label="Used" value={String(seats.used)} />
        <Fact label="Capacity" value={commercial.capacity === null ? 'Unavailable' : String(commercial.capacity)} />
        <Fact label="Remaining" value={seats.remaining === null ? 'Unavailable' : String(seats.remaining)} />
        <Fact label="Over by" value={seats.overBy === null ? 'Unavailable' : String(seats.overBy)} />
        <Fact label="Utilization" value={seats.utilizationPercent === null ? 'Unavailable' : `${formatPercent(seats.utilizationPercent)}%`} />
        <Box minWidth={0}><Typography variant="caption" color="text.secondary">Capacity state</Typography><div><StatusChip label={capacityStateLabel(seats.capacityState)} tone={capacityTone(seats.capacityState)} /></div></Box>
      </Box>
      <Typography variant="caption" color="text.secondary">As of {new Date(value.asOf).toLocaleString()}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" gap={1}>
        {commercialPath ? <Button component={Link} to={commercialPath} variant="outlined">View current {commercial.source === 'TRIAL' ? 'Trial' : 'Subscription'}</Button> : null}
        {showDetailsLink ? <Button component={Link} to={`/saas/usage-seats/${value.company.id}`}>View seat details</Button> : null}
      </Stack>
    </Stack>
  </SectionCard>;
}

export function capacityStateLabel(state: SeatCapacityState) {
  return state.replaceAll('_', ' ');
}

export function capacityTone(state: SeatCapacityState): StatusTone {
  if (state === 'AVAILABLE') return 'success';
  if (state === 'AT_CAPACITY') return 'warning';
  if (state === 'OVER_LIMIT') return 'danger';
  return 'neutral';
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 };
