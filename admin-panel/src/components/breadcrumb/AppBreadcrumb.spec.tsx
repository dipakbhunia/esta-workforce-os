import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppBreadcrumb } from './AppBreadcrumb';

describe('AppBreadcrumb', () => {
  it('links an explicit intermediate route and keeps the current item as text', () => {
    render(<MemoryRouter><AppBreadcrumb items={['Billing', { label: 'Renewals', to: '/billing/renewals' }, 'Details']} /></MemoryRouter>);
    expect(screen.getByText('Billing')).not.toHaveAttribute('href');
    expect(screen.getByRole('link', { name: 'Renewals' })).toHaveAttribute('href', '/billing/renewals');
    expect(screen.getByText('Details')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument();
  });

  it('preserves existing string-only breadcrumb behavior', () => {
    render(<MemoryRouter><AppBreadcrumb items={['Admin', 'Billing', 'Payments']} /></MemoryRouter>);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('Payments')).toHaveAttribute('aria-current', 'page');
  });
});
