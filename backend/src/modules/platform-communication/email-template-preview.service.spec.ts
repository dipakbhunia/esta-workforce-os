import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmailTemplateVersionLifecycle, NotificationType, RoleName, UserStatus } from '@prisma/client';
import { EmailTemplatePreviewService } from './email-template-preview.service';

const actor = { id: '00000000-0000-4000-8000-000000000001' } as never;
const version = {
  id: '00000000-0000-4000-8000-000000000002',
  templateId: '00000000-0000-4000-8000-000000000003',
  version: 1,
  lifecycle: EmailTemplateVersionLifecycle.DRAFT,
  revision: 2,
  subjectTemplate: 'Invitation for {{organizationName}}',
  textBodyTemplate: 'This synthetic invitation expires at {{expiresAt}}.',
  placeholderContractVersion: 1,
};

function prisma(overrides: { authority?: object | null; version?: object | null } = {}) {
  return {
    user: { findUnique: async () => overrides.authority === undefined ? {
      companyId: null, status: UserStatus.ACTIVE, deletedAt: null,
      roles: [{ role: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } }],
    } : overrides.authority },
    emailTemplateVersion: { findFirst: async () => overrides.version === undefined ? version : overrides.version },
  } as never;
}

describe('EmailTemplatePreviewService', () => {
  it('renders synthetic text and escaped HTML without an identity-action link or persistence', async () => {
    const result = await new EmailTemplatePreviewService(prisma()).preview(
      NotificationType.ACCOUNT_INVITATION, version.id, 2, actor);
    assert.equal(result.synthetic, true);
    assert.equal(result.subject, 'Invitation for Sample Organization');
    assert.match(result.textBody, /synthetic invitation/);
    assert.match(result.html, /Sample Organization/);
    assert.equal(result.actionLinkIncluded, false);
    assert.equal(result.systemManagedActionLink, true);
    assert.doesNotMatch(result.html, /activate-account|token=/i);
  });

  it('escapes untrusted rendered values in the established HTML envelope', async () => {
    const unsafe = { ...version, subjectTemplate: 'Invoice', textBodyTemplate: 'Company {{companyName}}',
      lifecycle: EmailTemplateVersionLifecycle.PUBLISHED };
    const service = new EmailTemplatePreviewService(prisma({ version: unsafe }));
    const result = await service.preview(NotificationType.INVOICE_ISSUED, version.id, 2, actor);
    assert.equal(result.lifecycle, EmailTemplateVersionLifecycle.PUBLISHED);
    assert.doesNotMatch(result.html, /<script/i);
    assert.match(result.html, /Sample Company/);
  });

  it('rejects stale revisions, missing or retired versions, and non-platform authority', async () => {
    await assert.rejects(() => new EmailTemplatePreviewService(prisma()).preview(
      NotificationType.ACCOUNT_INVITATION, version.id, 1, actor), ConflictException);
    await assert.rejects(() => new EmailTemplatePreviewService(prisma({ version: null })).preview(
      NotificationType.ACCOUNT_INVITATION, version.id, 2, actor), NotFoundException);
    await assert.rejects(() => new EmailTemplatePreviewService(prisma({ authority: {
      companyId: '00000000-0000-4000-8000-000000000099', status: UserStatus.ACTIVE, deletedAt: null,
      roles: [{ role: { companyId: '00000000-0000-4000-8000-000000000099', systemName: RoleName.COMPANY_ADMIN, deletedAt: null } }],
    } })).preview(NotificationType.ACCOUNT_INVITATION, version.id, 2, actor), ForbiddenException);
  });
});
