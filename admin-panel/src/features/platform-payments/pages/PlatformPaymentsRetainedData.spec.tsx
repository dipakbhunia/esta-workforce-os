import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformPayment } from '../platform-payments.types';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../platform-payments-api', () => ({ listPlatformPayments: list }));
vi.mock('@/components/data-table', () => ({ DataTable: ({ rows }: { rows: PlatformPayment[] }) => <div role="grid" aria-label="Payment Register">{rows.map((row) => <span key={row.id}>{row.company.name}</span>)}</div> }));
import PlatformPaymentsPage from './PlatformPaymentsPage';

const payment: PlatformPayment = {
  id: '11111111-1111-4111-8111-111111111111', company: { id: '22222222-2222-4222-8222-222222222222', name: 'Retained Company' }, subscription: { id: '33333333-3333-4333-8333-333333333333', status: 'PENDING', plan: { id: '44444444-4444-4444-8444-444444444444', name: 'Retained Plan', code: 'RETAINED' } }, purpose: 'SUBSCRIPTION_ACTIVATION', amountMinor: '99000', currency: 'INR', status: 'PENDING', provider: 'RAZORPAY', mode: 'TEST', providerStatus: null, providerOrder: null, activation: { status: 'NOT_READY' }, failure: null, authorizedAt: null, capturedAt: null, failedAt: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('PlatformPaymentsPage retained background data', () => {
  beforeEach(() => list.mockReset());

  it('keeps populated rows visible with restrained progress and no blocking skeleton during refetch', async () => {
    let resolveRefetch!: (value: unknown) => void;
    list.mockResolvedValueOnce({ data: { data: [payment], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } }).mockImplementationOnce(() => new Promise((resolve) => { resolveRefetch = resolve; }));
    renderPage();
    expect((await screen.findAllByText('Retained Company')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByLabelText('Updating payment register')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Payment Register' })).toBeInTheDocument();
    expect(screen.getAllByText('Retained Company').length).toBeGreaterThan(0);
    expect(screen.queryByText('No payments recorded yet.')).not.toBeInTheDocument();
    resolveRefetch({ data: { data: [payment], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    await waitFor(() => expect(screen.queryByLabelText('Updating payment register')).not.toBeInTheDocument());
  }, 15_000);
});

function renderPage() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter><PlatformPaymentsPage /></MemoryRouter></QueryClientProvider>); }
