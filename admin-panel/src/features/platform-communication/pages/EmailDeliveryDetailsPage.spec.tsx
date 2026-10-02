import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../platform-communication-api', async original => ({
  ...await original<typeof import('../platform-communication-api')>(),
  getEmailDelivery: get,
}));
import { platformCommunicationKeys } from '../platform-communication-api';
import EmailDeliveryDetailsPage, { EmailDeliveryDetailsErrorState } from './EmailDeliveryDetailsPage';

const id = '11111111-1111-4111-8111-111111111111';
const detail = { deliveryId: id, notificationId: '22222222-2222-4222-8222-222222222222', companyId: null, recipientUserId: '33333333-3333-4333-8333-333333333333', eventType: 'ALERT_RESOLVED', channel: 'EMAIL', status: 'FAILED', recipient: 'ops@example.test', attemptCount: 5, isClaimed: false, claimExpiresAt: null, lastAttemptAt: null, nextRetryAt: null, sentAt: null, failedAt: '2026-01-01T00:00:00.000Z', providerMessageId: null, errorCode: 'SMTP_UNKNOWN', safeErrorMessage: 'Email delivery failed.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

function view(path = `/platform-communication/email-delivery-logs/${id}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, throwOnError: false } } });
  const rendered = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/platform-communication/email-delivery-logs/:deliveryId" element={<EmailDeliveryDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { ...rendered, client };
}
function httpError(status: number, raw = 'private provider error') {
  return Object.assign(new Error(raw), { response: { status, data: { message: raw } } });
}

describe('EmailDeliveryDetailsPage', () => {
  beforeEach(() => get.mockReset());

  it('shows loading then authoritative detail evidence on a direct route', async () => {
    let resolve!: (value: { data: typeof detail }) => void;
    get.mockReturnValue(new Promise(value => { resolve = value; }));
    view();
    expect(screen.getByText('Loading email delivery details')).toBeInTheDocument();
    resolve({ data: detail });
    expect(await screen.findByText('Email delivery failed.')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(id);
    expect(screen.getByText('No active claim evidence')).toBeInTheDocument();
  });

  it('rejects an invalid route without requesting the API', () => {
    view('/platform-communication/email-delivery-logs/not-valid');
    expect(screen.getByText('The email delivery reference is invalid.')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'Email delivery not found'],
    [403, 'Access restricted'],
  ])('maps HTTP %s to a bounded error', async (status, expected) => {
    render(<MemoryRouter><EmailDeliveryDetailsErrorState error={httpError(status)} retry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    expect(screen.queryByText('private provider error')).not.toBeInTheDocument();
  });

  it('sanitizes generic errors and retries', async () => {
    get.mockRejectedValueOnce(new Error('database password')).mockResolvedValueOnce({ data: detail });
    view();
    expect(await screen.findByText(/details could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('database password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(await screen.findByText('Email delivery failed.')).toBeInTheDocument();
  });

  it('retains detail evidence across a background failure and retries', async () => {
    get.mockResolvedValueOnce({ data: detail }).mockRejectedValueOnce(new Error('secret')).mockResolvedValueOnce({ data: detail });
    const { client } = view();
    expect(await screen.findByText('Email delivery failed.')).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: platformCommunicationKeys.detail(id) });
    expect(await screen.findByText(/Showing the most recent available evidence/)).toBeInTheDocument();
    expect(screen.getByText('Email delivery failed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText(/Showing the most recent available evidence/)).not.toBeInTheDocument());
  });
});
