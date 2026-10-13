import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyCreatePage from './CompanyCreatePage';

const api = vi.hoisted(() => ({ create: vi.fn(), resend: vi.fn() }));
vi.mock('../services/companies-api', () => ({
  createCompany: api.create,
  resendInitialAdminInvitation: api.resend,
}));

const company = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Acme', slug: 'acme', primaryEmail: null,
  phone: null, website: null, country: null, timezone: 'UTC', currency: null, address: null,
  status: 'TRIAL', counts: { branches: 0, departments: 0, designations: 0, employees: 0, users: 1 },
  createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
  initialAdminInvitation: { userId: '22222222-2222-4222-8222-222222222222', email: 'admin@acme.example', queued: true },
};

describe('CompanyCreatePage onboarding feedback', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('revalidates an automatically generated company code without clearing unrelated errors', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Administrator Email *'), { target: { value: 'admin@acme.example' } });
    fireEvent.change(screen.getByLabelText('Administrator First Name *'), { target: { value: 'Initial' } });
    fireEvent.change(screen.getByLabelText('Administrator Last Name *'), { target: { value: 'Admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create company' }));
    expect(await screen.findByText('Company code must be at least 2 characters.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid phone number.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'ESTA GLOBAL' } });

    await waitFor(() => expect(screen.getByLabelText('Company Code')).toHaveValue('esta-global'));
    await waitFor(() => expect(screen.queryByText('Company code must be at least 2 characters.')).not.toBeInTheDocument());
    expect(screen.getByText('Enter a valid phone number.')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('reports that durable invitation delivery was queued', async () => {
    api.create.mockResolvedValue({ data: company });
    renderPage();
    submitCompany();
    expect(await screen.findByText(/initial administrator invitation was queued for delivery/i)).toBeInTheDocument();
  });

  it('preserves the created company and offers bounded recovery when enqueue fails', async () => {
    api.create.mockResolvedValue({ data: { ...company, initialAdminInvitation: { ...company.initialAdminInvitation, queued: false } } });
    renderPage();
    submitCompany();
    expect(await screen.findByText(/company creation succeeded, but the invitation/i)).toHaveTextContent('admin@acme.example');
    expect(screen.queryByRole('button', { name: 'Create company' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry invitation' })).toBeInTheDocument();
  });

  it('resends only for the authoritative initial admin and prevents duplicate clicks', async () => {
    api.create.mockResolvedValue({ data: { ...company, initialAdminInvitation: { ...company.initialAdminInvitation, queued: false } } });
    let finish!: (value: unknown) => void;
    api.resend.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderPage();
    submitCompany();
    const retry = await screen.findByRole('button', { name: 'Retry invitation' });
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Queuing invitation…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Queuing invitation…' }));
    expect(api.resend).toHaveBeenCalledTimes(1);
    expect(api.resend).toHaveBeenCalledWith(company.initialAdminInvitation.userId);
    finish({ data: { invitationQueued: true } });
    expect(await screen.findByText(/replacement initial administrator invitation was queued/i)).toBeInTheDocument();
  });

  it('keeps recovery available after a resend failure', async () => {
    api.create.mockResolvedValue({ data: { ...company, initialAdminInvitation: { ...company.initialAdminInvitation, queued: false } } });
    api.resend.mockRejectedValue(new Error('network detail'));
    renderPage();
    submitCompany();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry invitation' }));
    expect(await screen.findByText(/replacement invitation could not be queued/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry invitation' })).toBeEnabled();
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/organization/companies/create']}><Routes>
    <Route path="/organization/companies/create" element={<CompanyCreatePage />} />
    <Route path="/organization/companies/:id" element={<CompanyDestination />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

function CompanyDestination() {
  const location = useLocation();
  return <div>{(location.state as { success?: string } | null)?.success ?? 'Company details destination'}</div>;
}

function submitCompany() {
  fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText('Company Code'), { target: { value: 'acme' } });
  fireEvent.change(screen.getByLabelText('Administrator Email *'), { target: { value: 'admin@acme.example' } });
  fireEvent.change(screen.getByLabelText('Administrator First Name *'), { target: { value: 'Initial' } });
  fireEvent.change(screen.getByLabelText('Administrator Last Name *'), { target: { value: 'Admin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create company' }));
}
