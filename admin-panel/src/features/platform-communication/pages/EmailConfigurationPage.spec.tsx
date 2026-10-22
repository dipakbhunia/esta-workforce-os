import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmtpConfigurationVersion } from '../platform-communication.types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), action: vi.fn(), select: vi.fn(), toggle: vi.fn(),
}));
vi.mock('../platform-communication-api', async original => ({
  ...await original<typeof import('../platform-communication-api')>(),
  getSmtpConfiguration: mocks.get,
  listSmtpConfigurationVersions: mocks.list,
  createSmtpConfigurationDraft: mocks.create,
  updateSmtpConfigurationDraft: mocks.update,
  runSmtpConfigurationAction: mocks.action,
  selectSmtpConfiguration: mocks.select,
  toggleDatabaseSmtp: mocks.toggle,
}));
import EmailConfigurationPage from './EmailConfigurationPage';

const version: SmtpConfigurationVersion = {
  id: '11111111-1111-4111-8111-111111111111', version: 2, lifecycle: 'DRAFT', host: 'smtp.example.com', port: 587,
  securityMode: 'STARTTLS', username: 'mailer', senderEmail: 'mail@example.com', senderDisplayName: 'Esta Mail', revision: 3,
  passwordConfigured: true, structurallyValidatedAt: null, connectionTestedAt: null, connectionTestSucceeded: null,
  restrictedTestEmailSentAt: null, firstActivatedAt: null, lastActivatedAt: null, revokedAt: null,
  createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z',
};
const settings = { enabled: false, revision: 4, activeConfigurationVersionId: null, databaseAuthorityEstablishedAt: null, updatedAt: null };

