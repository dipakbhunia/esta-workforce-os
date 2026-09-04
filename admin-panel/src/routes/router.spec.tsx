import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleName } from '@/features/auth';
import { permissionsForRoles } from '@/features/auth/utils/permissions';

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

  it('keeps Payments Coming Soon while describing the implemented backend and unavailable operations accurately', async () => {
    await router.navigate('/billing/payments');
    const view = renderRouter();

    expect(await screen.findByRole('heading', { name: 'Payments' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coming Soon' })).toBeInTheDocument();
    expect(screen.getByText(/checkout signature confirmation/)).toBeInTheDocument();
    expect(screen.getByText(/verified webhook payment-truth processing/)).toBeInTheDocument();
    expect(screen.getByText(/activation of eligible subscriptions from CAPTURED payment truth/)).toBeInTheDocument();
    expect(screen.getByText(/Payment management and browser checkout remain unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Provider payment fetch or polling, active capture operations/)).toBeInTheDocument();
    expect(screen.getByText(/LIVE Razorpay order execution, settlement, and renewal orchestration/)).toBeInTheDocument();
    expect(screen.getByText(/refund actions are not available/)).toBeInTheDocument();
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
