import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlatformAuditFilters } from './PlatformAuditFilters';

describe('PlatformAuditFilters', () => {
  it('associates exact supported fields and exposes Apply, Reset, and Refresh', () => { const change = vi.fn(); const apply = vi.fn(); const reset = vi.fn(); const refresh = vi.fn(); render(<PlatformAuditFilters draft={{ action: '', entityType: '', actorUserId: '' }} filtered={false} fetching={false} summary="No records" onChange={change} onApply={apply} onReset={reset} onRefresh={refresh} />); for (const name of ['Action', 'Entity Type', 'Actor User ID']) expect(screen.getByRole('textbox', { name })).toBeInTheDocument(); fireEvent.change(screen.getByRole('textbox', { name: 'Action' }), { target: { value: 'AUTH_LOGIN' } }); expect(change).toHaveBeenCalledWith({ action: 'AUTH_LOGIN', entityType: '', actorUserId: '' }); fireEvent.click(screen.getByRole('button', { name: 'Apply' })); fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); expect(apply).toHaveBeenCalled(); expect(refresh).toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled(); });
});
