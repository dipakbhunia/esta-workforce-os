import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlatformDunningFilters, type PlatformDunningFilterDraft } from './PlatformDunningFilters';
const empty: PlatformDunningFilterDraft = { companyId: '', subscriptionId: '', renewalId: '', paymentId: '', paymentStatus: '', from: '', to: '' };
describe('PlatformDunningFilters', () => {
  it('exposes labelled controls and applies changes only through callbacks', () => { const onChange = vi.fn(), onApply = vi.fn(); render(<PlatformDunningFilters draft={empty} filtered={false} fetching={false} summary="0 records" onChange={onChange} onApply={onApply} onClear={vi.fn()} onRefresh={vi.fn()} />); fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: 'company' } }); expect(onChange).toHaveBeenCalledWith({ ...empty, companyId: 'company' }); expect(onApply).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Apply' })); expect(onApply).toHaveBeenCalled(); expect(screen.getByLabelText('Payment Status')).toBeInTheDocument(); });
  it('disables Apply for a partial date range', () => { render(<PlatformDunningFilters draft={{ ...empty, from: '2026-01-01T00:00' }} filtered fetching={false} summary="0 records" onChange={vi.fn()} onApply={vi.fn()} onClear={vi.fn()} onRefresh={vi.fn()} />); expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); });
});
