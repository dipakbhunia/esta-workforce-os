import { Box, Stack, Typography } from '@mui/material';
import { EnterpriseChartCard, EnterpriseChartLegend } from '@/components/enterprise/charts';
import type { PlatformDashboardResponse } from '../platform-dashboard.types';

const COMPANY_COLOR = '#2563EB';
const TRIAL_COLOR = '#7C3AED';
const numberFormatter = new Intl.NumberFormat('en-IN');

type GrowthPoint = PlatformDashboardResponse['growth'][number];

export function formatPlatformDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })
    .format(new Date(Number(year), Number(month) - 1, Number(day)));
}

export function PlatformGrowthTrend({
  growth,
  granularity,
}: {
  growth: PlatformDashboardResponse['growth'];
  granularity: PlatformDashboardResponse['range']['granularity'];
}) {
  const accessibleSummary = growth.length
    ? `Platform growth trend with ${growth.length} ${granularity.toLowerCase()} buckets. ${growth.map((point) => `${point.bucketStart}: ${point.newCompanies} new companies and ${point.trialStarts} trial starts`).join('; ')}.`
    : 'Platform growth trend has no points for the selected range.';

  return (
    <EnterpriseChartCard
      title="Platform Growth Trend"
      description={`New companies and trial starts by ${granularity.toLowerCase()} bucket.`}
      accessibleSummary={accessibleSummary}
      height={280}
    >
      {growth.length ? (
        <Stack gap={1.5}>
          <GrowthLineChart data={growth} />
          <EnterpriseChartLegend items={[
            { label: 'New Companies', color: COMPANY_COLOR },
            { label: 'Trial Starts', color: TRIAL_COLOR },
          ]} />
        </Stack>
      ) : (
        <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
          <Typography color="text.secondary">No growth points are available for this range.</Typography>
        </Box>
      )}
    </EnterpriseChartCard>
  );
}

function GrowthLineChart({ data }: { data: GrowthPoint[] }) {
  const width = 800;
  const height = 240;
  const padding = { top: 18, right: 20, bottom: 44, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.newCompanies, point.trialStarts]));
  const x = (index: number) => padding.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;
  const companyPoints = data.map((point, index) => `${x(index)},${y(point.newCompanies)}`).join(' ');
  const trialPoints = data.map((point, index) => `${x(index)},${y(point.trialStarts)}`).join(' ');
  const labelIndexes = visibleLabelIndexes(data.length);

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Box
        component="svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Line chart of new companies and trial starts"
        sx={{ display: 'block', width: '100%', minWidth: 520, height: 'auto' }}
      >
        {[0, 0.5, 1].map((ratio) => {
          const value = Math.round(maxValue * (1 - ratio));
          const lineY = padding.top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} stroke="#E2E8F0" strokeWidth="1" />
              <text x={padding.left - 8} y={lineY + 4} textAnchor="end" fill="#64748B" fontSize="11">{numberFormatter.format(value)}</text>
            </g>
          );
        })}
        <polyline points={companyPoints} fill="none" stroke={COMPANY_COLOR} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={trialPoints} fill="none" stroke={TRIAL_COLOR} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((point, index) => (
          <g key={point.bucketStart}>
            <circle
              cx={x(index)}
              cy={y(point.newCompanies)}
              r="4"
              fill={COMPANY_COLOR}
              aria-label={`${point.bucketStart} — New Companies: ${numberFormatter.format(point.newCompanies)}`}
            >
              <title>{`${point.bucketStart} — New Companies: ${numberFormatter.format(point.newCompanies)}`}</title>
            </circle>
            <circle
              cx={x(index)}
              cy={y(point.trialStarts)}
              r="4"
              fill={TRIAL_COLOR}
              aria-label={`${point.bucketStart} — Trial Starts: ${numberFormatter.format(point.trialStarts)}`}
            >
              <title>{`${point.bucketStart} — Trial Starts: ${numberFormatter.format(point.trialStarts)}`}</title>
            </circle>
            {labelIndexes.has(index) ? (
              <text x={x(index)} y={height - 16} textAnchor="middle" fill="#64748B" fontSize="11">
                {formatPlatformDateLabel(point.bucketStart)}
              </text>
            ) : null}
          </g>
        ))}
      </Box>
    </Box>
  );
}

function visibleLabelIndexes(length: number) {
  if (length <= 6) return new Set(Array.from({ length }, (_, index) => index));
  return new Set([0, Math.floor((length - 1) / 2), length - 1]);
}
