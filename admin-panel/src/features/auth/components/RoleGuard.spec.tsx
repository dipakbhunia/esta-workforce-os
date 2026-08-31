import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission, RoleName } from '../types/auth.types';
import { permissionsForRoles } from '../utils/permissions';
import {
  PLATFORM_ROLES,
  SHARED_ROLES,
  TENANT_ADMIN_ROLES,
  TENANT_MANAGER_ROLES,
  TENANT_ROLES,
} from '../utils/route-policy';
import { RoleGuard } from './RoleGuard';

let roles: RoleName[] = [];

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles, permissions: permissionsForRoles(roles) }),
}));

interface DirectRouteCase {
  path: string;
  permission: Permission;
  allowedRoles: readonly RoleName[];
}

const platformRoutes: DirectRouteCase[] = [
  { path: '/organization/companies', permission: 'companies:manage', allowedRoles: PLATFORM_ROLES },
  { path: '/saas/plans', permission: 'settings:view', allowedRoles: PLATFORM_ROLES },
  { path: '/billing/settings', permission: 'settings:view', allowedRoles: PLATFORM_ROLES },
  { path: '/billing/payments', permission: 'settings:view', allowedRoles: PLATFORM_ROLES },
];

const tenantRoutes: DirectRouteCase[] = [
  { path: '/organization/branches', permission: 'branches:view', allowedRoles: TENANT_ADMIN_ROLES },
  { path: '/people/employees', permission: 'employees:view', allowedRoles: TENANT_ROLES },
  { path: '/attendance', permission: 'attendance:view', allowedRoles: TENANT_ROLES },
  { path: '/attendance/break-policies', permission: 'attendance:manage', allowedRoles: TENANT_ADMIN_ROLES },
  { path: '/scheduling/shifts', permission: 'shifts:view', allowedRoles: TENANT_ADMIN_ROLES },
  { path: '/monitoring/live-status', permission: 'monitoring:view', allowedRoles: TENANT_ROLES },
  { path: '/monitoring/productivity/analytics', permission: 'monitoring:view', allowedRoles: TENANT_ROLES },
  { path: '/monitoring/operations', permission: 'monitoring:view', allowedRoles: TENANT_MANAGER_ROLES },
  { path: '/reports', permission: 'reports:view', allowedRoles: TENANT_ROLES },
  { path: '/settings', permission: 'settings:view', allowedRoles: TENANT_ROLES },
  { path: '/projects/tasks', permission: 'dashboard:view', allowedRoles: TENANT_ROLES },
];

const sharedRoutes: DirectRouteCase[] = [
  { path: '/', permission: 'dashboard:view', allowedRoles: SHARED_ROLES },
  { path: '/notifications', permission: 'monitoring:view', allowedRoles: SHARED_ROLES },
  { path: '/notifications/preferences', permission: 'settings:view', allowedRoles: SHARED_ROLES },
  { path: '/downloads', permission: 'dashboard:view', allowedRoles: SHARED_ROLES },
];

describe('RoleGuard direct-entry policy', () => {
  beforeEach(() => {
    roles = [];
  });

  it.each([...platformRoutes, ...sharedRoutes])('allows SUPER_ADMIN at $path', (route) => {
    roles = ['SUPER_ADMIN'];
    renderDirectRoute(route);
    expect(screen.getByTestId('protected-page')).toBeInTheDocument();
  });

  it.each(tenantRoutes)('denies SUPER_ADMIN at tenant route $path', (route) => {
    roles = ['SUPER_ADMIN'];
    renderDirectRoute(route);
    expect(screen.getByText('Access restricted')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
  });

  it.each(platformRoutes)('denies every tenant role at platform route $path', (route) => {
    for (const role of TENANT_ROLES) {
      roles = [role];
      const view = renderDirectRoute(route);
      expect(screen.getByText('Access restricted')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('preserves representative tenant access boundaries', () => {
    expectAccess('/organization/branches', 'branches:view', TENANT_ADMIN_ROLES, 'COMPANY_ADMIN', true);
    expectAccess('/organization/branches', 'branches:view', TENANT_ADMIN_ROLES, 'HR', true);
    expectAccess('/organization/branches', 'branches:view', TENANT_ADMIN_ROLES, 'MANAGER', false);
    expectAccess('/people/employees', 'employees:view', TENANT_ROLES, 'MANAGER', true);
    expectAccess('/people/employees', 'employees:view', TENANT_ROLES, 'EMPLOYEE', true);
    expectAccess('/monitoring/operations', 'monitoring:view', TENANT_MANAGER_ROLES, 'MANAGER', true);
    expectAccess('/monitoring/operations', 'monitoring:view', TENANT_MANAGER_ROLES, 'EMPLOYEE', false);
  });

  it('does not mount or run effects in a denied child', () => {
    roles = ['SUPER_ADMIN'];
    const dataFetch = vi.fn();

    function DataPage() {
      useEffect(dataFetch, []);
      return <div data-testid="protected-page">Tenant data</div>;
    }

    renderDirectRoute(tenantRoutes[0], <DataPage />);
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    expect(dataFetch).not.toHaveBeenCalled();
  });
});

function renderDirectRoute(route: DirectRouteCase, child = <div data-testid="protected-page">Protected page</div>) {
  return render(
    <MemoryRouter initialEntries={[route.path]}>
      <Routes>
        <Route
          path={route.path}
          element={<RoleGuard permission={route.permission} roles={[...route.allowedRoles]}>{child}</RoleGuard>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function expectAccess(path: string, permission: Permission, allowedRoles: readonly RoleName[], role: RoleName, allowed: boolean) {
  roles = [role];
  const view = renderDirectRoute({ path, permission, allowedRoles });
  expect(Boolean(screen.queryByTestId('protected-page'))).toBe(allowed);
  view.unmount();
}
