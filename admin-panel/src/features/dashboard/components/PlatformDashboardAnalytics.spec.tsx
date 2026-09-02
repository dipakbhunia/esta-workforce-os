import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlatformGrowthTrend, formatPlatformDateLabel } from './PlatformGrowthTrend';
import { PlatformKpiGrid, formatPlatformMetric } from './PlatformKpiGrid';

describe('Platform Dashboard KPI presentation', () => {
  it('renders the exact API KPI values with authoritative context', () => {
    render(<PlatformKpiGrid kpis={{
      totalCompanies: 1_234,
      effectiveActiveSubscriptions: 321,
      effectiveActiveTrials: 45,
      newCompanies: 12,
      trialsEndingSoon: 3,
      subscriptionsEndingSoon: 7,
    }} />);

    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('321')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Within selected range')).toBeInTheDocument();
    expect(screen.getByText('Within the next 7 days')).toBeInTheDocument();
    expect(screen.getByText('Within the next 30 days')).toBeInTheDocument();
    expect(screen.queryByText(/%|Infinity|NaN|null|undefined/)).not.toBeInTheDocument();
  });

  it('formats positive, negative, and zero values without invented percentages', () => {
    expect(formatPlatformMetric(8)).toBe('8');
    expect(formatPlatformMetric(-3)).toBe('-3');
    expect(formatPlatformMetric(0)).toBe('0');
  });

  it('renders authoritative zero KPI values rather than an empty or loading state', () => {
    render(<PlatformKpiGrid kpis={{
      totalCompanies: 0,
      effectiveActiveSubscriptions: 0,
      effectiveActiveTrials: 0,
      newCompanies: 0,
      trialsEndingSoon: 0,
      subscriptionsEndingSoon: 0,
    }} />);

    expect(within(screen.getByRole('group', { name: 'Platform summary metrics' })).getAllByText('0')).toHaveLength(6);
  });

  it('uses a neutral marker for non-computable values', () => {
    expect(formatPlatformMetric(null)).toBe('—');
    expect(formatPlatformMetric(undefined)).toBe('—');
    expect(formatPlatformMetric(Number.NaN)).toBe('—');
    expect(formatPlatformMetric(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('Platform Dashboard growth trend', () => {
  it('represents backend points and zero values without synthetic buckets', () => {
    render(<PlatformGrowthTrend granularity="DAILY" growth={[
      { bucketStart: '2026-08-01', newCompanies: 2, trialStarts: 0 },
      { bucketStart: '2026-08-02', newCompanies: 0, trialStarts: 3 },
    ]} />);

    expect(screen.getByLabelText('2026-08-01 — New Companies: 2')).toBeInTheDocument();
    expect(screen.getByLabelText('2026-08-01 — Trial Starts: 0')).toBeInTheDocument();
    expect(screen.getByLabelText('2026-08-02 — New Companies: 0')).toBeInTheDocument();
    expect(screen.getByLabelText('2026-08-02 — Trial Starts: 3')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('formats date-only labels without UTC calendar-day parsing', () => {
    expect(formatPlatformDateLabel('2026-08-01')).toBe('01 Aug');
    expect(formatPlatformDateLabel('2026-12-31')).toBe('31 Dec');
    expect(formatPlatformDateLabel('not-a-date')).toBe('not-a-date');
  });

  it('renders an empty state without fabricating trend points', () => {
    render(<PlatformGrowthTrend granularity="WEEKLY" growth={[]} />);

    expect(screen.getByText('No growth points are available for this range.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
