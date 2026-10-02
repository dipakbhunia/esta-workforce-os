import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PlatformEmailDeliveryList } from './PlatformEmailDeliveryList';
import type { PlatformEmailDelivery } from '../platform-communication.types';

const row: PlatformEmailDelivery = { deliveryId: '11111111-1111-4111-8111-111111111111', notificationId: '22222222-2222-4222-8222-222222222222', companyId: '33333333-3333-4333-8333-333333333333', recipientUserId: '44444444-4444-4444-8444-444444444444', eventType: 'ALERT_OPENED', channel: 'EMAIL', status: 'PENDING', recipient: 'operations-with-a-long-address@example.test', attemptCount: 2, isClaimed: true, claimExpiresAt: '2099-01-01T00:00:00.000Z', lastAttemptAt: '2026-01-01T00:00:00.000Z', nextRetryAt: '2026-01-02T00:00:00.000Z', sentAt: null, failedAt: null, providerMessageId: null, errorCode: null, safeErrorMessage: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

function setDesktop(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({ matches, media: '(min-width:1200px)', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })),
  });
}
function view(rows = [row], filtered = false) {
  return render(<MemoryRouter><PlatformEmailDeliveryList rows={rows} total={rows.length} page={1} limit={20} loading={false} filtered={filtered} onPaginationChange={vi.fn()} /></MemoryRouter>);
}

describe('PlatformEmailDeliveryList responsive presentation', () => {
  it('renders only the desktop table path at the lg breakpoint', () => {
    setDesktop(true);
    view();
    expect(screen.getByTestId('email-delivery-desktop-list')).toBeInTheDocument();
    expect(screen.queryByTestId('email-delivery-mobile-list')).not.toBeInTheDocument();
    expect(screen.getByText(row.recipient)).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', `/platform-communication/email-delivery-logs/${row.deliveryId}`);
  });

  it('keeps desktop authority and schedule evidence together in content-driven rows', () => {
    setDesktop(true);
    view();

    const company = screen.getByText('33333333…333333');
    const user = screen.getByText('44444444…444444');
    expect(company.closest('[role="gridcell"]')).toBe(user.closest('[role="gridcell"]'));

    const attempts = screen.getByText('2');
    const schedule = screen.getByText(/Jan 2, 2026/);
    expect(attempts.closest('[role="gridcell"]')).toBe(schedule.closest('[role="gridcell"]'));
    expect(screen.getByText(/Jan 1, 2026/)).toBeVisible();
  });

  it('renders only the card path below the lg breakpoint', () => {
    setDesktop(false);
    view();
    expect(screen.getByTestId('email-delivery-mobile-list')).toBeInTheDocument();
    expect(screen.queryByTestId('email-delivery-desktop-list')).not.toBeInTheDocument();
    expect(screen.getByText('Claim lease active')).toBeInTheDocument();
    expect(screen.getByText(row.recipient)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', `/platform-communication/email-delivery-logs/${row.deliveryId}`);
    expect(screen.queryByText('PROCESSING')).not.toBeInTheDocument();
  });

  it('renders a clean filtered empty card state below lg', () => {
    setDesktop(false);
    view([], true);
    expect(screen.getByText('No deliveries match the applied filters.')).toBeInTheDocument();
  });
});
