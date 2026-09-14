import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformInvoiceDetails } from '../platform-invoices.types';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../platform-invoices-api', async (original) => ({ ...(await original<typeof import('../platform-invoices-api')>()), getPlatformInvoice: get }));
import PlatformInvoiceDetailsPage from './PlatformInvoiceDetailsPage';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const invoice: PlatformInvoiceDetails = {
  id: invoiceId, invoiceNumber: 'INV/2026/000001', companyId: '22222222-2222-4222-8222-222222222222', subscriptionId: '33333333-3333-4333-8333-333333333333', sourcePaymentId: '44444444-4444-4444-8444-444444444444',
  issuedAt: '2026-09-01T00:00:00.000Z', dueAt: null, currency: 'INR', subtotalMinor: '9007199254740991', totalMinor: '9007199254740991', servicePeriodStart: '2026-09-01T00:00:00.000Z', servicePeriodEnd: '2026-10-01T00:00:00.000Z',
  sourcePaymentPurpose: 'SUBSCRIPTION_ACTIVATION', sourceCapturedAt: '2026-09-01T00:00:00.000Z', numbering: { prefix: 'INV', resetPolicy: 'FINANCIAL_YEAR', resetBucket: '2026-27', sequence: '9007199254740991' },
  seller: { legalName: 'Historic Seller Pvt Ltd', billingEmail: 'seller@example.test', addressLine1: 'Seller Line 1', addressLine2: null, city: 'Kolkata', state: 'West Bengal', stateCode: '19', postalCode: '700001', country: 'IN' },
  billTo: { name: 'Historic Buyer', billingEmail: null, phone: null, addressLine1: 'Buyer Line 1', addressLine2: 'Buyer Line 2', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', country: 'IN' },
  lines: [{ id: 'line-1', planId: '55555555-5555-4555-8555-555555555555', planCodeSnapshot: 'ENTERPRISE-OLD', planNameSnapshot: 'Historic Enterprise', lineSequence: 1, description: 'Subscription service', quantity: 10, unitAmountMinor: '9007199254740991', subtotalMinor: '9007199254740991', currency: 'INR' }],
};

describe('PlatformInvoiceDetailsPage', () => {
  beforeEach(() => { get.mockReset(); });

  it('loads one immutable Invoice DTO and renders all eight evidence sections', async () => {
    get.mockResolvedValue({ data: invoice }); renderPage();
    for (const heading of ['Summary', 'Seller', 'Bill To', 'Subscription / Plan', 'Service Period', 'Lines', 'Source Payment', 'Numbering']) expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    for (const value of [invoice.invoiceNumber, invoice.id, invoice.companyId, invoice.subscriptionId, invoice.sourcePaymentId, 'Historic Seller Pvt Ltd', 'Seller Line 1', 'Historic Buyer', 'Buyer Line 2', 'Historic Enterprise', 'ENTERPRISE-OLD', invoice.lines[0].planId, 'Subscription service', 'SUBSCRIPTION ACTIVATION', 'FINANCIAL YEAR', '2026-27']) expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    expect(screen.getAllByText('INR 90071992547409.91').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    expect(screen.getByText(/start inclusive, end exclusive/i)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Invoice lines' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledOnce(); expect(get).toHaveBeenCalledWith(invoiceId);
  });

  it('does not expose invented lifecycle, company, GST, or private provider evidence', async () => {
    get.mockResolvedValue({ data: { ...invoice, status: 'PAID', companyName: 'Current Company', signature: 'SIGNATURE_SECRET', providerPayload: 'RAW_PROVIDER_SECRET', gstTotal: 'GST_SECRET' } }); renderPage(); await screen.findByText(invoice.invoiceNumber);
    for (const hidden of ['PAID', 'Current Company', 'SIGNATURE_SECRET', 'RAW_PROVIDER_SECRET', 'GST_SECRET']) expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    for (const action of ['Issue Invoice', 'Download PDF', 'Email Invoice', 'Mark Paid', 'Void Invoice']) expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
  });

  it('formats line money safely and rejects malformed minor units without recalculation', async () => {
    get.mockResolvedValue({ data: { ...invoice, subtotalMinor: 'broken', totalMinor: 'broken', lines: [{ ...invoice.lines[0], unitAmountMinor: 'broken', subtotalMinor: 'broken' }] } }); renderPage();
    expect((await screen.findAllByText('Amount unavailable')).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps page context and back navigation visible during structured loading', () => {
    get.mockImplementation(() => new Promise(() => undefined)); const view = renderPage();
    expect(screen.getByRole('heading', { name: 'Invoice Details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Invoices' })).toHaveAttribute('href', '/billing/invoices');
    expect(screen.getByRole('status')).toHaveTextContent('Loading Invoice details');
    expect(view.container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(10);
  });

  it.each([[400, /reference is invalid/i], [404, /Invoice not found/i], [403, /Access restricted/i]])('handles HTTP %s without raw backend text', async (status, message) => {
    get.mockRejectedValue({ isAxiosError: true, response: { status, data: { message: 'DATABASE SECRET' } } }); renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(message); expect(screen.queryByText('DATABASE SECRET')).not.toBeInTheDocument();
    if (status === 400 || status === 404) for (const link of screen.getAllByRole('link', { name: 'Back to Invoices' })) expect(link).toHaveAttribute('href', '/billing/invoices');
  });

  it('offers retry for a generic initial failure', async () => {
    get.mockRejectedValueOnce({ isAxiosError: true, message: 'RAW AXIOS SECRET' }).mockResolvedValueOnce({ data: invoice }); renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' }));
    expect(await screen.findByText(invoice.invoiceNumber)).toBeInTheDocument(); expect(screen.queryByText('RAW AXIOS SECRET')).not.toBeInTheDocument(); expect(get).toHaveBeenCalledTimes(2);
  });

  it('retains evidence and warns safely when a background refetch fails', async () => {
    let reject!: (reason: unknown) => void; get.mockResolvedValueOnce({ data: invoice }).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })); renderPage();
    expect(await screen.findByText(invoice.invoiceNumber)).toBeInTheDocument(); fireEvent.click(screen.getByText('Refresh query'));
    expect(await screen.findByLabelText('Updating Invoice details')).toBeInTheDocument(); expect(screen.getByText(invoice.invoiceNumber)).toBeInTheDocument();
    reject({ isAxiosError: true, response: { status: 500, data: { message: 'RAW REFRESH SECRET' } } });
    expect(await screen.findByText("We couldn't refresh the Invoice details. Showing the most recent available evidence.")).toBeInTheDocument();
    expect(screen.getByText(invoice.invoiceNumber)).toBeInTheDocument(); expect(screen.queryByText('RAW REFRESH SECRET')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

function renderPage(path = `/billing/invoices/${invoiceId}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/billing/invoices/:invoiceId" element={<><PlatformInvoiceDetailsPage /><button onClick={() => void client.refetchQueries({ queryKey: ['platform-invoices', 'details', invoiceId] })}>Refresh query</button></>} /></Routes></MemoryRouter></QueryClientProvider>);
}
