import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleName } from '@/features/auth';
import { permissionsForRoles } from '@/features/auth/utils/permissions';
import { getRouteMeta } from './routeMeta';

let roles: RoleName[] = ['SUPER_ADMIN'];

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    authenticated: true,
    loading: false,
    roles,
    permissions: permissionsForRoles(roles),
    user: { id: 'test-user', companyId: null, email: 'test@example.invalid', firstName: 'Test', lastName: 'User' },
    logout: vi.fn(),
  }),
}));

vi.mock('@/features/notifications/services/notifications-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/notifications/services/notifications-api')>()),
  getNotificationUnreadCount: vi.fn().mockResolvedValue({ data: { unread: 0 } }),
}));

import { router } from './router';

const superAdminDeniedPaths = [
  '/organization/branches',
  '/people/employees',
  '/attendance',
  '/attendance/break-policies',
  '/scheduling/shifts',
  '/monitoring/live-status',
  '/monitoring/productivity/analytics',
  '/reports',
  '/settings',
  '/projects/tasks',
];

const tenantDeniedPlatformPaths = [
  '/organization/companies',
  '/saas/plans',
  '/billing/settings',
  '/billing/payments',
  '/billing/invoices',
  '/billing/gst-invoices',
  '/billing/renewals',
  '/billing/renewals/11111111-1111-4111-8111-111111111111',
  '/billing/dunning',
  '/billing/dunning/11111111-1111-4111-8111-111111111111',
  '/platform/access/roles-permissions',
];

describe('application router direct-entry isolation', () => {
  beforeEach(() => {
    roles = ['SUPER_ADMIN'];
  });

  it.each(superAdminDeniedPaths)('denies SUPER_ADMIN at actual tenant route %s', async (path) => {
    await router.navigate(path);
    const view = renderRouter();
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    view.unmount();
  });

  it.each(tenantDeniedPlatformPaths)('denies COMPANY_ADMIN at actual platform route %s', async (path) => {
    roles = ['COMPANY_ADMIN'];
    await router.navigate(path);
    const view = renderRouter();
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    view.unmount();
  });

  it('keeps an unknown authenticated route on the Not Found surface', async () => {
    await router.navigate('/definitely-unknown');
    const view = renderRouter();
    expect(await screen.findByText('This admin page does not exist yet.')).toBeInTheDocument();
    expect(screen.queryByText('Access restricted')).not.toBeInTheDocument();
    view.unmount();
  });

  it('routes Payments to the implemented read-only foundation instead of Coming Soon', async () => {
    await router.navigate('/billing/payments');
    const view = renderRouter();

    expect(await screen.findByRole('heading', { name: 'Payments' }, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only operational payment history/)).toBeInTheDocument();
    view.unmount();
  });

  it('routes read-only Payment details and keeps the platform-only boundary', async () => {
    expect(getRouteMeta('/billing/payments/11111111-1111-4111-8111-111111111111')).toEqual({
      title: 'Payment Details',
      breadcrumbs: ['Billing', 'Payments', 'Details'],
      moduleName: 'Billing',
      canonicalPath: '/billing/payments/:id',
    });
    await router.navigate('/billing/payments/11111111-1111-4111-8111-111111111111');
    const superView = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Payment Details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Payments' })).toHaveAttribute('href', '/billing/payments');
    superView.unmount();

    roles = ['COMPANY_ADMIN'];
    await router.navigate('/billing/payments/11111111-1111-4111-8111-111111111111');
    const tenantView = renderRouter();
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    tenantView.unmount();
  });

  it('routes Invoices to the operational foundation and protects Invoice details', async () => {
    await router.navigate('/billing/invoices');
    const listView = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    listView.unmount();

    expect(getRouteMeta('/billing/invoices/11111111-1111-4111-8111-111111111111')).toEqual({
      title: 'Invoice Details', breadcrumbs: ['Billing', 'Invoices', 'Details'], moduleName: 'Billing', canonicalPath: '/billing/invoices/:invoiceId',
    });
    await router.navigate('/billing/invoices/11111111-1111-4111-8111-111111111111');
    const detailsView = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Invoice Details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Invoices' })).toHaveAttribute('href', '/billing/invoices');
    detailsView.unmount();

    roles = ['COMPANY_ADMIN'];
    await router.navigate('/billing/invoices/11111111-1111-4111-8111-111111111111');
    const tenantView = renderRouter();
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    tenantView.unmount();
  });

  it('routes GST Invoices to the implemented Super Admin workspace', async () => {
    await router.navigate('/billing/gst-invoices');
    const view = renderRouter();
    expect(await screen.findByRole('heading', { name: 'GST Invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'GST Transactions' })).toBeInTheDocument();
    view.unmount();
  });

  it('routes Renewals to the functional Super Admin register', async () => {
    await router.navigate('/billing/renewals');
    const view = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Renewals' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    view.unmount();
  });

  it('routes read-only Renewal details with platform metadata', async () => {
    expect(getRouteMeta('/billing/renewals/11111111-1111-4111-8111-111111111111')).toEqual({
      title: 'Renewal Details', breadcrumbs: ['Billing', 'Renewals', 'Details'], moduleName: 'Billing', canonicalPath: '/billing/renewals/:renewalId',
    });
    await router.navigate('/billing/renewals/11111111-1111-4111-8111-111111111111');
    const view = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Renewal Details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Renewals' })).toHaveAttribute('href', '/billing/renewals');
    view.unmount();
  });

  it('routes Dunning to the open register and reserves details metadata', async () => {
    await router.navigate('/billing/dunning');
    const view = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Dunning' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    view.unmount();
    expect(getRouteMeta('/billing/dunning/11111111-1111-4111-8111-111111111111')).toEqual({
      title: 'Dunning Details', breadcrumbs: ['Billing', 'Dunning', 'Details'], moduleName: 'Billing', canonicalPath: '/billing/dunning/:renewalId',
    });
    await router.navigate('/billing/dunning/11111111-1111-4111-8111-111111111111');
    const detailView = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Dunning Details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Dunning' })).toHaveAttribute('href', '/billing/dunning');
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    detailView.unmount();
  });

  it('routes Roles & Permissions to the read-only platform authority', async () => {
    await router.navigate('/platform/access/roles-permissions');
    const view = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Roles & Permissions' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only reference/)).toBeInTheDocument();
    view.unmount();
  });

  it('routes Audit Logs to the guarded read-only platform authority', async () => {
    await router.navigate('/platform/access/audit-logs');
    const view = renderRouter();
    expect(await screen.findByRole('heading', { name: 'Audit Logs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only platform audit evidence/)).toBeInTheDocument();
    view.unmount();
  });

  it('does not introduce a /platform-payments frontend route', async () => {
    await router.navigate('/platform-payments');
    const view = renderRouter();
    expect(await screen.findByText('This admin page does not exist yet.')).toBeInTheDocument();
    view.unmount();
  });
});

function renderRouter() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
