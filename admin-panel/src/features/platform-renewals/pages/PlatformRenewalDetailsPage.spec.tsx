import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformRenewalDetails } from '../platform-renewals.types';

const { get, recover } = vi.hoisted(() => ({ get: vi.fn(), recover: vi.fn() }));
vi.mock('../platform-renewals-api', async (original) => ({ ...(await original<typeof import('../platform-renewals-api')>()), getPlatformRenewal: get, recoverPlatformRenewal: recover }));
import PlatformRenewalDetailsPage from './PlatformRenewalDetailsPage';

const renewalId = '11111111-1111-4111-8111-111111111111';
const renewal: PlatformRenewalDetails = {
  id: renewalId, status: 'BLOCKED', cycleStart: '2026-09-01T00:00:00.000Z', cycleEnd: '2026-10-01T00:00:00.000Z', billingInterval: 'MONTHLY', recurringPriceBasis: 'PER_USER_UNIT', recurringUnitPriceMinor: '9007199254740991', recurringTotalPriceMinor: '9007199254740991', currency: 'INR', seatQuantity: 1,
  company: { id: '22222222-2222-4222-8222-222222222222', name: 'Acme' }, subscription: { id: '33333333-3333-4333-8333-333333333333', status: 'ACTIVE', plan: { id: '44444444-4444-4444-8444-444444444444', code: 'PRO', name: 'Pro' } },
  payment: { id: '55555555-5555-4555-8555-555555555555', purpose: 'SUBSCRIPTION_RENEWAL', status: 'CAPTURED', amountMinor: '9007199254740991', currency: 'INR', provider: 'RAZORPAY', mode: 'TEST', capturedAt: '2026-09-01T00:00:00.000Z' },
  preparedBy: { id: 'user-1', email: 'admin@example.test', firstName: 'Ada', lastName: 'Admin' }, applicationAttemptCount: 2, lastApplicationAttemptAt: '2026-09-02T00:00:00.000Z', appliedAt: null, blockedAt: '2026-09-02T00:00:00.000Z', blockCode: 'SAFE_CODE', safeBlockMessage: 'Safe block explanation', createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
  tax: { treatment: 'TAXABLE', decisionAt: '2026-08-31T00:00:00.000Z', currency: 'INR', taxableSubtotalMinor: '9007199254740000', totalTaxMinor: '991', grossTotalMinor: '9007199254740991', jurisdictionClassification: 'INTER_STATE', serviceClassification: '9983', placeOfSupplyState: 'Maharashtra', placeOfSupplyStateCode: '27', components: [{ type: 'IGST', rateBasisPoints: 1800, taxableAmountMinor: '9007199254740000', taxAmountMinor: '991', currency: 'INR' }] },
  providerOrder: { id: 'order-1', sequence: 1, providerOrderId: 'provider-order-1', status: 'PAID', providerStatus: 'paid', createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  invoice: { id: 'invoice-1', invoiceNumber: 'INV/2026/000001', issuedAt: '2026-09-01T00:00:00.000Z', servicePeriodStart: '2026-09-01T00:00:00.000Z', servicePeriodEnd: '2026-10-01T00:00:00.000Z', currency: 'INR', subtotalMinor: '9007199254740000', totalTaxMinor: '991', totalMinor: '9007199254740991' },
};

describe('PlatformRenewalDetailsPage', () => {
  beforeEach(() => { get.mockReset(); recover.mockReset(); });

  it('renders persisted Renewal, Payment, tax, provider-order, Invoice, and audit evidence', async () => {
    get.mockResolvedValue({ data: renewal }); renderPage();
    for (const heading of ['Renewal Summary', 'Company & Subscription', 'Commercial & Cycle Snapshot', 'Payment Truth', 'GST / Tax Evidence', 'Provider Order', 'Linked Invoice', 'Application & Block Evidence', 'Preparation & Audit Evidence']) expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getAllByText('BLOCKED').length).toBeGreaterThan(0); expect(screen.getByText('CAPTURED')).toBeInTheDocument(); expect(screen.getAllByText('INR 90071992547409.91').length).toBeGreaterThan(0);
    expect(screen.getByText('Safe block explanation')).toBeInTheDocument(); expect(screen.getByText('provider-order-1')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'INV/2026/000001' })).toHaveAttribute('href', '/billing/invoices/invoice-1');
    expect(screen.getByRole('link', { name: renewal.payment.id })).toHaveAttribute('href', `/billing/payments/${renewal.payment.id}`); expect(get).toHaveBeenCalledWith(renewalId);
  });

  it('renders explicit safe fallbacks when optional evidence is absent', async () => {
    get.mockResolvedValue({ data: { ...renewal, tax: null, providerOrder: null, invoice: null, preparedBy: null, recurringUnitPriceMinor: null } }); renderPage();
    expect(await screen.findByText('No persisted tax evidence available.')).toBeInTheDocument(); expect(screen.getByText('No provider order available.')).toBeInTheDocument(); expect(screen.getByText('No linked Invoice available.')).toBeInTheDocument(); expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
  });

  it('keeps context and return navigation visible while loading', () => {
    let resolve!: (value: { data: PlatformRenewalDetails }) => void; get.mockImplementation(() => new Promise((done) => { resolve = done; })); const view = renderPage();
    expect(screen.getByRole('heading', { name: 'Renewal Details' })).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Back to Renewals' })).toHaveAttribute('href', '/billing/renewals'); expect(screen.getByRole('status')).toHaveTextContent('Loading Renewal details'); expect(view.container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(10);
    expect(screen.getByRole('link', { name: 'Renewals' })).toHaveAttribute('href', '/billing/renewals'); expect(screen.getByText('Details')).toHaveAttribute('aria-current', 'page');
    resolve({ data: renewal });
  });

  it.each([[400, /reference is invalid/i], [403, /Access restricted/i], [404, /Renewal not found/i]])('sanitizes HTTP %s errors', async (status, message) => {
    get.mockRejectedValue(Object.assign(new Error('RAW SECRET'), { isAxiosError: true, response: { status, data: { message: 'RAW SECRET' } } })); renderPage(); expect(await screen.findByRole('alert')).toHaveTextContent(message); expect(screen.queryByText('RAW SECRET')).not.toBeInTheDocument();
  });

  it('retries a generic failure without exposing internal text', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('RAW SECRET'), { isAxiosError: true })).mockResolvedValueOnce({ data: renewal }); renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' })); expect(await screen.findByText(renewal.invoice!.invoiceNumber)).toBeInTheDocument(); expect(screen.queryByText('RAW SECRET')).not.toBeInTheDocument();
  });

  it('retains authoritative evidence and warns when a background refetch fails', async () => {
    let reject!: (reason: unknown) => void; get.mockResolvedValueOnce({ data: renewal }).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })); renderPage();
    expect(await screen.findByText(renewal.invoice!.invoiceNumber)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Refresh query' })); expect(await screen.findByLabelText('Updating Renewal details')).toBeInTheDocument(); reject(Object.assign(new Error('RAW REFRESH SECRET'), { isAxiosError: true }));
    expect(await screen.findByText("We couldn't refresh the Renewal details. Showing the most recent available evidence.")).toBeInTheDocument(); expect(screen.getByText(renewal.invoice!.invoiceNumber)).toBeInTheDocument(); expect(screen.queryByText('RAW REFRESH SECRET')).not.toBeInTheDocument();
  });

  it('does not render invented internal evidence or forbidden mutation actions', async () => {
    get.mockResolvedValue({ data: { ...renewal, providerPayload: 'RAW PROVIDER SECRET', credentialId: 'CREDENTIAL SECRET', attemptHistory: ['INTERNAL'] } }); renderPage(); await screen.findByText(renewal.id);
    for (const hidden of ['RAW PROVIDER SECRET', 'CREDENTIAL SECRET', 'INTERNAL']) expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    for (const action of ['Prepare Renewal', 'Recover Renewal', 'Reconcile', 'Capture Payment', 'Generate Invoice']) expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
  });

  it('offers confirmed recovery only for PREPARED and refreshes details and lists after APPLIED', async () => {
    get.mockResolvedValue({ data: { ...renewal, status: 'PREPARED', blockedAt: null, blockCode: null, safeBlockMessage: null } }); recover.mockResolvedValue({ data: { outcome: 'APPLIED', renewalId, subscriptionId: renewal.subscription.id, recoveredAfterExpiration: false } }); const { client } = renderPage(); const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: 'Recover Renewal' })); const dialog = screen.getByRole('dialog'); expect(dialog).toHaveTextContent('does not capture a Payment'); expect(dialog).toHaveAttribute('aria-describedby', 'recover-renewal-description'); expect(document.getElementById('recover-renewal-description')).toHaveTextContent('apply the captured Renewal Payment'); fireEvent.click(screen.getByRole('button', { name: 'Recover Renewal' }));
    await waitFor(() => expect(recover).toHaveBeenCalledWith(renewalId)); expect(await screen.findByText('Renewal applied successfully.')).toBeInTheDocument();
    for (const key of [['platform-renewals', 'details', renewalId], ['platform-renewals', 'list'], ['subscription', renewal.subscription.id], ['subscriptions'], ['platform-invoices', 'list'], ['platform-dashboard']]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });

  it('prevents duplicate recovery while the confirmed request is pending', async () => {
    let resolve!: (value: unknown) => void; get.mockResolvedValue({ data: { ...renewal, status: 'PREPARED', blockedAt: null } }); recover.mockImplementation(() => new Promise(done => { resolve = done; })); renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Recover Renewal' })); fireEvent.click(screen.getByRole('button', { name: 'Recover Renewal' })); expect(await screen.findByRole('button', { name: 'Working...' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Working...' })); expect(recover).toHaveBeenCalledTimes(1); expect(screen.getByText(renewal.invoice!.invoiceNumber)).toBeInTheDocument(); resolve({ data: { outcome: 'APPLIED', renewalId, subscriptionId: renewal.subscription.id, recoveredAfterExpiration: false } });
  });

  it('treats ALREADY_APPLIED as successful reconciliation and invalidates authoritative surfaces', async () => {
    get.mockResolvedValue({ data: { ...renewal, status: 'PREPARED', blockedAt: null } }); recover.mockResolvedValue({ data: { outcome: 'ALREADY_APPLIED', renewalId, subscriptionId: renewal.subscription.id, recoveredAfterExpiration: false } }); const { client } = renderPage(); const invalidate = vi.spyOn(client, 'invalidateQueries'); fireEvent.click(await screen.findByRole('button', { name: 'Recover Renewal' })); fireEvent.click(screen.getByRole('button', { name: 'Recover Renewal' })); expect(await screen.findByText(/already applied/i)).toBeInTheDocument(); expect(screen.queryByText(/failed|duplicate/i)).not.toBeInTheDocument(); await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['platform-invoices', 'list'] })); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['platform-dashboard'] });
  });

  it('maps PAYMENT_NOT_CAPTURED without exposing raw server details', async () => {
    get.mockResolvedValue({ data: { ...renewal, status: 'PREPARED', blockedAt: null } }); recover.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { code: 'PAYMENT_NOT_CAPTURED', message: 'RAW SECRET' } } }); renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Recover Renewal' })); fireEvent.click(screen.getByRole('button', { name: 'Recover Renewal' })); expect(await screen.findByText(/Payment is not captured yet/i)).toBeInTheDocument(); expect(screen.queryByText('RAW SECRET')).not.toBeInTheDocument();
  });

  it('sanitizes a backend block conflict and keeps current details usable', async () => {
    get.mockResolvedValue({ data: { ...renewal, status: 'PREPARED', blockedAt: null } }); recover.mockRejectedValue(axiosError(409, { code: 'INCOMPATIBLE_SUBSCRIPTION_STATE', message: 'RAW PROVIDER DETAIL' })); renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Recover Renewal' })); fireEvent.click(screen.getByRole('button', { name: 'Recover Renewal' })); expect(await screen.findByText(/blocked by the current durable state/i)).toBeInTheDocument(); expect(screen.queryByText(/RAW PROVIDER DETAIL/i)).not.toBeInTheDocument(); expect(screen.getByText(renewal.invoice!.invoiceNumber)).toBeInTheDocument(); expect(recover).toHaveBeenCalledTimes(1);
  });

  it('keeps current details usable on network failure without success invalidation', async () => {
    get.mockResolvedValue({ data: { ...renewal, status: 'PREPARED', blockedAt: null } }); recover.mockRejectedValue(axiosError(undefined, undefined)); const { client } = renderPage(); const invalidate = vi.spyOn(client, 'invalidateQueries'); fireEvent.click(await screen.findByRole('button', { name: 'Recover Renewal' })); fireEvent.click(screen.getByRole('button', { name: 'Recover Renewal' })); expect(await screen.findByText(/Check connectivity and refresh/i)).toBeInTheDocument(); expect(screen.getByText(renewal.invoice!.invoiceNumber)).toBeInTheDocument(); expect(screen.getAllByText('PREPARED').length).toBeGreaterThan(0); expect(invalidate).not.toHaveBeenCalled();
  });
});

function renderPage() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/billing/renewals/${renewalId}`]}><Routes><Route path="/billing/renewals/:renewalId" element={<><PlatformRenewalDetailsPage /><button onClick={() => void client.refetchQueries({ queryKey: ['platform-renewals', 'details', renewalId] })}>Refresh query</button></>} /></Routes></MemoryRouter></QueryClientProvider>); return { ...view, client }; }
function axiosError(status: number | undefined, data: object | undefined) { return Object.assign(new Error('request failed'), { isAxiosError: true, response: status === undefined ? undefined : { status, data } }); }
