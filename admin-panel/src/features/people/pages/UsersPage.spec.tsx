import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUsers, getManageableRoles, inviteUser } = vi.hoisted(() => ({ getUsers: vi.fn(), getManageableRoles: vi.fn(), inviteUser: vi.fn() }));
vi.mock('../services/users-api', () => ({ getUsers, getManageableRoles, inviteUser }));
import UsersPage from './UsersPage';

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><UsersPage /></MemoryRouter></QueryClientProvider>);

describe('UsersPage tenant invitations', () => {
  beforeEach(() => { vi.clearAllMocks(); getUsers.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } } }); getManageableRoles.mockResolvedValue({ data: { data: [{ id: 'role-1', name: 'Employee', systemName: 'EMPLOYEE' }], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } } }); inviteUser.mockResolvedValue({ data: { id: 'user-1', invitationQueued: true } }); });
  it('submits invitation-only tenant user fields', async () => {
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Invite User' }));
    const dialog = screen.getByRole('dialog'); await within(dialog).findByRole('checkbox', { name: 'Employee' });
    fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: ' tenant@example.test ' } });
    fireEvent.change(within(dialog).getByLabelText(/^First name/), { target: { value: ' Tenant ' } });
    fireEvent.change(within(dialog).getByLabelText(/^Last name/), { target: { value: ' User ' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Employee' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Send Invitation' }));
    await waitFor(() => expect(inviteUser.mock.calls[0]?.[0]).toEqual({ email: 'tenant@example.test', firstName: 'Tenant', lastName: 'User', roleIds: ['role-1'] }));
  });
});
