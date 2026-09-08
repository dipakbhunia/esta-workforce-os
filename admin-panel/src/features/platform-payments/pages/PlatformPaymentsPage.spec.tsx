import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformPaymentFilterDraft } from '../components/PlatformPaymentFilters';
import type { PlatformPaymentListQuery } from '../platform-payments.types';

const { list, filterProps, listProps } = vi.hoisted(() => ({ list: vi.fn(), filterProps: { current: null as Record<string, unknown> | null }, listProps: { current: null as Record<string, unknown> | null } }));
vi.mock('../platform-payments-api', () => ({ listPlatformPayments: list }));
vi.mock('../components/PlatformPaymentFilters', () => ({ PlatformPaymentFilters: (props: Record<string, unknown>) => { filterProps.current = props; return <div><button onClick={() => (props.onApply as () => void)()}>Apply mock</button><button onClick={() => (props.onClear as () => void)()}>Clear mock</button><button onClick={() => (props.onRefresh as () => void)()}>Refresh mock</button></div>; } }));
vi.mock('../components/PlatformPaymentList', () => ({ PlatformPaymentList: (props: Record<string, unknown>) => { listProps.current = props; return props.loading ? <div>Loading list</div> : <div>List ready</div>; } }));

import PlatformPaymentsPage from './PlatformPaymentsPage';

const empty = { data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } };

describe('PlatformPaymentsPage', () => {
  beforeEach(() => { list.mockReset().mockResolvedValue(empty); filterProps.current = null; listProps.current = null; });

  it('loads once with canonical defaults and no details request', async () => {
    renderPage();
    expect(screen.getByText('Loading list')).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalledWith({ page: 1, limit: 20 }));
    expect(list).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('?page=1&limit=20');
  });

  it('hydrates every supported applied filter from the URL', async () => {
    const companyId = '11111111-1111-4111-8111-111111111111'; const subscriptionId = '22222222-2222-4222-8222-222222222222';
    renderPage(`/?page=2&limit=50&companyId=${companyId}&status=FAILED&provider=RAZORPAY&mode=TEST&purpose=SUBSCRIPTION_ACTIVATION&subscriptionId=${subscriptionId}&from=2026-09-01T00%3A00%3A00.000Z&to=2026-09-02T00%3A00%3A00.000Z`);
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 50, companyId, subscriptionId, status: 'FAILED', provider: 'RAZORPAY', mode: 'TEST', purpose: 'SUBSCRIPTION_ACTIVATION' })));
    expect((filterProps.current?.draft as PlatformPaymentFilterDraft).status).toBe('FAILED');
  });

  it('keeps draft edits query-silent until Apply then resets page', async () => {
    renderPage('/?page=3&limit=20'); await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => (filterProps.current?.onChange as (value: PlatformPaymentFilterDraft) => void)({ ...(filterProps.current?.draft as PlatformPaymentFilterDraft), status: 'CAPTURED', provider: 'RAZORPAY' }));
    expect(list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Apply mock'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'CAPTURED', provider: 'RAZORPAY' }));
  });

  it('clears filters while preserving limit and resetting page', async () => {
    renderPage('/?page=4&limit=50&status=FAILED'); await waitFor(() => expect(list).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Clear mock'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
  });

  it('clears applied filters and newer unapplied draft edits together', async () => {
    renderPage('/?page=4&limit=50&status=FAILED'); await waitFor(() => expect(list).toHaveBeenCalled());
    act(() => (filterProps.current?.onChange as (value: PlatformPaymentFilterDraft) => void)({ ...(filterProps.current?.draft as PlatformPaymentFilterDraft), companyId: 'draft-only-company' }));
    fireEvent.click(screen.getByText('Clear mock'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
    expect(filterProps.current?.draft).toEqual(expect.objectContaining({ status: '', companyId: '', from: '', to: '' }));
  });

  it('manual Refresh preserves URL state and refetches', async () => {
    renderPage('/?page=2&limit=20&status=PENDING'); await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Refresh mock'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('location')).toHaveTextContent('page=2&limit=20&status=PENDING');
  });

  it('rehydrates applied and draft state across browser Back/Forward navigation', async () => {
    renderPage('/?page=1&limit=20&status=PENDING');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'PENDING' }));
    fireEvent.click(screen.getByText('Next URL'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'CAPTURED' }));
    expect((filterProps.current?.draft as PlatformPaymentFilterDraft).status).toBe('CAPTURED');
    fireEvent.click(screen.getByText('Back URL'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'PENDING' }));
    expect((filterProps.current?.draft as PlatformPaymentFilterDraft).status).toBe('PENDING');
    fireEvent.click(screen.getByText('Forward URL'));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'CAPTURED' }));
    expect((filterProps.current?.draft as PlatformPaymentFilterDraft).status).toBe('CAPTURED');
  });

  it('maps pagination and page-size changes to one-based URL state', async () => {
    renderPage(); await waitFor(() => expect(listProps.current).not.toBeNull());
    act(() => (listProps.current?.onPaginationChange as (page: number, limit: number) => void)(3, 20));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 3, limit: 20 }));
    act(() => (listProps.current?.onPaginationChange as (page: number, limit: number) => void)(3, 100));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 100 }));
  });

  it('normalizes an out-of-range page once to the last valid page', async () => {
    list.mockResolvedValue({ data: { data: [], meta: { page: 8, limit: 20, total: 45, totalPages: 3 } } });
    renderPage('/?page=8&limit=20');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 3, limit: 20 }));
    expect(screen.getByTestId('location')).toHaveTextContent('page=3&limit=20');
  });

  it.each([[400, 'filters are invalid'], [403, 'Access restricted'], [500, 'could not be loaded']])('renders a safe %s error and Retry', async (status, message) => {
    list.mockRejectedValue({ isAxiosError: true, response: { status } }); renderPage();
    expect(await screen.findByText(new RegExp(message, 'i'))).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry')); await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
  });
});

function renderPage(initial = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><PlatformPaymentsPage /><Location /><HistoryControls /></MemoryRouter></QueryClientProvider>);
}
function Location() { const location = useLocation(); return <span data-testid="location">{location.search}</span>; }
function HistoryControls() { const navigate = useNavigate(); return <><button onClick={() => navigate('/?page=1&limit=20&status=CAPTURED')}>Next URL</button><button onClick={() => navigate(-1)}>Back URL</button><button onClick={() => navigate(1)}>Forward URL</button></>; }
