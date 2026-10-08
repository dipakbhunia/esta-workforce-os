import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../platform-access-api', async (original) => ({ ...(await original<typeof import('../platform-access-api')>()), createPlatformUser: create }));
import { CreatePlatformUserDialog } from './CreatePlatformUserDialog';

const roles = [{ id: 'role-1', companyId: null, key: 'super_admin', name: 'Super Admin', description: null, systemName: 'SUPER_ADMIN' as const, createdAt: '', updatedAt: '', permissions: [], _count: { users: 1 } }];
describe('CreatePlatformUserDialog', () => {
  beforeEach(() => { create.mockReset().mockResolvedValue({ data: {} }); });
  it('validates required role and explains invitation activation', () => { renderDialog(); fireEvent.click(screen.getByRole('button', { name: 'Send Invitation' })); expect(screen.getByText('Select at least one global role.')).toBeInTheDocument(); expect(screen.getByText(/remains inactive until/i)).toBeInTheDocument(); });
  it('sends only invitation fields and prevents duplicate submission', async () => { let resolve!: (value: unknown) => void; create.mockImplementation(() => new Promise((done) => { resolve = done; })); const { onClose } = renderDialog(); const dialog = screen.getByRole('dialog'); fillValidForm(dialog); fireEvent.click(within(dialog).getByRole('button', { name: 'Send Invitation' })); await waitFor(() => expect(create.mock.calls[0]?.[0]).toEqual({ email: 'admin@example.invalid', firstName: 'Admin', lastName: 'User', roleIds: ['role-1'] })); expect(within(dialog).getByRole('button', { name: 'Inviting…' })).toBeDisabled(); expect(create).toHaveBeenCalledTimes(1); resolve({ data: {} }); await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1)); });
  it('keeps the dialog open with a safe duplicate-email error', async () => { create.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'database detail' } } }); renderDialog(); const dialog = screen.getByRole('dialog'); fillValidForm(dialog); fireEvent.click(within(dialog).getByRole('button', { name: 'Send Invitation' })); expect(await screen.findByText(/already assigned/)).toBeInTheDocument(); expect(screen.queryByText('database detail')).not.toBeInTheDocument(); expect(screen.getByRole('dialog')).toBeInTheDocument(); });
});
function renderDialog() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); const onClose = vi.fn(); function Harness() { const [open, setOpen] = useState(true); return <CreatePlatformUserDialog open={open} roles={roles} onClose={() => { onClose(); setOpen(false); }} />; } const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); return { ...view, onClose }; }
function fillValidForm(dialog: HTMLElement) { fireEvent.change(within(dialog).getByLabelText('Email *'), { target: { value: ' admin@example.invalid ' } }); fireEvent.change(within(dialog).getByLabelText('First name *'), { target: { value: ' Admin ' } }); fireEvent.change(within(dialog).getByLabelText('Last name *'), { target: { value: ' User ' } }); fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Super Admin' })); }
