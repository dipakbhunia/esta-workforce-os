import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ROLES,
  SHARED_ROLES,
  TENANT_ADMIN_ROLES,
  TENANT_MANAGER_ROLES,
  TENANT_ROLES,
  TENANT_WORKFORCE_ROLES,
} from './route-policy';

describe('route role policy', () => {
  it('isolates platform administration to SUPER_ADMIN', () => {
    expect(PLATFORM_ROLES).toEqual(['SUPER_ADMIN']);
  });

  it('contains every tenant system role and excludes SUPER_ADMIN', () => {
    expect(TENANT_ROLES).toEqual(['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']);
    expect(TENANT_ROLES).not.toContain('SUPER_ADMIN');
  });

  it('keeps shared authenticated routes available to every system role', () => {
    expect(SHARED_ROLES).toEqual(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']);
  });

  it('preserves the existing narrower tenant boundaries', () => {
    expect(TENANT_ADMIN_ROLES).toEqual(['COMPANY_ADMIN', 'HR']);
    expect(TENANT_MANAGER_ROLES).toEqual(['COMPANY_ADMIN', 'HR', 'MANAGER']);
    expect(TENANT_WORKFORCE_ROLES).toEqual(TENANT_ROLES);
  });

  it('does not introduce TEAM_LEAD as a runtime role', () => {
    expect([...PLATFORM_ROLES, ...TENANT_ROLES, ...SHARED_ROLES]).not.toContain('TEAM_LEAD');
  });
});
