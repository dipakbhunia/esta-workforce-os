import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyOnboardingReadiness } from '../types/company.types';

const api = vi.hoisted(() => ({ getCompanyOnboardingReadiness: vi.fn() }));
vi.mock('../services/companies-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/companies-api')>()),
  getCompanyOnboardingReadiness: api.getCompanyOnboardingReadiness,
}));

import { CompanyOnboardingReadinessPanel } from './CompanyOnboardingReadinessPanel';
import {
  InvalidCompanyOnboardingReadinessResponseError,
  UnsupportedCompanyOnboardingReadinessContractError,
} from '../services/companies-api';

const companyId = '10000000-0000-4000-8000-000000000001';
const readiness: CompanyOnboardingReadiness = {
  companyId,
  contractVersion: '1',
  evaluatedAt: '2026-10-28T10:00:00.000Z',
  overallStatus: 'READY',
  blockingCount: 0,
  items: [
    { id: 'COMPANY_PROFILE', category: 'ADMINISTRATIVE', label: 'Company profile', status: 'READY', blocking: true, reasonCode: 'PROFILE_OK', explanation: 'Profile authority is available.', remediation: { kind: 'NAVIGATE', label: 'Review company', route: `/organization/companies/${companyId}` } },
    { id: 'OPERATIONAL_LIFECYCLE', category: 'OPERATIONAL', label: 'Operational lifecycle', status: 'INCOMPLETE', blocking: false, reasonCode: 'LIFECYCLE_PENDING', explanation: 'Operational work remains.', remediation: null },
    { id: 'TENANT_ADMIN_ACCESS', category: 'ADMINISTRATIVE', label: 'Company administrator access', status: 'BLOCKED', blocking: true, reasonCode: 'ADMIN_MISSING', explanation: 'Administrator authority is missing.', remediation: null },
    { id: 'ADMIN_INVITATION', category: 'ADMINISTRATIVE', label: 'Administrator invitation', status: 'NOT_APPLICABLE', blocking: false, reasonCode: 'INVITE_NA', explanation: 'Invitation is not applicable.', remediation: null },
    { id: 'COMMERCIAL_ACCESS', category: 'COMMERCIAL', label: 'Commercial access', status: 'UNAVAILABLE', blocking: false, reasonCode: 'COMMERCIAL_UNKNOWN', explanation: 'Commercial evidence is unavailable.', remediation: null },
    { id: 'BILLING_PROFILE', category: 'BILLING', label: 'Billing profile', status: 'READY', blocking: false, reasonCode: 'BILLING_OK', explanation: 'Billing profile is complete.', remediation: null },
    { id: 'BILLING_CONTACT', category: 'BILLING', label: 'Billing contact', status: 'INCOMPLETE', blocking: false, reasonCode: 'CONTACT_MISSING', explanation: 'Billing contact remains incomplete.', remediation: null },
    { id: 'COMPANY_CONTACT_DETAILS', category: 'PROFILE', label: 'Company contact details', status: 'READY', blocking: false, reasonCode: 'CONTACTS_OK', explanation: 'Contact details are complete.', remediation: null },
  ],
};

