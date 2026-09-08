import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformPaymentFilterDraft } from './PlatformPaymentFilters';
import { PlatformPaymentFilters } from './PlatformPaymentFilters';

const blank: PlatformPaymentFilterDraft = { status: '', companyId: '', provider: '', mode: '', purpose: '', subscriptionId: '', from: '', to: '' };

describe('PlatformPaymentFilters', () => {
  it('does not include generic search and exposes the locked always-visible controls', () => {
    renderFilters(blank);
    expect(screen.queryByRole('textbox', { name: /search/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Payment Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Created from — inclusive')).toBeInTheDocument();
    expect(screen.getByLabelText('Created before — exclusive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it.each([
    ['partial', '2026-09-01T10:00', ''],
    ['equal', '2026-09-01T10:00', '2026-09-01T10:00'],
    ['reversed', '2026-09-01T11:00', '2026-09-01T10:00'],
    ['invalid', '2026-02-30T10:00', '2026-03-01T10:00'],
  ])('blocks Apply for a %s datetime range', (_, from, to) => {
    renderFilters({ ...blank, from, to });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByText(/Enter both dates/)).toBeInTheDocument();
  });

  it('exposes exact-ID and provider filters as draft-only controls', () => {
    const onChange = vi.fn(); renderFilters(blank, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced filters' }));
    fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: 'company-uuid' } });
    fireEvent.change(screen.getByLabelText('Subscription ID'), { target: { value: 'subscription-uuid' } });
    fireEvent.mouseDown(screen.getByLabelText('Provider')); fireEvent.click(screen.getByRole('option', { name: 'RAZORPAY' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-uuid' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 'subscription-uuid' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ provider: 'RAZORPAY' }));
  });

  it('delegates Apply, Clear, and Refresh without changing applied state itself', () => {
    const onApply = vi.fn(); const onClear = vi.fn(); const onRefresh = vi.fn();
    render(<PlatformPaymentFilters draft={blank} filtered fetching={false} summary="One payment" onChange={vi.fn()} onApply={onApply} onClear={onClear} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' })); fireEvent.click(screen.getByRole('button', { name: 'Clear' })); fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onApply).toHaveBeenCalledOnce(); expect(onClear).toHaveBeenCalledOnce(); expect(onRefresh).toHaveBeenCalledOnce();
  });

  it.each([
    ['status', () => { fireEvent.mouseDown(screen.getByLabelText('Payment Status')); fireEvent.click(screen.getByRole('option', { name: 'FAILED' })); }],
    ['advanced ID', () => { fireEvent.click(screen.getByRole('button', { name: 'Advanced filters' })); fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: 'draft-company' } }); }],
    ['partial datetime', () => fireEvent.change(screen.getByLabelText('Created from — inclusive'), { target: { value: '2026-09-01T10:00' } })],
  ])('enables Clear for a draft-only %s edit and clears it safely', (_, edit) => {
    render(<StatefulFilters />); edit();
    const clear = screen.getByRole('button', { name: 'Clear' }); expect(clear).toBeEnabled(); fireEvent.click(clear);
    const status = screen.getByRole('combobox', { name: 'Payment Status' });
    expect(status.parentElement?.querySelector('input')).toHaveValue('');
    expect(screen.getByLabelText('Created from — inclusive')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});

function renderFilters(draft: PlatformPaymentFilterDraft, onChange = vi.fn()) { return render(<PlatformPaymentFilters draft={draft} filtered={false} fetching={false} summary="No payments" onChange={onChange} onApply={vi.fn()} onClear={vi.fn()} onRefresh={vi.fn()} />); }
function StatefulFilters() { const [draft, setDraft] = useState(blank); return <PlatformPaymentFilters draft={draft} filtered={false} fetching={false} summary="No payments" onChange={setDraft} onApply={vi.fn()} onClear={() => setDraft(blank)} onRefresh={vi.fn()} />; }
