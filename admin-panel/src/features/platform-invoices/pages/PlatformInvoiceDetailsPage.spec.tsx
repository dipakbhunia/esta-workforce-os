import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PlatformInvoiceDetailsPage from './PlatformInvoiceDetailsPage';

describe('PlatformInvoiceDetailsPage foundation', () => {
  it('resolves route context and back navigation without fetching details', () => {
    render(<MemoryRouter initialEntries={['/billing/invoices/11111111-1111-4111-8111-111111111111']}><Routes><Route path="/billing/invoices/:invoiceId" element={<PlatformInvoiceDetailsPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Invoice Details' })).toBeInTheDocument();
    expect(screen.getByText(/11111111-1111-4111-8111-111111111111/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Invoices' })).toHaveAttribute('href', '/billing/invoices');
  });
});
