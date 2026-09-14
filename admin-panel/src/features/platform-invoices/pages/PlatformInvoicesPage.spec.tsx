import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PlatformInvoicesPage from './PlatformInvoicesPage';

describe('PlatformInvoicesPage foundation', () => {
  it('renders an accurate operational shell without later-checkpoint controls', () => {
    render(<MemoryRouter><PlatformInvoicesPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByText(/Invoice records are available/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Issue Invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
