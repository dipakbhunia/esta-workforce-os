import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { permissionsForRoles } from '@/features/auth/utils/permissions';
import { NavigationSearchDialog } from './NavigationSearchDialog';

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    roles: ['SUPER_ADMIN'],
    permissions: permissionsForRoles(['SUPER_ADMIN']),
  }),
}));

describe('NavigationSearchDialog behavior', () => {
  it('navigates a functional result without displaying Coming Soon', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText('Search pages, modules, settings...'), { target: { value: 'Plans & Pricing' } });

    expect(screen.getByText('Plans & Pricing')).toBeInTheDocument();
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Plans & Pricing in SaaS Management' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/saas/plans');
  });

  it('marks a placeholder result Coming Soon and navigates to its guarded placeholder path', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText('Search pages, modules, settings...'), { target: { value: 'Payments' } });

    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Payments in Billing' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/billing/payments');
  });
});

function renderDialog() {
  return render(
    <MemoryRouter>
      <NavigationSearchDialog open onClose={vi.fn()} />
      <CurrentPath />
    </MemoryRouter>,
  );
}

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}
