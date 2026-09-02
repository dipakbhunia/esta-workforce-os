import { Box, Grid, Typography } from '@mui/material';
import { EnterpriseBarChart, EnterpriseChartCard } from '@/components/enterprise/charts';
import type { PlatformDashboardResponse } from '../platform-dashboard.types';

const countFormatter = new Intl.NumberFormat('en-IN');

export function PlatformDistributions({
  subscriptions,
  plans,
  trials,
}: {
  subscriptions: PlatformDashboardResponse['subscriptionDistribution'];
  plans: PlatformDashboardResponse['planDistribution'];
  trials: PlatformDashboardResponse['trialDistribution'];
}) {
  const subscriptionRows = subscriptions.map((item) => ({ label: displayEnum(item.status), value: item.count }));
  const planRows = plans.map((item) => ({ label: item.planName, value: item.subscriptionCount }));
  const trialRows = trials.map((item) => ({ label: displayEnum(item.status), value: item.count }));

  return (
    <Grid container spacing={2} aria-label="Platform commercial distributions">
      <Grid size={{ xs: 12, lg: 4 }}>
        <DistributionCard
          title="Subscription Distribution"
          description="Subscription lifecycle counts returned by the platform service."
          rows={subscriptionRows}
          emptyMessage="No subscription distribution is available."
        />
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <DistributionCard
          title="Plan Distribution"
          description="Current subscriptions grouped by immutable plan snapshot."
          rows={planRows}
          emptyMessage="No plan distribution is available."
        />
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <DistributionCard
          title="Trial Distribution"
          description="Current trial lifecycle counts returned by the platform service."
          rows={trialRows}
          emptyMessage="No trial distribution is available."
        />
      </Grid>
    </Grid>
  );
}

function DistributionCard({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: Array<{ label: string; value: number }>;
  emptyMessage: string;
}) {
  return (
    <EnterpriseChartCard
      title={title}
      description={description}
      height={220}
      accessibleSummary={rows.length
        ? `${title}. ${rows.map((row) => `${row.label}: ${row.value}`).join('; ')}.`
        : `${title} has no rows.`}
    >
      {rows.length ? (
        <EnterpriseBarChart
          data={rows}
          categoryKey="label"
          valueKey="value"
          valueFormatter={(value) => countFormatter.format(value)}
          horizontal
          height={220}
        />
      ) : (
        <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
          <Typography color="text.secondary">{emptyMessage}</Typography>
        </Box>
      )}
    </EnterpriseChartCard>
  );
}

function displayEnum(value: string) {
  return value.toLowerCase().split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
