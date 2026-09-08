import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformPaymentActivationStatus, PlatformPaymentDetails } from '../platform-payments.types';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../platform-payments-api', () => ({ getPlatformPayment: get }));
import PlatformPaymentDetailsPage from './PlatformPaymentDetailsPage';

const id = '11111111-1111-4111-8111-111111111111';
const base: PlatformPaymentDetails = {
  id, company: { id: '22222222-2222-4222-8222-222222222222', name: 'Exact Company' },
  subscription: { id: '33333333-3333-4333-8333-333333333333', status: 'ACTIVE', plan: { id: '44444444-4444-4444-8444-444444444444', name: 'Historic Enterprise', code: 'HISTORIC' }, activationSource: 'PAYMENT', activatedByPaymentId: id },
  purpose: 'SUBSCRIPTION_ACTIVATION', amountMinor: '9007199254740991', currency: 'INR', status: 'CAPTURED', provider: 'RAZORPAY', mode: 'TEST', providerStatus: 'captured',
  activation: { status: 'COMPLETED' }, authorizedAt: '2026-09-01T01:00:00.000Z', capturedAt: '2026-09-01T02:00:00.000Z', failedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T02:00:00.000Z',
  capturedProviderPaymentId: 'pay_exact_capture', historicalFailure: { code: 'EARLIER_FAILURE', message: 'Earlier safe failure', failedAt: '2026-09-01T00:00:00.000Z', recovered: true },
  providerOrders: { truncated: true, data: [
    { id: 'order-b', sequence: 2, providerOrderId: 'order_new_closed', status: 'CLOSED', providerStatus: 'closed', createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T02:00:00.000Z' },
    { id: 'order-a', sequence: 1, providerOrderId: 'order_old', status: 'CREATED', providerStatus: 'created', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  ] },
  attempts: { truncated: true, data: [
    { id: 'attempt-b', sequence: 2, operation: 'PROVIDER_PAYMENT', status: 'SUCCEEDED', providerOrderId: 'order_new_closed', providerPaymentId: 'pay_exact_capture', providerStatus: 'captured', amountMinor: '9007199254740991', currency: 'INR', failureCode: null, safeFailureMessage: null, startedAt: '2026-09-01T02:00:00.000Z', completedAt: '2026-09-01T02:01:00.000Z', createdAt: '2026-09-01T02:00:00.000Z', updatedAt: '2026-09-01T02:01:00.000Z' },
    { id: 'attempt-a', sequence: 1, operation: 'ORDER_CREATE', status: 'FAILED', providerOrderId: 'order_old', providerPaymentId: null, providerStatus: 'failed', amountMinor: '9007199254740991', currency: 'INR', failureCode: 'SAFE_CODE', safeFailureMessage: 'Safe attempt message', startedAt: '2026-09-01T00:00:00.000Z', completedAt: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  ] },
  providerEvents: { truncated: true, data: [
    { id: 'event-b', eventType: 'payment.captured', providerEventId: 'evt_new', status: 'PROCESSED', providerOrderId: 'order_new_closed', providerPaymentId: 'pay_exact_capture', providerCreatedAt: '2026-09-01T02:00:00.000Z', receivedAt: '2026-09-01T02:02:00.000Z', processedAt: '2026-09-01T02:03:00.000Z' },
    { id: 'event-a', eventType: 'payment.failed', providerEventId: 'evt_old', status: 'PROCESSED', providerOrderId: 'order_old', providerPaymentId: null, providerCreatedAt: null, receivedAt: '2026-09-01T00:00:00.000Z', processedAt: null },
  ] },
  auditEvidence: { truncated: true, data: [
    { id: 'audit-b', action: 'SUBSCRIPTION_ACTIVATED_BY_PAYMENT', recordedAt: '2026-09-01T02:04:00.000Z' },
    { id: 'audit-a', action: 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE', recordedAt: '2026-09-01T02:03:00.000Z' },
  ] },
};

describe('PlatformPaymentDetailsPage', () => {
  beforeEach(() => { get.mockReset(); });

  it('shows initial loading then renders exact read-only payment and commercial truth from one request', async () => {
    let resolve!: (value: unknown) => void; get.mockImplementation(() => new Promise((done) => { resolve = done; })); const view = renderPage();
    expect(view.container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(10);
    expect(screen.getByRole('status')).toHaveTextContent('Loading payment details');
    resolve({ data: base });
    expect((await screen.findAllByText(id)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByText('INR 90071992547409.91').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Exact Company' })).toHaveAttribute('href', `/organization/companies/${base.company.id}`);
    expect(screen.getByRole('link', { name: /Historic Enterprise/ })).toHaveAttribute('href', `/saas/subscriptions/${base.subscription.id}`);
    expect(screen.getAllByText('pay_exact_capture').length).toBeGreaterThan(0);
    expect(get).toHaveBeenCalledOnce(); expect(get).toHaveBeenCalledWith(id);
  });

  it.each(['COMPLETED', 'BLOCKED', 'NOT_READY', 'PENDING', 'UNRESOLVED'] as PlatformPaymentActivationStatus[])('renders backend activation state %s without overriding it', async (status) => {
    get.mockResolvedValue({ data: { ...base, activation: { status } } }); renderPage();
    expect(await screen.findByText(status)).toBeInTheDocument();
  });

  it('distinguishes recovered historical failure from current Payment truth', async () => {
    get.mockResolvedValue({ data: base }); renderPage();
    expect(await screen.findByText('CAPTURED')).toBeInTheDocument();
    expect(screen.getByText(/previously failed and was later recovered/)).toBeInTheDocument();
    expect(screen.queryByText('This is the current Payment failure.')).not.toBeInTheDocument();
  });

  it('renders current FAILED evidence and handles absent historical/captured identities', async () => {
    get.mockResolvedValue({ data: { ...base, status: 'FAILED', capturedProviderPaymentId: null, historicalFailure: { code: 'CURRENT', message: 'Current safe failure', failedAt: base.createdAt, recovered: false } } }); renderPage();
    expect(await screen.findByText('This is the current Payment failure.')).toBeInTheDocument();
    expect(screen.getByText('Current safe failure')).toBeInTheDocument();
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
  });

  it('renders compact empty history and no fabricated historical failure', async () => {
    get.mockResolvedValue({ data: { ...base, capturedProviderPaymentId: null, historicalFailure: null, providerOrders: empty(), attempts: empty(), providerEvents: empty(), auditEvidence: empty() } }); renderPage();
    for (const text of ['No historical failure recorded.', 'No provider orders recorded.', 'No payment attempts recorded.', 'No provider events recorded.', 'No selected audit evidence recorded.']) expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('preserves API order for every history and displays CLOSED orders', async () => {
    get.mockResolvedValue({ data: base }); renderPage(); await screen.findAllByText('order_new_closed');
    expect(before('Order sequence 2', 'Order sequence 1')).toBe(true);
    expect(before('Attempt sequence 2', 'Attempt sequence 1')).toBe(true);
    expect(before('payment.captured', 'payment.failed')).toBe(true);
    expect(before('SUBSCRIPTION ACTIVATED BY PAYMENT', 'PAYMENT RECOVERED AFTER PROVIDER FAILURE')).toBe(true);
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
  });

  it('reports the exact visible bound for each truncated history', async () => {
    get.mockResolvedValue({ data: base }); renderPage();
    expect((await screen.findAllByText('Showing the most recent 100 records.')).length).toBe(2);
    expect(screen.getByText('Showing the most recent 25 records.')).toBeInTheDocument();
    expect(screen.getByText('Showing the most recent 20 records.')).toBeInTheDocument();
  });

  it.each([[400, /reference is invalid/i], [404, /Payment not found/i], [403, /Access restricted/i]])('renders safe HTTP %s handling', async (status, message) => {
    get.mockRejectedValue({ isAxiosError: true, response: { status, data: { message: 'DATABASE SECRET' } } }); renderPage();
    const alert = await screen.findByRole('alert'); expect(alert).toHaveTextContent(message); expect(screen.queryByText('DATABASE SECRET')).not.toBeInTheDocument();
  });

  it('uses an unambiguous read-only Retry loading action for network errors', async () => {
    get.mockRejectedValueOnce({ isAxiosError: true }).mockResolvedValueOnce({ data: base }); renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' }));
    expect((await screen.findAllByText(id)).length).toBeGreaterThan(0); expect(get).toHaveBeenCalledTimes(2);
  });

  it('allows the safe backend 400 path for malformed IDs', async () => {
    get.mockRejectedValue({ isAxiosError: true, response: { status: 400 } }); renderPage('/billing/payments/not-a-uuid');
    expect(await screen.findByRole('alert')).toHaveTextContent(/reference is invalid/i); expect(get).toHaveBeenCalledWith('not-a-uuid');
  });

  it('provides Back to Payments and no mutation controls', async () => {
    get.mockResolvedValue({ data: base }); renderPage(); await screen.findAllByText(id);
    expect(screen.getAllByRole('link', { name: 'Back to Payments' })[0]).toHaveAttribute('href', '/billing/payments');
    for (const action of ['Refund', 'Capture', 'Retry Payment', 'Cancel Payment', 'Settle', 'Reconcile', 'Fetch Provider Status', 'Activate Subscription', 'Retry Activation', 'Generate Invoice']) expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
  });

  it('never renders adversarial sensitive fields outside the closed DTO projection', async () => {
    const adversarial = { ...base, normalizedPayload: 'RAW_SECRET', signature: 'SIGNATURE_SECRET', payloadHash: 'HASH_SECRET', configurationId: 'CONFIG_SECRET', credentialVersionId: 'CREDENTIAL_SECRET', requestReference: 'REQUEST_SECRET', metadata: { token: 'TOKEN_SECRET' }, processingLease: 'LEASE_SECRET' };
    get.mockResolvedValue({ data: adversarial }); renderPage(); await screen.findAllByText(id);
    for (const secret of ['RAW_SECRET', 'SIGNATURE_SECRET', 'HASH_SECRET', 'CONFIG_SECRET', 'CREDENTIAL_SECRET', 'REQUEST_SECRET', 'TOKEN_SECRET', 'LEASE_SECRET']) expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });
});

function empty() { return { data: [], truncated: false }; }
function before(first: string, second: string) { return Boolean(screen.getByText(first).compareDocumentPosition(screen.getByText(second)) & Node.DOCUMENT_POSITION_FOLLOWING); }
function renderPage(path = `/billing/payments/${id}`) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/billing/payments/:id" element={<PlatformPaymentDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>); }
