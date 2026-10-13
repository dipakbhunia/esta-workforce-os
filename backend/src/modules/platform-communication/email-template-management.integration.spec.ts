import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { NotificationType, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EmailTemplateManagementService } from './email-template-management.service';
import { EmailTemplatePreviewService } from './email-template-preview.service';

const enabled = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;
const service = prisma ? new EmailTemplateManagementService(prisma as never) : null;
const previewService = prisma ? new EmailTemplatePreviewService(prisma as never) : null;
let platformActor: AuthenticatedUser;
let tenantActor: AuthenticatedUser;

before(async () => {
  if (!prisma) return;
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: 'ET-B2 Tenant', slug: `et-b2-${suffix}` } });
  const platformRole = await prisma.role.findFirst({ where: { companyId: null, systemName: RoleName.SUPER_ADMIN } })
    ?? await prisma.role.create({ data: { key: `ET_B2_PLATFORM_${suffix}`, name: 'ET-B2 Platform', systemName: RoleName.SUPER_ADMIN } });
  const tenantRole = await prisma.role.create({ data: {
    companyId: company.id, key: `ET_B2_TENANT_${suffix}`, name: 'ET-B2 Tenant', systemName: RoleName.COMPANY_ADMIN,
  } });
  const [platform, tenant] = await Promise.all([
    prisma.user.create({ data: { email: `et-b2-platform-${suffix}@example.invalid`, passwordHash: 'integration-only',
      firstName: 'Platform', lastName: 'Admin', roles: { create: { roleId: platformRole.id } } } }),
    prisma.user.create({ data: { companyId: company.id, email: `et-b2-tenant-${suffix}@example.invalid`,
      passwordHash: 'integration-only', firstName: 'Tenant', lastName: 'Admin', roles: { create: { roleId: tenantRole.id } } } }),
  ]);
  platformActor = { id: platform.id, companyId: null, email: platform.email, firstName: platform.firstName,
    lastName: platform.lastName, status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
  tenantActor = { id: tenant.id, companyId: company.id, email: tenant.email, firstName: tenant.firstName,
    lastName: tenant.lastName, status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
});

after(async () => prisma?.$disconnect());

const draft = (templateRevision: number, suffix = '') => ({ templateRevision,
  subjectTemplate: `Subject ${suffix}`.trim(), textBodyTemplate: `Body {{companyName}} ${suffix}`.trim(),
  placeholderContractVersion: 1 });

