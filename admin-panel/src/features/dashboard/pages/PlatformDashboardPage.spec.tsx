import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDateRangeValue } from '@/components/enterprise/date-range';
import type { PlatformDashboardResponse } from '../platform-dashboard.types';

const { getPlatformDashboard } = vi.hoisted(() => ({ getPlatformDashboard: vi.fn() }));

vi.mock('../platform-dashboard-api', () => ({ getPlatformDashboard }));

import PlatformDashboardPage from './PlatformDashboardPage';

const response = {
  range: { from: '2026-08-01', to: '2026-08-31', timezone: 'UTC', granularity: 'DAILY' },
  kpis: {
    totalCompanies: 8,
    effectiveActiveSubscriptions: 4,
    effectiveActiveTrials: 3,
    newCompanies: 2,
    trialsEndingSoon: 1,
    subscriptionsEndingSoon: 2,
  },
  growth: [{ bucketStart: '2026-08-01', newCompanies: 2, trialStarts: 1 }],
  subscriptionDistribution: [{ status: 'ACTIVE', count: 4 }],
  planDistribution: [{ planId: 'plan-1', planCode: 'STARTER', planName: 'Starter', subscriptionCount: 4 }],
  trialDistribution: [{ status: 'EFFECTIVE_ACTIVE', count: 3 }],
  storage: {
    measurementCoverage: 'COMPLETE',
    measuredStorageBytes: '9007199254740993000',
    configuredAllocationBytes: '9007199254740999000',
    measuredObjectCount: 2,
    unmeasuredObjectCount: 0,
    companiesWithConfiguredLimit: 1,
    companiesWithoutConfiguredLimit: 0,
    companiesAtLimit: 0,
    companiesOverLimit: 1,
    capacityDistribution: [{ state: 'OVER_LIMIT', companyCount: 1 }],
    highUsageCompanies: [],
  },
  attention: [],
  recentCompanies: [],
} as unknown as PlatformDashboardResponse;

