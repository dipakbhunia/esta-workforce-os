import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingSettings } from './billing-settings.types';

const api = vi.hoisted(() => ({
  getBillingSettings: vi.fn(),
  updateBillingSettings: vi.fn(),
  getBillingProviders: vi.fn(),
  createBillingProvider: vi.fn(),
  updateBillingProvider: vi.fn(),
  runBillingProviderAction: vi.fn(),
  configureBillingProviderCredentials: vi.fn(),
  validateBillingProviderCredentials: vi.fn(),
}));

vi.mock('./billing-settings-api', () => api);

import BillingSettingsPage from './BillingSettingsPage';

const settings: BillingSettings = {
  id: 'billing-settings',
  scope: 'PLATFORM',
  invoicePrefix: 'INV',
  invoiceNumberResetPolicy: 'NEVER',
  defaultPaymentTermsDays: 15,
  defaultInvoiceNotes: null,
  sellerLegalName: null,
  sellerBillingEmail: null,
  sellerAddressLine1: null,
  sellerAddressLine2: null,
  sellerCity: null,
  sellerState: null,
  sellerStateCode: null,
  sellerPostalCode: null,
  sellerCountry: null,
  gstEnabled: false,
  gstin: null,
  gstLegalName: null,
  gstRegisteredState: null,
  gstRegisteredStateCode: null,
  renewalMode: 'MANUAL',
  renewalLeadDays: 0,
  renewalGracePeriodDays: 0,
  renewalReminderDays: [],
  updatedById: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('BillingSettingsPage capability copy', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    api.getBillingSettings.mockResolvedValue({ data: settings });
    api.getBillingProviders.mockResolvedValue({ data: [] });
  });

  it('describes provider runtime truth without overstating UI, connectivity, or capture capabilities', async () => {
    renderPage();

    expect(await screen.findByText('Payment Providers')).toBeInTheDocument();
    expect(screen.getByText(/TEST-mode Razorpay order preparation/)).toBeInTheDocument();
    expect(screen.getByText(/checkout signature confirmation/)).toBeInTheDocument();
    expect(screen.getByText(/verified webhook payment-truth processing/)).toBeInTheDocument();
    expect(screen.getByText(/activation of eligible subscriptions from CAPTURED payment truth/)).toBeInTheDocument();
    expect(screen.getByText(/Credential checks are structural only/)).toBeInTheDocument();
    expect(screen.getByText(/connectivity verification, provider payment fetch or polling, active capture operations/)).toBeInTheDocument();
    expect(screen.getByText(/Payments management UI, and refunds are not implemented/)).toBeInTheDocument();
    expect(screen.queryByText(/confirmation, webhooks, capture synchronization, automatic activation/)).not.toBeInTheDocument();
  });

  it('retains configuration-only Invoice, GST, and Renewal boundaries', async () => {
    renderPage();

    expect(await screen.findByText('Defaults for future invoices. Number sequence generation is not implemented in B1.')).toBeInTheDocument();
    expect(screen.getByText('Conservative registration metadata only; GST invoice generation is not implemented in B1.')).toBeInTheDocument();
    expect(screen.getByText('Policy defaults only. Renewal cycles, invoicing, collection, and subscription transitions are not active in B1.')).toBeInTheDocument();
    expect(screen.getByText(/Selecting Automatic records a future policy preference only/)).toBeInTheDocument();
  });
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BillingSettingsPage />
    </QueryClientProvider>,
  );
}
