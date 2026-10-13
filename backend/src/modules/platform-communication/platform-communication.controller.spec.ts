import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { NotificationStatus, NotificationType, RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformEmailDeliveryQueryDto } from './dto/platform-email-delivery-query.dto';
import { PlatformCommunicationController } from './platform-communication.controller';
import { ActivateSmtpConfigurationDto, CreateSmtpConfigurationDraftDto, SendSmtpTestEmailDto, TestSmtpConnectionDto, ToggleDatabaseSmtpDto, UpdateSmtpConfigurationDraftDto } from './dto/smtp-configuration.dto';
import { CreateEmailTemplateDraftDto, EmailTemplateHistoryQueryDto, PublishEmailTemplateVersionDto,
  PreviewEmailTemplateVersionDto, UpdateEmailTemplateDraftDto } from './dto/email-template.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (value: Record<string, unknown>) => pipe.transform(value, { type: 'query', metatype: PlatformEmailDeliveryQueryDto });

describe('PlatformCommunicationController', () => {
  it('is guarded by dedicated SUPER_ADMIN authority', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController), 'platform-communication');
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformCommunicationController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformCommunicationController), [JwtAuthGuard, RolesGuard]);
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController.prototype.capability), 'email-capability');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController.prototype.findDeliveries), 'email-deliveries');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController.prototype.findDelivery), 'email-deliveries/:id');
    const guard = new RolesGuard(new Reflector());
    const context = (roles: RoleName[]) => ({ getHandler: () => PlatformCommunicationController.prototype.findDeliveries,
      getClass: () => PlatformCommunicationController, switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }) }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(() => guard.canActivate(context([RoleName.COMPANY_ADMIN])), ForbiddenException);
  });

  it('accepts only locked filters and normalizes an exact recipient', async () => {
    const dto = await validate({ page: '1', limit: '100', status: NotificationStatus.PENDING,
      companyId: '00000000-0000-4000-8000-000000000001', recipient: ' Person@Example.COM ',
      eventType: NotificationType.ALERT_OPENED, from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    assert.equal(dto.recipient, 'person@example.com');
    assert.equal(dto.limit, 100);
    for (const input of [{ page: '0' }, { limit: '101' }, { companyId: 'bad' }, { recipient: 'bad' },
      { status: 'UNKNOWN' }, { eventType: 'UNKNOWN' }, { channel: 'EMAIL' },
      { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }, { from: 'not-a-date' }]) {
      await assert.rejects(() => validate(input), BadRequestException);
    }
  });

  it('uses established malformed UUID rejection semantics', async () => {
    await assert.rejects(() => new ParseUUIDPipe().transform('bad', { type: 'param', data: 'id' }), BadRequestException);
  });

  it('registers only bounded configuration lifecycle routes', () => {
    const prototype = PlatformCommunicationController.prototype;
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.getEmailConfiguration), 'email-configuration');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.listEmailConfigurationVersions), 'email-configuration/versions');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.createEmailConfigurationDraft), 'email-configuration/versions');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.updateEmailConfigurationDraft), 'email-configuration/versions/:id');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.validateEmailConfigurationDraft), 'email-configuration/versions/:id/validate');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.testEmailConfigurationConnection), 'email-configuration/versions/:id/test-connection');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.sendEmailConfigurationTestEmail), 'email-configuration/versions/:id/test-email');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.activateEmailConfiguration), 'email-configuration/versions/:id/activate');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.rollbackEmailConfiguration), 'email-configuration/versions/:id/rollback');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.disableDatabaseEmail), 'email-configuration/disable');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.enableDatabaseEmail), 'email-configuration/enable');
    for (const forbidden of ['activate', 'rollback', 'enable', 'disable']) assert.equal(forbidden in prototype, false);
  });

  it('registers the bounded Email Templates management routes', () => {
    const prototype = PlatformCommunicationController.prototype;
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.listEmailTemplates), 'email-templates');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.getEmailTemplate), 'email-templates/:type');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.listEmailTemplateVersions), 'email-templates/:type/versions');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.createEmailTemplateDraft), 'email-templates/:type/versions');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.updateEmailTemplateDraft), 'email-templates/:type/versions/:id');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.validateEmailTemplateDraft), 'email-templates/:type/versions/:id/validate');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.publishEmailTemplateVersion), 'email-templates/:type/versions/:id/publish');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.rollbackEmailTemplateVersion), 'email-templates/:type/versions/:id/rollback');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.previewEmailTemplateVersion), 'email-templates/:type/versions/:id/preview');
  });

  it('rejects unbounded Email Template DTO fields and invalid revisions', async () => {
    const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const create = { templateRevision: 0, subjectTemplate: 'Subject', textBodyTemplate: 'Body', placeholderContractVersion: 1 };
    await bodyPipe.transform(create, { type: 'body', metatype: CreateEmailTemplateDraftDto });
    await assert.rejects(() => bodyPipe.transform({ ...create, htmlTemplate: '<b>unsafe</b>' },
      { type: 'body', metatype: CreateEmailTemplateDraftDto }), BadRequestException);
    await assert.rejects(() => bodyPipe.transform({ ...create, placeholderContractVersion: 2 },
      { type: 'body', metatype: CreateEmailTemplateDraftDto }), BadRequestException);
    await assert.rejects(() => bodyPipe.transform({ revision: 0, subjectTemplate: 'S', textBodyTemplate: 'B', placeholderContractVersion: 1 },
      { type: 'body', metatype: UpdateEmailTemplateDraftDto }), BadRequestException);
    await assert.rejects(() => bodyPipe.transform({ templateRevision: 0, targetRevision: 1 },
      { type: 'body', metatype: PublishEmailTemplateVersionDto }), BadRequestException);
    const query = await bodyPipe.transform({ page: '2', limit: '100' }, { type: 'query', metatype: EmailTemplateHistoryQueryDto });
    assert.deepEqual({ page: query.page, limit: query.limit }, { page: 2, limit: 100 });
    await bodyPipe.transform({ revision: 1 }, { type: 'body', metatype: PreviewEmailTemplateVersionDto });
    await assert.rejects(() => bodyPipe.transform({ revision: 1, recipient: 'attacker@example.test' },
      { type: 'body', metatype: PreviewEmailTemplateVersionDto }), BadRequestException);
  });

  it('rejects unknown and invalid SMTP draft fields', async () => {
    const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const create = (value: Record<string, unknown>) => bodyPipe.transform(value, { type: 'body', metatype: CreateSmtpConfigurationDraftDto });
    const valid = { host: 'smtp.example.test', port: 587, securityMode: 'STARTTLS', username: 'mailer',
      password: 'strong-password', senderEmail: 'sender@example.test', senderDisplayName: 'Sender' };
    await create(valid);
    for (const input of [{ ...valid, secret: 'extra' }, { ...valid, port: 0 }, { ...valid, password: 'short' }]) {
      await assert.rejects(() => create(input), BadRequestException);
    }
    await assert.rejects(() => bodyPipe.transform({ revision: 0 }, { type: 'body', metatype: UpdateSmtpConfigurationDraftDto }), BadRequestException);
    await assert.rejects(() => bodyPipe.transform({ revision: 0 }, { type: 'body', metatype: TestSmtpConnectionDto }), BadRequestException);
    await assert.rejects(() => bodyPipe.transform({ revision: 1, password: 'forbidden' },
      { type: 'body', metatype: TestSmtpConnectionDto }), BadRequestException);
    await bodyPipe.transform({ revision: 1 }, { type: 'body', metatype: SendSmtpTestEmailDto });
    for (const body of [{ revision: 0 }, { revision: 1, recipient: 'attacker@example.test' },
      { revision: 1, subject: 'controlled' }, { revision: 1, body: 'controlled' }]) {
      await assert.rejects(() => bodyPipe.transform(body, { type: 'body', metatype: SendSmtpTestEmailDto }), BadRequestException);
    }
    await bodyPipe.transform({ settingsRevision: 0, targetRevision: 1 }, { type: 'body', metatype: ActivateSmtpConfigurationDto });
    await assert.rejects(() => bodyPipe.transform({ settingsRevision: 0, targetRevision: 1, enabled: true },
      { type: 'body', metatype: ActivateSmtpConfigurationDto }), BadRequestException);
    await bodyPipe.transform({ settingsRevision: 1 }, { type: 'body', metatype: ToggleDatabaseSmtpDto });
  });
});
