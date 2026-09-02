import { Card, CardContent, Grid, Skeleton, Stack } from '@mui/material';
import { EnterpriseChartSkeleton } from '@/components/enterprise/charts';

export function PlatformDashboardSkeleton() {
  return (
    <Stack gap={3} aria-label="Loading platform dashboard" aria-busy="true">
      <Grid container spacing={2}>
        {Array.from({ length: 6 }, (_, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card><CardContent><Stack gap={1}><Skeleton width="55%" /><Skeleton variant="rounded" width="40%" height={38} /><Skeleton width="70%" /></Stack></CardContent></Card>
          </Grid>
        ))}
      </Grid>
      <Card><CardContent><Stack gap={2}><Skeleton width={220} height={32} /><EnterpriseChartSkeleton height={280} /></Stack></CardContent></Card>
      <Grid container spacing={2}>
        {Array.from({ length: 3 }, (_, index) => (
          <Grid key={index} size={{ xs: 12, lg: 4 }}>
            <Card><CardContent><Stack gap={1.5}><Skeleton width="65%" height={30} /><Skeleton variant="rounded" height={180} /></Stack></CardContent></Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
