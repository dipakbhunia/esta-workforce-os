import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCompanySeatUsage: vi.fn() }));
vi.mock('./usage-seats-api', () => ({ getCompanySeatUsage: api.getCompanySeatUsage }));

import CompanySeatDetailsPage from './CompanySeatDetailsPage';

describe('CompanySeatDetailsPage billable User presentation', () => {
  it('renders authoritative User fields without inventing Employee navigation', async () => {
    api.getCompanySeatUsage.mockResolvedValue({ data: {
      company: { id: 'company-1', name: 'Acme', slug: 'acme', status: 'ACTIVE' },
      commercial: { source: 'SUBSCRIPTION', referenceId: 'sub-1', commercialStatus: 'ACTIVE', plan: null, capacity: 10, allocationAllowed: true },
      seats: { used: 1, remaining: 9, overBy: 0, utilizationPercent: 10, isOverLimit: false, capacityState: 'AVAILABLE' },
      asOf: new Date().toISOString(),
      consumers: { data: [{ id: 'user-1', email: 'tenant@example.test', status: 'ACTIVE', name: 'Tenant User', roles: ['HR', 'EMPLOYEE'], department: null, designation: null }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/usage-seats/company-1']}><Routes><Route path="/usage-seats/:companyId" element={<CompanySeatDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('Tenant User')).toBeInTheDocument();
    expect(screen.getByText('tenant@example.test')).toBeInTheDocument();
    expect(screen.getByText('HR, EMPLOYEE')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view employee/i })).not.toBeInTheDocument();
  });
});
