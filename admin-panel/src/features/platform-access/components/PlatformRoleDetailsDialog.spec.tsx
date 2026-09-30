import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getRole } = vi.hoisted(() => ({ getRole: vi.fn() }));
vi.mock('../platform-access-api', async (original) => ({ ...(await original<typeof import('../platform-access-api')>()), getPlatformRole: getRole }));
import { PlatformRoleDetailsDialog } from './PlatformRoleDetailsDialog';

const role = { id: 'role-1', companyId: null, key: 'super_admin', name: 'Super Admin', description: 'Platform administration', systemName: 'SUPER_ADMIN', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', permissions: [{ assignedAt: '2026-01-03T00:00:00Z', permission: { id: 'permission-1', key: 'people:manage', description: 'Manage people' } }], _count: { users: 2 } };
describe('PlatformRoleDetailsDialog', () => {
  beforeEach(() => { getRole.mockReset().mockResolvedValue({ data: role }); });
  it('announces initial detail loading', () => { getRole.mockImplementation(() => new Promise(() => undefined)); renderDialog(); expect(screen.getByRole('status', { name: 'Loading role details' })).toBeInTheDocument(); });
  it('fetches role details and presents complete read-only authority evidence', async () => { renderDialog(); const dialog = await screen.findByRole('dialog', { name: 'Role Details' }); await within(dialog).findByText('Super Admin'); for (const value of ['super_admin', 'SUPER_ADMIN', 'Platform administration', 'people:manage', 'Manage people', 'Assigned Permissions (1)', 'Read-only reference']) expect(dialog).toHaveTextContent(value); expect(getRole).toHaveBeenCalledWith('role-1'); expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument(); expect(within(dialog).queryByRole('button', { name: /save|edit|assign|delete/i })).not.toBeInTheDocument(); });
  it('keeps a sanitized detail error local and supports retry', async () => { getRole.mockRejectedValueOnce(new Error('secret detail')).mockResolvedValueOnce({ data: role }); renderDialog(); const dialog = await screen.findByRole('dialog', { name: 'Role Details' }); expect(await within(dialog).findByText(/could not be loaded/i)).toBeInTheDocument(); expect(within(dialog).queryByText('secret detail')).not.toBeInTheDocument(); fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' })); await waitFor(() => expect(getRole).toHaveBeenCalledTimes(2)); expect(await within(dialog).findByText('Super Admin')).toBeInTheDocument(); });
  it('shows the empty assignment state', async () => { getRole.mockResolvedValue({ data: { ...role, permissions: [] } }); renderDialog(); expect(await screen.findByText('No permission metadata is assigned to this role.')).toBeInTheDocument(); });
});
function renderDialog() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><PlatformRoleDetailsDialog open roleId="role-1" onClose={vi.fn()} /></QueryClientProvider>); }
