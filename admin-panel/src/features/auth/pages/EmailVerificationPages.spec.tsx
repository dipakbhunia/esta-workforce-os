import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailVerificationSettingsPage from './EmailVerificationSettingsPage';
import VerifyEmailPage from './VerifyEmailPage';

const api = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), verify: vi.fn() }));
vi.mock('../services/auth-api', async (original) => ({
  ...(await original<typeof import('../services/auth-api')>()),
  getEmailVerificationStatus: api.status,
  requestEmailVerification: api.request,
  verifyEmail: api.verify,
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'admin@example.com' } }) }));

function wrapper(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

function Location() { return <span data-testid="location">{useLocation().pathname}{useLocation().search}</span>; }

describe('email verification experience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.status.mockResolvedValue({ data: { verified: false, verifiedAt: null } });
    api.request.mockResolvedValue({ data: { accepted: true } });
    api.verify.mockResolvedValue({ data: { success: true } });
  });

  it('renders current status and supports request and resend without exposing recipient controls', async () => {
    render(wrapper(<EmailVerificationSettingsPage />));
    expect(await screen.findByText('Unverified')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request verification email' }));
    expect(await screen.findByText(/email has been queued/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled();
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('disables requests for a verified current address', async () => {
    api.status.mockResolvedValue({ data: { verified: true, verifiedAt: '2026-10-12T00:00:00.000Z' } });
    render(wrapper(<EmailVerificationSettingsPage />));
    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request verification email' })).toBeDisabled();
  });

  it('removes token material from the URL and reports success only after consumption', async () => {
    render(<MemoryRouter initialEntries={['/verify-email?token=private-token']}><Routes><Route path="/verify-email" element={<><VerifyEmailPage /><Location /></>} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/verify-email'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('private-token');
    expect(screen.queryByText('private-token')).not.toBeInTheDocument();
    expect(await screen.findByText(/has been verified/i)).toBeInTheDocument();
    expect(api.verify).toHaveBeenCalledWith('private-token');
  });

  it('uses one generic result for invalid, expired, and consumed tokens and fails closed without a token', async () => {
    api.verify.mockRejectedValue(new Error('private provider detail'));
    const { unmount } = render(<MemoryRouter initialEntries={['/verify-email?token=bad']}><VerifyEmailPage /></MemoryRouter>);
    expect(await screen.findByText(/invalid, expired, or has already been used/i)).toBeInTheDocument();
    expect(screen.queryByText(/private provider detail/i)).not.toBeInTheDocument();
    unmount();
    render(<MemoryRouter><VerifyEmailPage /></MemoryRouter>);
    expect(screen.getByText(/invalid, expired, or has already been used/i)).toBeInTheDocument();
  });
});
