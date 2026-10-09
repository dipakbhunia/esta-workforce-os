import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getCompany: vi.fn(),
  deleteCompany: vi.fn(),
  getBillingContact: vi.fn(),
  getEligibleBillingContacts: vi.fn(),
  updateBillingContact: vi.fn(),
  getCompanySeatUsage: vi.fn(),
  getCompanyStorageUsage: vi.fn(),
}));

vi.mock('../services/companies-api', () => ({
  getCompany: api.getCompany,
  deleteCompany: api.deleteCompany,
  getBillingContact: api.getBillingContact,
  getEligibleBillingContacts: api.getEligibleBillingContacts,
  updateBillingContact: api.updateBillingContact,
}));
vi.mock('@/features/usage-seats/usage-seats-api', () => ({ getCompanySeatUsage: api.getCompanySeatUsage }));
vi.mock('@/features/storage-usage/storage-usage-api', () => ({ getCompanyStorageUsage: api.getCompanyStorageUsage }));

import CompanyDetailsPage from './CompanyDetailsPage';

const companyId = '10000000-0000-4000-8000-000000000001';
const alice = { id: '20000000-0000-4000-8000-000000000001', firstName: 'Alice', lastName: 'Admin', email: 'alice@example.test' };
const bob = { id: '20000000-0000-4000-8000-000000000002', firstName: 'Bob', lastName: 'Billing', email: 'bob@example.test' };
const zara = { id: '20000000-0000-4000-8000-000000000101', firstName: 'Zara', lastName: 'Outside', email: 'zara@example.test' };

describe('CompanyDetailsPage designated Billing Contact', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    api.getCompany.mockResolvedValue({ data: {
      id: companyId, name: 'Acme', slug: 'acme', primaryEmail: 'hello@acme.test', phone: null,
      website: null, country: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', address: null,
      status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      counts: { branches: 0, departments: 0, designations: 0, employees: 0, users: 2 },
    } });
    api.getCompanySeatUsage.mockResolvedValue({ data: null });
    api.getCompanyStorageUsage.mockResolvedValue({ data: null });
    api.getEligibleBillingContacts.mockResolvedValue({ data: [alice, bob] });
    api.getBillingContact.mockResolvedValue({ data: { companyId, billingProfileExists: true, billingContactUserId: alice.id, billingContact: alice } });
    api.updateBillingContact.mockResolvedValue({ data: { companyId, billingProfileExists: true, billingContactUserId: bob.id, billingContact: bob } });
  });

  it('loads the current authority and exposes an accessible eligible-user selector', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Designated Billing Contact' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Billing Contact' })).toHaveValue('Alice Admin — alice@example.test');
    expect(screen.getByText(/Commercial billing emails will be sent/)).toBeInTheDocument();
    expect(api.getBillingContact).toHaveBeenCalledWith(companyId);
    expect(api.getEligibleBillingContacts).toHaveBeenCalledWith(companyId, undefined);
  });

  it('debounces server search, uses search-specific results, and preserves the selected authority', async () => {
    api.getEligibleBillingContacts.mockImplementation(async (_companyId: string, search?: string) => ({ data: search === 'Zara' ? [zara] : [bob] }));
    renderPage();
    const selector = await screen.findByRole('combobox', { name: 'Billing Contact' });
    expect(selector).toHaveValue('Alice Admin — alice@example.test');
    await waitFor(() => expect(api.getEligibleBillingContacts).toHaveBeenCalledTimes(1));

    fireEvent.change(selector, { target: { value: 'Za' } });
    fireEvent.change(selector, { target: { value: 'Zara' } });
    expect(api.getEligibleBillingContacts).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.getEligibleBillingContacts).toHaveBeenLastCalledWith(companyId, 'Zara'), { timeout: 1_000 });

    expect(selector).toHaveValue('Zara');
    fireEvent.click(await screen.findByText('Zara Outside — zara@example.test'));
    expect(selector).toHaveValue('Zara Outside — zara@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateBillingContact).toHaveBeenCalledWith(companyId, zara.id));
  });

  it('keeps a configured contact visible while a search returns no matches', async () => {
    api.getEligibleBillingContacts.mockImplementation(async (_companyId: string, search?: string) => ({ data: search ? [] : [bob] }));
    renderPage();
    const selector = await screen.findByRole('combobox', { name: 'Billing Contact' });
    expect(selector).toHaveValue('Alice Admin — alice@example.test');
    fireEvent.change(selector, { target: { value: 'Nobody' } });
    await waitFor(() => expect(api.getEligibleBillingContacts).toHaveBeenLastCalledWith(companyId, 'Nobody'), { timeout: 1_000 });
    expect(selector).toHaveValue('Nobody');
    expect(await screen.findByText('Alice Admin — alice@example.test')).toBeInTheDocument();
  });

  it('changes and clears the designated Billing Contact through authoritative mutations', async () => {
    renderPage();
    const selector = await screen.findByRole('combobox', { name: 'Billing Contact' });
    fireEvent.mouseDown(selector);
    fireEvent.click(await screen.findByText('Bob Billing — bob@example.test'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateBillingContact).toHaveBeenCalledWith(companyId, bob.id));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.updateBillingContact).toHaveBeenCalledWith(companyId, null));
  });

  it('renders loading, missing-profile, and retryable error states without exposing controls', async () => {
    let resolveCurrent!: (value: unknown) => void;
    api.getBillingContact.mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));
    const first = renderPage();
    expect(await screen.findByRole('heading', { name: 'Designated Billing Contact' })).toBeInTheDocument();
    expect(first.container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    resolveCurrent({ data: { companyId, billingProfileExists: false, billingContactUserId: null, billingContact: null } });
    expect(await screen.findByText(/Billing Profile must exist/)).toBeInTheDocument();
    first.unmount();

    api.getBillingContact.mockRejectedValue(new Error('internal detail'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Billing Contact configuration could not be loaded.');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/organization/companies/${companyId}`]}>
        <Routes><Route path="/organization/companies/:id" element={<CompanyDetailsPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
