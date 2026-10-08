import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountActionPage from './AccountActionPage';
import ForgotPasswordPage from './ForgotPasswordPage';

const api = vi.hoisted(() => ({ forgot: vi.fn(), activate: vi.fn(), reset: vi.fn() }));
vi.mock('../services/auth-api', async (original) => ({
  ...(await original<typeof import('../services/auth-api')>()),
  requestPasswordReset: api.forgot,
  activateAccount: api.activate,
  completePasswordReset: api.reset,
}));

describe('public identity entry pages', () => {
  beforeEach(() => { vi.clearAllMocks(); api.forgot.mockResolvedValue({ data: { accepted: true } }); api.activate.mockResolvedValue({ data: { success: true } }); api.reset.mockResolvedValue({ data: { success: true } }); });

  it('uses an enumeration-safe forgot-password success message', async () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
    await screen.findByText(/if an eligible account exists/i);
    expect(api.forgot).toHaveBeenCalledWith('user@example.com');
  });

  it('shows a generic accessible error, retains email, and succeeds on retry', async () => {
    api.forgot.mockRejectedValueOnce(new Error('private backend detail')).mockResolvedValueOnce({ data: { accepted: true } });
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The request could not be completed. Please try again.');
    expect(alert).not.toHaveTextContent('private backend detail');
    expect(email).toHaveValue('user@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Request reset link' }));
    expect(await screen.findByText(/if an eligible account exists/i)).toBeInTheDocument();
    expect(api.forgot).toHaveBeenCalledTimes(2);
  });

  it('submits activation token and matching passwords without displaying the token', async () => {
    render(<MemoryRouter initialEntries={['/activate-account?token=private-token-value']}><Routes><Route path="/activate-account" element={<AccountActionPage mode="activate" />} /></Routes></MemoryRouter>);
    expect(screen.queryByText('private-token-value')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'secure-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate account' }));
    await waitFor(() => expect(api.activate).toHaveBeenCalledWith({ token: 'private-token-value', password: 'secure-password', passwordConfirmation: 'secure-password' }));
    expect(await screen.findByText(/you can now sign in/i)).toBeInTheDocument();
  });

  it('fails closed when the reset token is absent', () => {
    render(<MemoryRouter><AccountActionPage mode="reset" /></MemoryRouter>);
    expect(screen.getByText(/link is invalid/i)).toBeInTheDocument();
    expect(api.reset).not.toHaveBeenCalled();
  });
});