describe('PlatformDashboardPage date range state', () => {
  beforeEach(() => {
    getPlatformDashboard.mockReset();
    getPlatformDashboard.mockResolvedValue({ data: response });
  });

  it('hydrates a valid URL pair and fetches the exact range', async () => {
    const { router } = renderPage('/?from=2026-08-01&to=2026-08-31');

    await waitFor(() => expect(getPlatformDashboard).toHaveBeenCalledWith({
      from: '2026-08-01',
      to: '2026-08-31',
    }));
    expect(screen.getByRole('button', { name: /Date Range: 2026-08-01/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?from=2026-08-01&to=2026-08-31');
    expect(getPlatformDashboard).toHaveBeenCalledTimes(1);
  });

  it('renders a coherent initial skeleton without fabricated dashboard values', () => {
    getPlatformDashboard.mockReturnValue(new Promise(() => undefined));

    renderPage('/?from=2026-08-01&to=2026-08-31');

    expect(screen.getByRole('heading', { name: 'Platform Dashboard' })).toBeInTheDocument();
    expect(screen.getByLabelText('Loading platform dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Total Companies')).not.toBeInTheDocument();
  });

  it('shows a safe full-page error and retries the same applied range', async () => {
    getPlatformDashboard
      .mockRejectedValueOnce(new Error('provider detail that must not be exposed'))
      .mockResolvedValueOnce({ data: response });

    renderPage('/?from=2026-08-01&to=2026-08-31');

    expect(await screen.findByText('Platform dashboard data could not be loaded. Check connectivity and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/provider detail/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Total Companies')).toBeInTheDocument();
    expect(getPlatformDashboard).toHaveBeenCalledTimes(2);
    expect(getPlatformDashboard).toHaveBeenNthCalledWith(1, { from: '2026-08-01', to: '2026-08-31' });
    expect(getPlatformDashboard).toHaveBeenNthCalledWith(2, { from: '2026-08-01', to: '2026-08-31' });
  });

  it('keeps prior data visible with a restrained indicator during an applied-range refresh', async () => {
    const expected = createDateRangeValue('last7Days');
    const deferred = createDeferred<{ data: PlatformDashboardResponse }>();
    const refreshedResponse = {
      ...response,
      range: { ...response.range, from: expected.dateFrom, to: expected.dateTo },
      kpis: { ...response.kpis, totalCompanies: 12 },
    };
    getPlatformDashboard.mockImplementation(({ from }: { from: string }) => (
      from === expected.dateFrom ? deferred.promise : Promise.resolve({ data: response })
    ));
    renderPage('/?from=2026-08-01&to=2026-08-31');
    await screen.findByText('Total Companies');

    fireEvent.click(screen.getByRole('button', { name: /Date Range:/ }));
    fireEvent.click(screen.getByText('Last 7 Days'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByLabelText('Updating platform dashboard data')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Platform summary metrics' })).getByText('8')).toBeInTheDocument();

    await act(async () => deferred.resolve({ data: refreshedResponse }));

    await waitFor(() => expect(screen.queryByLabelText('Updating platform dashboard data')).not.toBeInTheDocument());
    expect(within(screen.getByRole('group', { name: 'Platform summary metrics' })).getByText('12')).toBeInTheDocument();
  }, 15_000);

  it('normalizes a partial pair before fetching and preserves unrelated parameters', async () => {
    const expected = createDateRangeValue('last30Days');
    const { router } = renderPage('/?from=2026-08-01&tab=health');

    await waitFor(() => expect(router.state.location.search).toContain(`from=${expected.dateFrom}`));
    expect(router.state.location.search).toContain(`to=${expected.dateTo}`);
    expect(router.state.location.search).toContain('tab=health');
    expect(getPlatformDashboard).toHaveBeenCalledWith({
      from: expected.dateFrom,
      to: expected.dateTo,
    });
    expect(getPlatformDashboard.mock.calls.some(([params]) => !params.from || !params.to)).toBe(false);
  });

  it('keeps preset changes draft-only and Cancel leaves URL and requests unchanged', async () => {
    const { router } = renderPage('/?from=2026-08-01&to=2026-08-31');
    await screen.findByText('Total Companies');
    getPlatformDashboard.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Date Range:/ }));
    fireEvent.click(screen.getByText('Last 7 Days'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(router.state.location.search).toBe('?from=2026-08-01&to=2026-08-31');
    expect(getPlatformDashboard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Date Range: 2026-08-01/ })).toBeInTheDocument();
  }, 15_000);

  it('applies a draft range, refetches, and follows Back/Forward URL state', async () => {
    const expected = createDateRangeValue('last7Days');
    const appliedResponse = {
      ...response,
      range: { ...response.range, from: expected.dateFrom, to: expected.dateTo },
      kpis: { ...response.kpis, totalCompanies: 12 },
      growth: [{ bucketStart: expected.dateFrom, newCompanies: 4, trialStarts: 2 }],
      planDistribution: [{ planId: 'plan-2', planCode: 'GROWTH', planName: 'Growth', subscriptionCount: 6 }],
    };
    getPlatformDashboard.mockImplementation(({ from }: { from: string }) => Promise.resolve({
      data: from === expected.dateFrom ? appliedResponse : response,
    }));
    const { router, client } = renderPage('/?from=2026-08-01&to=2026-08-31&tab=health');
    await screen.findByText('Total Companies');
    expect(screen.getByText('8')).toBeInTheDocument();
    getPlatformDashboard.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Date Range:/ }));
    fireEvent.click(screen.getByText('Last 7 Days'));
    expect(getPlatformDashboard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(getPlatformDashboard).toHaveBeenCalledWith({
      from: expected.dateFrom,
      to: expected.dateTo,
    }));
    expect(router.state.location.search).toContain(`from=${expected.dateFrom}`);
    expect(router.state.location.search).toContain(`to=${expected.dateTo}`);
    expect(router.state.location.search).toContain('tab=health');
    expect(client.getQueryData(['platform-dashboard', {
      from: expected.dateFrom,
      to: expected.dateTo,
    }])).toEqual({ data: appliedResponse });
    expect(within(await screen.findByRole('group', { name: 'Platform summary metrics' })).getByText('12')).toBeInTheDocument();
    expect(screen.getByLabelText(`${expected.dateFrom} — New Companies: 4`)).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();
    expect(response.storage.measuredStorageBytes).toBe('9007199254740993000');

    await router.navigate(-1);
    await waitFor(() => expect(getPlatformDashboard).toHaveBeenCalledWith({
      from: '2026-08-01',
      to: '2026-08-31',
    }));
    await router.navigate(1);
    await waitFor(() => expect(router.state.location.search).toContain(`from=${expected.dateFrom}`));
  }, 15_000);
});

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: '/', element: <PlatformDashboardPage /> }],
    { initialEntries: [initialEntry] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
