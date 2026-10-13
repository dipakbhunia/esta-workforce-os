import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailTemplateCatalogItem, EmailTemplateVersion } from '../platform-communication.types';

const mocks = vi.hoisted(() => ({ list: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn(), action: vi.fn(), select: vi.fn() }));
vi.mock('../platform-communication-api', async original => ({ ...await original<typeof import('../platform-communication-api')>(),
  listEmailTemplates: mocks.list, listEmailTemplateVersions: mocks.history, createEmailTemplateDraft: mocks.create,
  updateEmailTemplateDraft: mocks.update, runEmailTemplateAction: mocks.action, selectEmailTemplateVersion: mocks.select }));
import EmailTemplatesPage from './EmailTemplatesPage';

const version: EmailTemplateVersion = { id: '11111111-1111-4111-8111-111111111111', templateId: '22222222-2222-4222-8222-222222222222',
  version: 1, lifecycle: 'DRAFT', subjectTemplate: 'Payment {{paymentReference}}', textBodyTemplate: '{{companyName}} paid.',
  placeholderContractVersion: 1, revision: 2, validationResultCode: 'VALID', validatedAt: '2030-01-01', publishedAt: null,
  retiredAt: null, createdAt: '2030-01-01', updatedAt: '2030-01-01' };
const types = Array.from({ length: 24 }, (_, index) => index === 0 ? 'PAYMENT_CAPTURED' : index === 1 ? 'ACCOUNT_INVITATION' : `EVENT_${index}`);
const catalog: EmailTemplateCatalogItem[] = types.map((notificationType, index) => ({ templateKey: notificationType, notificationType,
  category: index >= 1 && index <= 3 ? 'SECURITY' : 'COMMERCIAL', allowedVariables: index === 0 ? ['paymentReference', 'companyName'] : [], optionalVariables: [],
  placeholderContractVersion: 1, systemManagedActionLink: index >= 1 && index <= 3, configured: index === 0,
  template: index === 0 ? { id: version.templateId, templateKey: notificationType, revision: 3, activeVersionId: null,
    activeVersion: null, latestVersion: { id: version.id, version: 1, lifecycle: 'DRAFT', revision: 2, updatedAt: version.updatedAt } } : null }));

function view() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><EmailTemplatesPage /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); mocks.list.mockResolvedValue({ data: catalog });
  mocks.history.mockResolvedValue({ data: { data: [version], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
  mocks.create.mockResolvedValue({ data: { templateRevision: 1, version } }); mocks.update.mockResolvedValue({ data: version });
  mocks.action.mockResolvedValue({ data: { ...version, synthetic: true, notificationType: 'PAYMENT_CAPTURED', versionId: version.id,
    subject: 'Synthetic subject', textBody: 'Synthetic body', html: '<p>Safe</p>', systemManagedActionLink: false, actionLinkIncluded: false } });
  mocks.select.mockResolvedValue({ data: {} }); });

describe('EmailTemplatesPage', () => {
  it('loads all 24 types and identifies runtime-disabled security content', async () => { view();
    expect(await screen.findByText('24 supported email event types')).toBeInTheDocument();
    expect(screen.getAllByText('Runtime enabled')).toHaveLength(21); expect(screen.getAllByText('Runtime disabled')).toHaveLength(3); fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'account invitation' } });
    expect(screen.getByText('Account Invitation')).toBeInTheDocument(); expect(screen.getByText('Runtime disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Account Invitation')); expect(screen.getByText(/publishing this catalog entry does not override/)).toBeInTheDocument();
  });
  it('edits by revision, validates, previews synthetic content, and confirms publish', async () => { view(); await screen.findByText('Version 1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' })); fireEvent.change(await screen.findByLabelText(/Subject/), { target: { value: 'Updated {{paymentReference}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' })); await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('PAYMENT_CAPTURED', version.id, expect.objectContaining({ revision: 2 })));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' })); expect(await screen.findByText('Synthetic subject')).toBeInTheDocument(); expect(screen.getByText(/No email was sent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' })); expect(screen.getByText(/affects future eligible notifications only/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' }).at(-1)!); await waitFor(() => expect(mocks.select).toHaveBeenCalledWith('PAYMENT_CAPTURED', version.id, 'publish', 3, 2));
  }, 30_000);
  it('shows retry and an accurate empty state', async () => { mocks.list.mockRejectedValueOnce(new Error('offline')); view();
    expect(await screen.findByText('Email templates could not be loaded.')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled(); });
});