describe('Email Templates management PostgreSQL API', { skip: !enabled }, () => {
  it('returns the complete empty platform catalog and denies current tenant authority', async () => {
    assert.ok(service);
    const catalog = await service.listCatalog();
    assert.equal(catalog.length, 24);
    assert.equal(catalog.every(({ configured }) => !configured), true);
    await assert.rejects(() => service.createDraft(NotificationType.ALERT_OPENED, {
      templateRevision: 0, subjectTemplate: 'Alert', textBodyTemplate: 'Alert {{title}}', placeholderContractVersion: 1,
    }, tenantActor), ForbiddenException);
  });

  it('creates sequential drafts, deterministic history, and transactional audit evidence', async () => {
    assert.ok(service && prisma);
    const first = await service.createDraft(NotificationType.PAYMENT_CAPTURED, draft(0, 'one'), platformActor);
    const second = await service.createDraft(NotificationType.PAYMENT_CAPTURED, draft(first.templateRevision, 'two'), platformActor);
    assert.deepEqual([first.version.version, second.version.version], [1, 2]);
    assert.deepEqual([first.templateRevision, second.templateRevision], [1, 2]);
    const history = await service.listVersions(NotificationType.PAYMENT_CAPTURED, { page: 1, limit: 20 });
    assert.deepEqual(history.data.map(({ version }) => version), [2, 1]);
    assert.equal(history.meta.total, 2);
    assert.equal(await prisma.auditLog.count({ where: {
      action: 'EMAIL_TEMPLATE_DRAFT_CREATED', entityId: { in: [first.version.id, second.version.id] },
    } }), 2);
  });

  it('edits and validates drafts with revision fencing and clears stale validation on edit', async () => {
    assert.ok(service);
    const created = await service.createDraft(NotificationType.ACCOUNT_INVITATION, {
      templateRevision: 0, subjectTemplate: 'Invitation for {{organizationName}}',
      textBodyTemplate: 'Expires at {{expiresAt}}.', placeholderContractVersion: 1,
    }, platformActor);
    await assert.rejects(() => service.updateDraft(NotificationType.ACCOUNT_INVITATION, created.version.id, {
      revision: 99, subjectTemplate: 'Changed', textBodyTemplate: 'Body', placeholderContractVersion: 1,
    }, platformActor), ConflictException);
    const updated = await service.updateDraft(NotificationType.ACCOUNT_INVITATION, created.version.id, {
      revision: created.version.revision, subjectTemplate: 'Invitation for {{organizationName}}',
      textBodyTemplate: 'This invitation expires at {{expiresAt}}.', placeholderContractVersion: 1,
    }, platformActor);
    const validated = await service.validateDraft(NotificationType.ACCOUNT_INVITATION, created.version.id,
      { revision: updated.revision }, platformActor);
    assert.equal(validated.validationResultCode, 'VALID');
    assert.ok(validated.validatedAt);
    const editedAgain = await service.updateDraft(NotificationType.ACCOUNT_INVITATION, created.version.id, {
      revision: validated.revision, subjectTemplate: 'Updated invitation', textBodyTemplate: 'Expires {{expiresAt}}.',
      placeholderContractVersion: 1,
    }, platformActor);
    assert.equal(editedAgain.validationResultCode, null);
    assert.equal(editedAgain.validatedAt, null);
  });

  it('publishes validated content and changes the active pointer atomically', async () => {
    assert.ok(service && prisma);
    const created = await service.createDraft(NotificationType.EMAIL_VERIFICATION, {
      templateRevision: 0, subjectTemplate: 'Verify your email', textBodyTemplate: 'Expires at {{expiresAt}}.',
      placeholderContractVersion: 1,
    }, platformActor);
    const validated = await service.validateDraft(NotificationType.EMAIL_VERIFICATION, created.version.id,
      { revision: created.version.revision }, platformActor);
    await assert.rejects(() => service.publish(NotificationType.EMAIL_VERIFICATION, created.version.id,
      { templateRevision: 99, targetRevision: validated.revision }, platformActor), ConflictException);
    const unchanged = await prisma.emailTemplateVersion.findUniqueOrThrow({ where: { id: created.version.id } });
    assert.equal(unchanged.lifecycle, 'DRAFT');
    const published = await service.publish(NotificationType.EMAIL_VERIFICATION, created.version.id,
      { templateRevision: created.templateRevision, targetRevision: validated.revision }, platformActor);
    assert.equal(published.activeVersionId, created.version.id);
    assert.equal(published.version.lifecycle, 'PUBLISHED');
    await assert.rejects(() => service.updateDraft(NotificationType.EMAIL_VERIFICATION, created.version.id, {
      revision: published.version.revision, subjectTemplate: 'Mutation', textBodyTemplate: 'Mutation',
      placeholderContractVersion: 1,
    }, platformActor), ConflictException);
    assert.equal(await prisma.auditLog.count({ where: {
      action: 'EMAIL_TEMPLATE_PUBLISHED', entityId: created.version.id,
    } }), 1);
  });

  it('rolls back only to eligible published history without mutating either version', async () => {
    assert.ok(service);
    const first = await service.createDraft(NotificationType.INVOICE_ISSUED, {
      templateRevision: 0, subjectTemplate: 'Invoice {{invoiceNumber}}',
      textBodyTemplate: '{{companyName}} total {{totalMinor}} {{currency}}.', placeholderContractVersion: 1,
    }, platformActor);
    const firstValidated = await service.validateDraft(NotificationType.INVOICE_ISSUED, first.version.id,
      { revision: first.version.revision }, platformActor);
    const firstPublished = await service.publish(NotificationType.INVOICE_ISSUED, first.version.id,
      { templateRevision: first.templateRevision, targetRevision: firstValidated.revision }, platformActor);
    const second = await service.createDraft(NotificationType.INVOICE_ISSUED, {
      templateRevision: firstPublished.templateRevision, subjectTemplate: 'New invoice {{invoiceNumber}}',
      textBodyTemplate: '{{companyName}} owes {{totalMinor}} {{currency}}.', placeholderContractVersion: 1,
    }, platformActor);
    const secondValidated = await service.validateDraft(NotificationType.INVOICE_ISSUED, second.version.id,
      { revision: second.version.revision }, platformActor);
    const secondPublished = await service.publish(NotificationType.INVOICE_ISSUED, second.version.id,
      { templateRevision: second.templateRevision, targetRevision: secondValidated.revision }, platformActor);
    const rolledBack = await service.rollback(NotificationType.INVOICE_ISSUED, first.version.id,
      { templateRevision: secondPublished.templateRevision, targetRevision: firstPublished.version.revision }, platformActor);
    assert.equal(rolledBack.activeVersionId, first.version.id);
    assert.equal(rolledBack.version.lifecycle, 'PUBLISHED');
    assert.equal(rolledBack.version.subjectTemplate, first.version.subjectTemplate);
  });

  it('serializes concurrent edits and accepts exactly one matching revision', async () => {
    assert.ok(service && prisma);
    const created = await service.createDraft(NotificationType.PAYMENT_FAILED, draft(0, 'race'), platformActor);
    const results = await Promise.allSettled(['A', 'B'].map((suffix) => service.updateDraft(
      NotificationType.PAYMENT_FAILED, created.version.id, {
        revision: created.version.revision, subjectTemplate: `Race ${suffix}`,
        textBodyTemplate: `Body {{companyName}} ${suffix}`, placeholderContractVersion: 1,
      }, platformActor)));
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.ok(rejected?.reason instanceof ConflictException);
    assert.equal(await prisma.auditLog.count({ where: {
      action: 'EMAIL_TEMPLATE_DRAFT_UPDATED', entityId: created.version.id,
    } }), 1);
  });

  it('previews a stored draft without notification, delivery, or audit mutation and fences authority and revision', async () => {
    assert.ok(service && previewService && prisma);
    const created = await service.createDraft(NotificationType.SUBSCRIPTION_EXPIRED, {
      templateRevision: 0, subjectTemplate: 'Subscription for {{companyName}} expired',
      textBodyTemplate: 'Reference {{subscriptionReference}} expired at {{expiredAt}}.', placeholderContractVersion: 1,
    }, platformActor);
    const before = await Promise.all([
      prisma.notification.count(), prisma.notificationDelivery.count(), prisma.auditLog.count(),
    ]);
    const rendered = await previewService.preview(NotificationType.SUBSCRIPTION_EXPIRED, created.version.id,
      created.version.revision, platformActor);
    assert.equal(rendered.subject, 'Subscription for Sample Company expired');
    assert.match(rendered.html, /SUB-SAMPLE-001/);
    assert.equal(rendered.actionLinkIncluded, false);
    assert.deepEqual(await Promise.all([
      prisma.notification.count(), prisma.notificationDelivery.count(), prisma.auditLog.count(),
    ]), before);
    await assert.rejects(() => previewService.preview(NotificationType.SUBSCRIPTION_EXPIRED, created.version.id,
      created.version.revision + 1, platformActor), ConflictException);
    await assert.rejects(() => previewService.preview(NotificationType.SUBSCRIPTION_EXPIRED, created.version.id,
      created.version.revision, tenantActor), ForbiddenException);
  });
});