describe('CompanyOnboardingReadinessPanel', () => {
  beforeEach(() => {
    api.getCompanyOnboardingReadiness.mockReset();
    api.getCompanyOnboardingReadiness.mockResolvedValue({ data: readiness });
  });

  it('renders all eight server-provided dimensions, all statuses, and required versus optional semantics', async () => {
    renderPanel(companyId);
    expect(await screen.findByRole('heading', { name: 'Company Onboarding Readiness' })).toBeInTheDocument();
    for (const item of readiness.items) {
      expect(screen.getByRole('heading', { name: item.label })).toBeInTheDocument();
      expect(screen.getByText(item.explanation)).toBeInTheDocument();
    }
    for (const label of ['Ready', 'Incomplete', 'Blocked', 'Not Applicable', 'Unavailable']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Required')).toHaveLength(2);
    expect(screen.getAllByText('Optional follow-up')).toHaveLength(6);
    expect(screen.getByText('0 blocking issues')).toBeInTheDocument();
    expect(screen.getByText(/Administrative readiness is authoritative/)).toBeInTheDocument();
  });

  it('uses company-specific query keys and refreshes explicitly without hiding prior data', async () => {
    let resolveRefresh!: (value: { data: CompanyOnboardingReadiness }) => void;
    api.getCompanyOnboardingReadiness
      .mockResolvedValueOnce({ data: readiness })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    renderPanel(companyId);
    await screen.findByText('Profile authority is available.');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('button', { name: 'Refreshing' })).toBeDisabled();
    expect(screen.getByText('Profile authority is available.')).toBeInTheDocument();
    expect(api.getCompanyOnboardingReadiness).toHaveBeenLastCalledWith(companyId);
    resolveRefresh({ data: readiness });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  });

  it('does not show cached Company A readiness after switching to Company B with one QueryClient', async () => {
    const client = createQueryClient();
    const companyBId = '10000000-0000-4000-8000-000000000002';
    const companyBReadiness = {
      ...readiness,
      companyId: companyBId,
      evaluatedAt: '2026-10-28T11:00:00.000Z',
      items: readiness.items.map((item) => item.id === 'COMPANY_PROFILE'
        ? { ...item, explanation: 'Company B profile authority is available.' }
        : item),
    };
    api.getCompanyOnboardingReadiness.mockImplementation(async (id: string) => ({ data: id === companyId ? readiness : companyBReadiness }));
    const view = render(panelTree(companyId, client));
    await screen.findByText('Profile authority is available.');
    view.rerender(panelTree(companyBId, client));
    expect(screen.queryByText('Profile authority is available.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading Company onboarding readiness')).toBeInTheDocument();
    expect(await screen.findByText('Company B profile authority is available.')).toBeInTheDocument();
    expect(api.getCompanyOnboardingReadiness).toHaveBeenLastCalledWith(companyBId);
  });

  it('preserves the previous evaluation and warns until a failed refresh is successfully retried', async () => {
    let rejectRefresh!: (reason: Error) => void;
    const refreshed = {
      ...readiness,
      evaluatedAt: '2026-10-28T12:00:00.000Z',
      items: readiness.items.map((item) => item.id === 'COMPANY_PROFILE'
        ? { ...item, explanation: 'Fresh profile authority is available.' }
        : item),
    };
    api.getCompanyOnboardingReadiness
      .mockResolvedValueOnce({ data: readiness })
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce({ data: refreshed });
    renderPanel(companyId);
    await screen.findByText('Profile authority is available.');
    const originalTimestamp = screen.getByText(/^Evaluated /).textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    rejectRefresh(new Error('temporary network failure'));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Displaying data from the previous successful evaluation.');
    expect(screen.getByText('Profile authority is available.')).toBeInTheDocument();
    expect(screen.getByText(/^Evaluated /)).toHaveTextContent(originalTimestamp!);
    fireEvent.click(within(warning).getByRole('button', { name: 'Retry refresh' }));

    expect(await screen.findByText('Fresh profile authority is available.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/previous successful evaluation/)).not.toBeInTheDocument());
    expect(screen.getByText(/^Evaluated /).textContent).not.toBe(originalTimestamp);
  });

  it.each([
    [401, 'Your session could not be authorized. Sign in again if the session refresh does not complete.'],
    [403, 'You do not have permission to view Company onboarding readiness.'],
    [404, 'Company onboarding readiness is unavailable because the Company was not found or has been archived.'],
  ])('renders a sanitized retryable HTTP %s state', async (status, message) => {
    api.getCompanyOnboardingReadiness.mockRejectedValue(Object.assign(new Error('sensitive detail'), { isAxiosError: true, response: { status } }));
    renderPanel(companyId);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent('sensitive detail');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.getCompanyOnboardingReadiness).toHaveBeenCalledTimes(2));
  });

  it.each([
    [new UnsupportedCompanyOnboardingReadinessContractError(), 'This readiness contract version is not supported. No readiness result is shown.'],
    [new InvalidCompanyOnboardingReadinessResponseError(), 'The readiness response was empty or invalid. No readiness result is shown.'],
    [new Error('private network detail'), 'Company onboarding readiness could not be loaded. Try again.'],
  ])('renders a sanitized contract or network failure', async (error, message) => {
    api.getCompanyOnboardingReadiness.mockRejectedValue(error);
    renderPanel(companyId);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent('private network detail');
  });

  it('shows an accessible initial loading state', () => {
    api.getCompanyOnboardingReadiness.mockImplementation(() => new Promise(() => undefined));
    renderPanel(companyId);
    expect(screen.getByLabelText('Loading Company onboarding readiness')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders only safe supported remediation routes', async () => {
    const unsafe = structuredClone(readiness);
    unsafe.items[1].remediation = { kind: 'NAVIGATE', label: 'Unsafe external action', route: 'https://evil.example/steal' };
    unsafe.items[2].remediation = { kind: 'NAVIGATE', label: 'Unsafe protocol-relative action', route: '//evil.example/steal' };
    unsafe.items[3].remediation = { kind: 'NAVIGATE', label: 'Unsupported internal action', route: '/settings/secrets' };
    api.getCompanyOnboardingReadiness.mockResolvedValue({ data: unsafe });
    renderPanel(companyId);
    expect(await screen.findByRole('link', { name: 'Review company' })).toHaveAttribute('href', `/organization/companies/${companyId}`);
    expect(screen.queryByText('Unsafe external action')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsafe protocol-relative action')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsupported internal action')).not.toBeInTheDocument();
  });
});

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function panelTree(id: string, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/organization/companies/${id}`]}>
        <Routes>
          <Route path="/organization/companies/:id" element={<CompanyOnboardingReadinessPanel companyId={id} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPanel(id: string) {
  return render(panelTree(id, createQueryClient()));
}
