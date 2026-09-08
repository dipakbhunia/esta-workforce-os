import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformPayment } from '../platform-payments.types';
import { PlatformPaymentList } from './PlatformPaymentList';

const payment: PlatformPayment = {
  id: '11111111-1111-4111-8111-111111111111', company: { id: '22222222-2222-4222-8222-222222222222', name: 'Demo Company' },
  subscription: { id: '33333333-3333-4333-8333-333333333333', status: 'PENDING', plan: { id: '44444444-4444-4444-8444-444444444444', name: 'Starter Snapshot', code: 'STARTER' } },
  purpose: 'SUBSCRIPTION_ACTIVATION', amountMinor: '9007199254740991', currency: 'INR', status: 'FAILED', provider: 'RAZORPAY', mode: 'TEST', providerStatus: 'failed',
  providerOrder: { id: '55555555-5555-4555-8555-555555555555', sequence: 1, providerOrderId: 'order_123456789', status: 'CREATED', providerStatus: 'created' },
  activation: { status: 'NOT_READY' }, failure: { code: 'DECLINED', message: 'Payment was declined safely', failedAt: '2026-09-01T00:00:00.000Z' },
  authorizedAt: null, capturedAt: null, failedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('PlatformPaymentList', () => {
  it('renders precise payment truth, links, failure content, and explicit details controls', () => {
    renderList([payment]);
    expect(screen.getAllByText('INR 90071992547409.91').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAILED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TEST').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NOT_READY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payment was declined safely').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'View Details' })[0]).toHaveAttribute('href', `/billing/payments/${payment.id}`);
    expect(screen.getByRole('link', { name: 'Demo Company' })).toHaveAttribute('href', `/organization/companies/${payment.company.id}`);
    expect(screen.getByRole('link', { name: /Starter Snapshot/ })).toHaveAttribute('href', `/saas/subscriptions/${payment.subscription.id}`);
  });

  it.each([['unfiltered', false, 'No payments recorded yet.'], ['filtered', true, 'No payments match the applied filters.']] as const)('renders the %s empty state', (_, filtered, title) => {
    renderList([], filtered); expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  });

  it('contains no unsupported payment action', () => {
    renderList([payment]);
    for (const action of ['Refund', 'Capture', 'Retry', 'Cancel', 'Reconcile', 'Checkout', 'Create Payment', 'Activate Subscription']) expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
  });
});

function renderList(rows: PlatformPayment[], filtered = false) { return render(<MemoryRouter><PlatformPaymentList rows={rows} total={rows.length} page={1} limit={20} loading={false} filtered={filtered} onPaginationChange={vi.fn()} /></MemoryRouter>); }
