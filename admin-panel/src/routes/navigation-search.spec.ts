import { describe, expect, it } from 'vitest';
import type { Permission, RoleName } from '@/features/auth';
import { permissionsForRoles } from '@/features/auth/utils/permissions';
import { navigation } from './navigation';
import { buildNavigationSearchEntries, implementedNavPaths } from './navigation-search';

const functionalSuperAdminRoots = [
  '/',
  '/organization/companies',
  '/saas/plans',
  '/saas/subscriptions',
  '/saas/trials',
  '/saas/usage-seats',
  '/saas/storage',
  '/billing/settings',
];

const platformPlaceholders = [
  '/billing/payments',
  '/billing/invoices',
  '/billing/gst-invoices',
  '/billing/renewals',
  '/platform-communication/email-configuration',
  '/platform-communication/email-templates',
  '/platform-communication/email-delivery-logs',
  '/platform/access/users',
  '/platform/access/roles-permissions',
  '/platform/access/audit-logs',
  '/platform/reports/revenue',
  '/platform/reports/subscriptions',
  '/platform/reports/usage',
  '/platform/reports/tenants',
  '/platform/settings',
  '/platform/settings/branding',
  '/platform/settings/security',
  '/platform/settings/storage-limits',
];

const dynamicRoutes = [
  '/organization/companies/:id',
  '/saas/plans/:id',
  '/saas/plans/:id/edit',
  '/saas/subscriptions/:id',
  '/saas/subscriptions/:id/amend',
  '/saas/trials/:id',
  '/saas/trials/:id/convert',
  '/saas/usage-seats/:companyId',
  '/saas/storage/:companyId',
];

describe('navigation search indexing', () => {
  it('keeps exactly 41 implemented stable navigation roots', () => {
    expect(implementedNavPaths.size).toBe(41);
  });

  it('classifies all functional Super Admin roots as implemented navigation destinations', () => {
    const entries = entriesFor(['SUPER_ADMIN']);

    for (const path of functionalSuperAdminRoots) {
      expect(entries.find((entry) => entry.path === path), path).toMatchObject({ path, comingSoon: false });
    }
  });

  it('keeps every platform placeholder classified as Coming Soon', () => {
    const entries = entriesFor(['SUPER_ADMIN']);

    for (const path of platformPlaceholders) {
      expect(entries.find((entry) => entry.path === path), path).toMatchObject({ path, comingSoon: true });
    }
  });

  it.each<RoleName>(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'])(
    'makes Downloads searchable for %s through the shared route policy',
    (role) => {
      expect(entriesFor([role]).some((entry) => entry.path === '/downloads')).toBe(true);
    },
  );

  it('preserves platform and tenant role isolation', () => {
    const superAdminPaths = pathsFor(['SUPER_ADMIN']);
    expect(superAdminPaths).toContain('/saas/plans');
    expect(superAdminPaths).not.toContain('/organization/branches');
    expect(superAdminPaths).not.toContain('/attendance');
    expect(superAdminPaths).not.toContain('/monitoring/live-status');

    for (const role of ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] satisfies RoleName[]) {
      const tenantPaths = pathsFor([role]);
      expect(tenantPaths).not.toContain('/organization/companies');
      expect(tenantPaths).not.toContain('/saas/plans');
      expect(tenantPaths).not.toContain('/billing/settings');
      expect(tenantPaths).not.toContain('/platform/settings');
    }
  });

  it('requires permission as well as an eligible role', () => {
    const entries = buildNavigationSearchEntries(navigation, [] as Permission[], ['SUPER_ADMIN']);
    expect(entries).toEqual([]);
  });

  it('does not produce duplicate paths in any role index', () => {
    for (const role of ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] satisfies RoleName[]) {
      const paths = pathsFor([role]);
      expect(new Set(paths).size, role).toBe(paths.length);
    }
  });

  it('indexes stable navigation roots and excludes dynamic detail, create, edit, amend, and convert routes', () => {
    const paths = pathsFor(['SUPER_ADMIN']);
    for (const path of functionalSuperAdminRoots) expect(paths).toContain(path);
    for (const path of dynamicRoutes) expect(paths).not.toContain(path);
  });

  it('keeps every functional Super Admin search root backed by a declared navigation destination', () => {
    const declaredPaths = navigation.flatMap((group) => [
      ...(group.path ? [group.path] : []),
      ...(group.children?.map((item) => item.path) ?? []),
    ]);

    for (const path of functionalSuperAdminRoots) expect(declaredPaths).toContain(path);
  });
});

function entriesFor(roles: RoleName[]) {
  return buildNavigationSearchEntries(navigation, permissionsForRoles(roles), roles);
}

function pathsFor(roles: RoleName[]) {
  return entriesFor(roles).map((entry) => entry.path);
}
