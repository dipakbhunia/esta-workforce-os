import { Grid } from '@mui/material';
import {
  Building2,
  CalendarClock,
  CircleCheckBig,
  Clock3,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import type { PlatformDashboardResponse } from '../platform-dashboard.types';

const numberFormatter = new Intl.NumberFormat('en-IN');

export function formatPlatformMetric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? numberFormatter.format(value)
    : '—';
}

export function PlatformKpiGrid({ kpis }: { kpis: PlatformDashboardResponse['kpis'] }) {
  const cards = [
    { label: 'Total Companies', value: kpis.totalCompanies, helper: 'Current platform total', icon: Building2, tone: '#2563EB' },
    { label: 'Active Subscriptions', value: kpis.effectiveActiveSubscriptions, helper: 'Effective current access', icon: CircleCheckBig, tone: '#16A34A' },
    { label: 'Active Trials', value: kpis.effectiveActiveTrials, helper: 'Effective current trials', icon: TimerReset, tone: '#7C3AED' },
    { label: 'New Companies', value: kpis.newCompanies, helper: 'Within selected range', icon: TrendingUp, tone: '#2563EB' },
    { label: 'Trials Ending Soon', value: kpis.trialsEndingSoon, helper: 'Within the next 7 days', icon: CalendarClock, tone: '#F59E0B' },
    { label: 'Subscriptions Ending Soon', value: kpis.subscriptionsEndingSoon, helper: 'Within the next 30 days', icon: Clock3, tone: '#DC2626' },
  ] as const;

  return (
    <Grid container spacing={2} role="group" aria-label="Platform summary metrics">
      {cards.map((card) => (
        <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard {...card} value={formatPlatformMetric(card.value)} />
        </Grid>
      ))}
    </Grid>
  );
}
