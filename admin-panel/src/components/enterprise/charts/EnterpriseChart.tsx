import { Alert, Box, Button, Card, CardContent, LinearProgress, Skeleton, Stack, Typography, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';

export interface EnterpriseChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface EnterpriseChartCardProps {
  title: string;
  description?: string;
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  retry?: () => void;
  action?: ReactNode;
  accessibleSummary?: string;
  height?: number;
  children: ReactNode;
}

export function EnterpriseChartCard({ title, description, loading, error, empty, emptyMessage = 'No chart data available.', retry, action, accessibleSummary, height = 240, children }: EnterpriseChartCardProps) {
  return (
    <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 14px 38px rgba(15, 23, 42, 0.06)', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} gap={1.5} sx={{ mb: 2 }}>
          <Box minWidth={0}>
            <Typography component="h2" variant="h4">{title}</Typography>
            {description ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>{description}</Typography> : null}
          </Box>
          {action}
        </Stack>
        {accessibleSummary ? <Box component="p" sx={{ position: 'absolute', width: '1px', height: '1px', m: -1, p: 0, border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{accessibleSummary}</Box> : null}
        {loading ? <EnterpriseChartSkeleton height={height} /> : error ? <Alert severity="error" action={retry ? <Button color="inherit" size="small" onClick={retry}>Retry</Button> : undefined}>Chart data could not be loaded.</Alert> : empty ? <EnterpriseChartEmptyState message={emptyMessage} /> : children}
      </CardContent>
    </Card>
  );
}

export function EnterpriseBarChart<T extends Record<string, unknown>>({ data, categoryKey, valueKey, valueFormatter = String, colors, height = 220, horizontal = false }: { data: T[]; categoryKey: keyof T; valueKey: keyof T; valueFormatter?: (value: number) => string; colors?: string[]; height?: number; horizontal?: boolean }) {
  const theme = useTheme();
  const max = Math.max(...data.map((item) => Number(item[valueKey]) || 0), 0);
  const palette = colors ?? [theme.palette.primary.main, theme.palette.success.main, theme.palette.secondary.main, theme.palette.error.main];

  if (horizontal) {
    return (
      <Stack gap={1.4} sx={{ minHeight: height }} role="img" aria-label="Horizontal bar chart">
        {data.map((item, index) => {
          const value = Number(item[valueKey]) || 0;
          const percent = max > 0 ? Math.round((value / max) * 100) : 0;
          const label = String(item[categoryKey] ?? 'Item');
          return (
            <Box key={label}>
              <Stack direction="row" justifyContent="space-between" gap={2} sx={{ mb: 0.5 }}>
                <Typography variant="body2" fontWeight={800}>{label}</Typography>
                <Typography variant="body2" color="text.secondary">{valueFormatter(value)}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={percent} aria-label={`${label}: ${valueFormatter(value)}`} sx={{ height: 10, borderRadius: 999, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: palette[index % palette.length] } }} />
            </Box>
          );
        })}
      </Stack>
    );
  }

  return (
    <Stack direction="row" alignItems="flex-end" gap={{ xs: 1, md: 1.5 }} sx={{ height, px: { xs: 0.5, md: 1 }, pt: 1 }} role="img" aria-label="Bar chart">
      {data.map((item, index) => {
        const value = Number(item[valueKey]) || 0;
        const percent = max > 0 ? Math.max(8, (value / max) * 100) : 0;
        const label = String(item[categoryKey] ?? 'Item');
        return (
          <Stack key={label} alignItems="center" justifyContent="flex-end" gap={0.75} sx={{ flex: 1, minWidth: 0, height: '100%' }}>
            <Typography variant="caption" fontWeight={800}>{valueFormatter(value)}</Typography>
            <Box title={`${label}: ${valueFormatter(value)}`} aria-label={`${label}: ${valueFormatter(value)}`} sx={{ width: '100%', maxWidth: 72, height: `${percent}%`, minHeight: value > 0 ? 18 : 0, borderRadius: '10px 10px 4px 4px', bgcolor: palette[index % palette.length], boxShadow: value > 0 ? '0 10px 22px rgba(15, 23, 42, 0.12)' : 'none', transition: 'height 220ms ease' }} />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>{label}</Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

export function EnterpriseChartLegend({ items }: { items: Array<{ label: string; color: string; value?: ReactNode }> }) {
  return (
    <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Chart legend">
      {items.map((item) => <Stack key={item.label} direction="row" gap={0.75} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: 999, bgcolor: item.color }} /><Typography variant="caption" color="text.secondary">{item.label}{item.value !== undefined ? `: ${item.value}` : ''}</Typography></Stack>)}
    </Stack>
  );
}

export function EnterpriseChartSkeleton({ height = 220 }: { height?: number }) {
  return <Skeleton variant="rounded" height={height} sx={{ borderRadius: 3 }} />;
}

export function EnterpriseChartEmptyState({ message }: { message: string }) {
  return <EmptyState title={message} description="Create or adjust roster periods to populate this view." />;
}