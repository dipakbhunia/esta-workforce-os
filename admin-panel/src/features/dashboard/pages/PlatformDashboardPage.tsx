import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Grid, LinearProgress, Stack } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EnterpriseDateRangePicker, formatDateOnly } from '@/components/enterprise/date-range';
import { PageHeader } from '@/components/page-header';
import { getPlatformDashboard } from '../platform-dashboard-api';
import { resolvePlatformDashboardRange, setPlatformDashboardRange } from '../platform-dashboard-range';
import { PlatformGrowthTrend } from '../components/PlatformGrowthTrend';
import { PlatformKpiGrid } from '../components/PlatformKpiGrid';
import { PlatformAttentionSection } from '../components/PlatformAttentionSection';
import { PlatformDistributions } from '../components/PlatformDistributions';
import { PlatformRecentCompanies } from '../components/PlatformRecentCompanies';
import { PlatformStorageOverview } from '../components/PlatformStorageOverview';
import { PlatformDashboardSkeleton } from '../components/PlatformDashboardSkeleton';

export default function PlatformDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const resolvedRange = useMemo(
    () => resolvePlatformDashboardRange(searchParams, today),
    [searchParams, today],
  );
  const { dateFrom: from, dateTo: to } = resolvedRange.value;

  useEffect(() => {
    if (resolvedRange.shouldNormalize) {
      setSearchParams(setPlatformDashboardRange(searchParams, resolvedRange.value), { replace: true });
    }
  }, [resolvedRange, searchParams, setSearchParams]);

  const dashboardQuery = useQuery({
    queryKey: ['platform-dashboard', { from, to }],
    queryFn: () => getPlatformDashboard({ from, to }),
    placeholderData: (previousData) => previousData,
  });

  return (
    <Stack gap={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'flex-end' }} gap={2}>
        <Box sx={{ flex: 1 }}>
          <PageHeader
            title="Platform Dashboard"
            description="Platform-wide administration overview."
            breadcrumbs={['Admin', 'Dashboard']}
          />
        </Box>
        <EnterpriseDateRangePicker
          value={resolvedRange.value}
          onChange={(value) => setSearchParams(setPlatformDashboardRange(searchParams, value))}
          defaultPreset="last30Days"
          maxDate={formatDateOnly(today)}
        />
      </Stack>
      {dashboardQuery.isLoading ? (
        <PlatformDashboardSkeleton />
      ) : dashboardQuery.isError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={() => void dashboardQuery.refetch()}>Retry</Button>}
        >
          Platform dashboard data could not be loaded. Check connectivity and try again.
        </Alert>
      ) : dashboardQuery.data?.data ? (
        <Stack gap={3}>
          {dashboardQuery.isFetching ? (
            <Box aria-live="polite">
              <LinearProgress aria-label="Updating platform dashboard data" />
            </Box>
          ) : null}
          <PlatformKpiGrid kpis={dashboardQuery.data.data.kpis} />
          <PlatformGrowthTrend
            growth={dashboardQuery.data.data.growth}
            granularity={dashboardQuery.data.data.range.granularity}
          />
          <PlatformDistributions
            subscriptions={dashboardQuery.data.data.subscriptionDistribution}
            plans={dashboardQuery.data.data.planDistribution}
            trials={dashboardQuery.data.data.trialDistribution}
          />
          <PlatformStorageOverview storage={dashboardQuery.data.data.storage} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, xl: 5 }}><PlatformAttentionSection attention={dashboardQuery.data.data.attention} /></Grid>
            <Grid size={{ xs: 12, xl: 7 }}><PlatformRecentCompanies companies={dashboardQuery.data.data.recentCompanies} /></Grid>
          </Grid>
        </Stack>
      ) : null}
    </Stack>
  );
}
