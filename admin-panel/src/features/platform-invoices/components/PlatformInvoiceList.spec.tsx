import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformInvoiceSummary } from '../platform-invoices.types';
import { PlatformInvoiceList } from './PlatformInvoiceList';
const invoice: PlatformInvoiceSummary = { id: '11111111-1111-4111-8111-111111111111', invoiceNumber: 'INV/2026/000001', companyId: '22222222-2222-4222-8222-222222222222', subscriptionId: '33333333-3333-4333-8333-333333333333', sourcePaymentId: '44444444-4444-4444-8444-444444444444', issuedAt: '2026-09-01T00:00:00.000Z', dueAt: null, currency: 'INR', subtotalMinor: '9007199254740991', totalMinor: '9007199254740991', servicePeriodStart: '2026-09-01T00:00:00.000Z', servicePeriodEnd: '2026-10-01T00:00:00.000Z' };
describe('PlatformInvoiceList', () => {
  it('renders exact API evidence in responsive presentations and details links', () => { renderList([invoice]); expect(screen.getAllByText('INR 90071992547409.91').length).toBeGreaterThan(0); expect(screen.getAllByText(/INV\/2026\/000001/).length).toBeGreaterThan(0); expect(screen.getAllByRole('link', { name: 'View Details' })[0]).toHaveAttribute('href', `/billing/invoices/${invoice.id}`); for (const unsupported of ['Paid', 'Unpaid', 'Overdue', 'GST', 'Company name', 'Plan name']) expect(screen.queryByText(unsupported)).not.toBeInTheDocument(); });
  it.each([[false, 'No Invoice records available.'], [true, 'No invoices match the applied filters.']] as const)('renders bounded empty state', (filtered, title) => { renderList([], filtered); expect(screen.getAllByText(title).length).toBeGreaterThan(0); });
  it('uses server total without client-side slicing', () => { render(<MemoryRouter><PlatformInvoiceList rows={[invoice]} total={101} page={2} limit={20} loading={false} filtered={false} onPaginationChange={vi.fn()} /></MemoryRouter>); expect(screen.getAllByText(/21–40 of 101/).length).toBeGreaterThan(0); });
  it('renders structured loading instead of the register', () => { render(<MemoryRouter><PlatformInvoiceList rows={[]} total={0} page={1} limit={20} loading filtered={false} onPaginationChange={vi.fn()} /></MemoryRouter>); expect(screen.queryByText('Invoice Register')).not.toBeInTheDocument(); });
});
function renderList(rows: PlatformInvoiceSummary[], filtered = false) { return render(<MemoryRouter><PlatformInvoiceList rows={rows} total={rows.length} page={1} limit={20} loading={false} filtered={filtered} onPaginationChange={vi.fn()} /></MemoryRouter>); }
