import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleName } from '@/features/auth';
import DashboardPage from './DashboardPage';

let roles: RoleName[] = [];

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ roles }),
}));

vi.mock('./PlatformDashboardPage', () => ({
  default: () => <div>Platform dashboard shell</div>,
}));

vi.mock('./TenantDashboardPage', () => ({
  default: () => <div>Tenant dashboard</div>,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    roles = [];
  });

  it('dispatches SUPER_ADMIN to the platform dashboard', () => {
    roles = ['SUPER_ADMIN'];
    render(<DashboardPage />);

    expect(screen.getByText('Platform dashboard shell')).toBeInTheDocument();
    expect(screen.queryByText('Tenant dashboard')).not.toBeInTheDocument();
  });

  it.each<RoleName>(['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'])(
    'preserves the tenant dashboard for %s',
    (role) => {
      roles = [role];
      render(<DashboardPage />);

      expect(screen.getByText('Tenant dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Platform dashboard shell')).not.toBeInTheDocument();
    },
  );
});
