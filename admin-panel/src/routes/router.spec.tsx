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