function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><EmailConfigurationPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.get.mockResolvedValue({ data: { settings, latestVersion: version } });
  mocks.list.mockResolvedValue({ data: { data: [version], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
  mocks.create.mockResolvedValue({ data: version });
  mocks.update.mockResolvedValue({ data: { ...version, revision: 4 } });
  mocks.action.mockResolvedValue({ data: {} });
  mocks.select.mockResolvedValue({ data: {} });
  mocks.toggle.mockResolvedValue({ data: {} });
});

describe('EmailConfigurationPage', () => {
  it('renders authoritative empty state and deployment-gate notice', async () => {
    mocks.get.mockResolvedValue({ data: { settings, latestVersion: null } });
    mocks.list.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } } });
    view();
    expect(await screen.findByText(/No SMTP configuration versions exist/)).toBeInTheDocument();
    expect(screen.getByText(/This UI cannot inspect or bypass that gate/)).toBeInTheDocument();
    expect(screen.getByText('Environment (pre-cutover)')).toBeInTheDocument();
  });

  it('creates a draft with exact supported fields', async () => {
    view(); await screen.findByText('Version 2');
    fireEvent.change(screen.getByLabelText(/SMTP host/), { target: { value: 'smtp.new.example' } });
    fireEvent.change(screen.getByLabelText(/Port/), { target: { value: '465' } });
    fireEvent.mouseDown(screen.getByLabelText(/Security mode/));
    fireEvent.click(screen.getByRole('option', { name: 'Implicit TLS' }));
    fireEvent.change(screen.getByLabelText(/Authentication username/), { target: { value: 'new-user' } });
    fireEvent.change(screen.getByLabelText(/^SMTP password/), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText(/Sender email/), { target: { value: 'MAIL@EXAMPLE.COM' } });
    fireEvent.change(screen.getByLabelText(/Sender display name/), { target: { value: 'New Mail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ host: 'smtp.new.example', port: 465, securityMode: 'IMPLICIT_TLS', username: 'new-user', password: 'secret-pass', senderEmail: 'mail@example.com', senderDisplayName: 'New Mail' }));
  });

  it('submits the exact STARTTLS backend enum value', async () => {
    view(); await screen.findByText('Version 2');
    fireEvent.change(screen.getByLabelText(/SMTP host/), { target: { value: 'smtp.starttls.example' } });
    fireEvent.change(screen.getByLabelText(/Authentication username/), { target: { value: 'starttls-user' } });
    fireEvent.change(screen.getByLabelText(/^SMTP password/), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText(/Sender email/), { target: { value: 'mail@example.com' } });
    fireEvent.change(screen.getByLabelText(/Sender display name/), { target: { value: 'STARTTLS Mail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ port: 587, securityMode: 'STARTTLS' })));
  });

  it('updates by revision without sending an empty password', async () => {
    view(); await screen.findByText('Version 2');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('New SMTP password (optional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/Sender display name/), { target: { value: 'Updated Mail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][1]).toEqual(expect.objectContaining({ revision: 3, senderDisplayName: 'Updated Mail' }));
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('password');
  });

  it('preserves the exact IMPLICIT_TLS enum while editing a draft', async () => {
    const implicit = { ...version, port: 465, securityMode: 'IMPLICIT_TLS' as const };
    mocks.get.mockResolvedValue({ data: { settings, latestVersion: implicit } });
    mocks.list.mockResolvedValue({ data: { data: [implicit], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    mocks.update.mockResolvedValue({ data: { ...implicit, revision: 4 } });
    view(); await screen.findByText('Version 2');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/Security mode/)).toHaveTextContent('Implicit TLS');
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(implicit.id, expect.objectContaining({
      revision: 3, port: 465, securityMode: 'IMPLICIT_TLS',
    })));
  });

  it('uses lifecycle eligibility for validation, connection testing, and restricted test email', async () => {
    const tested = { ...version, lifecycle: 'TESTED' as const, connectionTestSucceeded: true, structurallyValidatedAt: version.createdAt, connectionTestedAt: version.createdAt };
    mocks.list.mockResolvedValue({ data: { data: [version, { ...version, id: '22222222-2222-4222-8222-222222222222', version: 1, lifecycle: 'VALIDATED' }, tested], meta: { page: 1, limit: 100, total: 3, totalPages: 1 } } });
    view(); await screen.findAllByText('Version 2');
    const validateButtons = screen.getAllByRole('button', { name: 'Validate' });
    expect(validateButtons[0]).toBeEnabled(); expect(validateButtons[1]).toBeDisabled(); expect(validateButtons[2]).toBeDisabled();
    const connectionButtons = screen.getAllByRole('button', { name: 'Test connection' });
    expect(connectionButtons[0]).toBeDisabled(); expect(connectionButtons[1]).toBeEnabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Send restricted test email' })[2]);
    await waitFor(() => expect(mocks.action).toHaveBeenCalledWith(tested.id, 'test-email', tested.revision));
  });

  it('requires deliberate activation confirmation and submits both revision fences', async () => {
    const eligible = { ...version, lifecycle: 'TESTED' as const, connectionTestSucceeded: true, restrictedTestEmailSentAt: version.createdAt };
    mocks.list.mockResolvedValue({ data: { data: [eligible], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    view(); await screen.findByText('Version 2');
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(screen.getByText(/permanently establishes database SMTP authority/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith(eligible.id, 'activate', 4, 3));
  });

  it('supports rollback and disabled queue messaging', async () => {
    const prior = { ...version, lifecycle: 'TESTED' as const, firstActivatedAt: version.createdAt, connectionTestSucceeded: true, restrictedTestEmailSentAt: version.createdAt };
    mocks.get.mockResolvedValue({ data: { settings: { ...settings, enabled: true, activeConfigurationVersionId: 'active', databaseAuthorityEstablishedAt: version.createdAt }, latestVersion: prior } });
    mocks.list.mockResolvedValue({ data: { data: [prior], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    view(); await screen.findByText('Version 2');
    fireEvent.click(screen.getByRole('button', { name: 'Rollback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith(prior.id, 'rollback', 4, 3));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Disable database SMTP' }));
    expect(screen.getByText(/claims will pause without consuming attempts/)).toBeInTheDocument();
  });

  it('reports revision conflicts and management-gate blocks safely', async () => {
    mocks.update.mockRejectedValueOnce(new axios.AxiosError('secret', 'ERR', undefined, undefined, { status: 409, statusText: 'Conflict', headers: {}, config: {} as never, data: { message: 'private' } }));
    view(); await screen.findByText('Version 2');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    expect(await screen.findByText(/changed on the server/)).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('shows safe loading failure and retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('database secret')).mockResolvedValueOnce({ data: { settings, latestVersion: version } });
    view();
    expect(await screen.findByText('Email configuration could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('database secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Current SMTP authority')).toBeInTheDocument();
  });

  it('uses responsive grid structures without fixed widths', async () => {
    view(); await screen.findByText('Version 2');
    const host = screen.getByLabelText(/SMTP host/);
    expect(host.closest('.MuiFormControl-root')?.parentElement).toHaveStyle({ display: 'grid' });
    expect(document.body.innerHTML).not.toContain('min-width: 1200');
  });
});
