import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exactBytes, formatBytes } from '@/features/storage-usage/storage-usage-utils';
import { PlatformAttentionSection } from './PlatformAttentionSection';
import { PlatformDistributions } from './PlatformDistributions';
import { PlatformRecentCompanies } from './PlatformRecentCompanies';
import { PlatformStorageOverview } from './PlatformStorageOverview';

describe('Platform Dashboard distributions', () => {
  it('renders backend subscription, dynamic plan, and trial categories with counts', () => {
    render(<PlatformDistributions
      subscriptions={[{ status: 'ACTIVE', count: 4 }, { status: 'SUSPENDED', count: 0 }]}
      plans={[{ planId: 'custom-plan', planCode: 'ENTERPRISE_2027', planName: 'Enterprise 2027', subscriptionCount: 3 }]}
      trials={[{ status: 'EFFECTIVE_ACTIVE', count: 2 }, { status: 'CONVERTED', count: 1 }]}
    />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('Enterprise 2027')).toBeInTheDocument();
    expect(screen.getByText('Effective Active')).toBeInTheDocument();
    expect(screen.getByText('Converted')).toBeInTheDocument();
    expect(screen.getByLabelText('Active: 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Suspended: 0')).toBeInTheDocument();
    expect(screen.getByLabelText('Enterprise 2027: 3')).toBeInTheDocument();
  });

  it('renders safe empty states for all distribution sections', () => {
    render(<PlatformDistributions subscriptions={[]} plans={[]} trials={[]} />);

    expect(screen.getByText('No subscription distribution is available.')).toBeInTheDocument();
    expect(screen.getByText('No plan distribution is available.')).toBeInTheDocument();
    expect(screen.getByText('No trial distribution is available.')).toBeInTheDocument();
  });
});

describe('Platform Dashboard storage precision', () => {
  it('retains exact large decimal bytes and formats representative values with BigInt', () => {
    expect(formatBytes('9007199254740993000')).toBe('7.81 EiB');
    expect(exactBytes('9007199254740993000')).toBe('9,007,199,254,740,993,000 bytes');
    expect(formatBytes('1288490189')).toBe('1.2 GiB');
  });

  it('renders zero storage and backend storage fields safely', () => {
    render(<PlatformStorageOverview storage={{
      measurementCoverage: 'NO_OBJECTS',
      measuredStorageBytes: '0',
      configuredAllocationBytes: '0',
      measuredObjectCount: 0,
      unmeasuredObjectCount: 0,
      companiesWithConfiguredLimit: 0,
      companiesWithoutConfiguredLimit: 2,
      companiesAtLimit: 0,
      companiesOverLimit: 0,
      capacityDistribution: [],
      highUsageCompanies: [],
    }} />);

    expect(screen.getAllByText('0 B')).toHaveLength(2);
    expect(screen.getByText('No storage capacity distribution is available.')).toBeInTheDocument();
    expect(screen.getByText('No high-usage companies are present.')).toBeInTheDocument();
    expect(screen.getByText('Measurement coverage: No Objects')).toBeInTheDocument();
  });
});

describe('Platform Dashboard attention and companies', () => {
  it('renders backend attention context and precision-safe byte metrics', () => {
    render(<PlatformAttentionSection attention={[{
      id: 'attention-1',
      type: 'STORAGE_OVER_LIMIT',
      severity: 'CRITICAL',
      companyId: 'company-1',
      companyName: 'Acme',
      resourceType: 'STORAGE',
      resourceId: 'storage-1',
      relevantAt: null,
      metricValue: '9007199254740993000',
      metricUnit: 'BYTES',
    }]} />);

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Storage Over Limit')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText(/7\.81 EiB/)).toBeInTheDocument();
  });

  it('renders a safe empty attention state', () => {
    render(<PlatformAttentionSection attention={[]} />);
    expect(screen.getByText('No platform attention items are present.')).toBeInTheDocument();
  });

  it('preserves backend recent-company order and exposes no employee fields', () => {
    render(<PlatformRecentCompanies companies={[
      { id: 'company-2', name: 'Newest Co', status: 'TRIAL', createdAt: '2026-08-31T10:00:00.000Z', commercialState: 'TRIAL', commercialReferenceId: 'trial-2' },
      { id: 'company-1', name: 'Earlier Co', status: 'ACTIVE', createdAt: '2026-08-30T10:00:00.000Z', commercialState: 'ACTIVE_SUBSCRIPTION', commercialReferenceId: 'sub-1' },
    ]} />);

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Newest Co')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Earlier Co')).toBeInTheDocument();
    expect(screen.queryByText(/employee|email/i)).not.toBeInTheDocument();
  });

  it('renders a safe empty recent-company state', () => {
    render(<PlatformRecentCompanies companies={[]} />);
    expect(screen.getByText('No recent companies are available.')).toBeInTheDocument();
  });
});
