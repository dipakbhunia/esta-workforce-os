import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationType, RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PlatformEmailDeliveryQueryDto } from './dto/platform-email-delivery-query.dto';
import { PlatformEmailCapabilityResponseDto, PlatformEmailDeliveryListResponseDto, PlatformEmailDeliveryResponseDto } from './dto/platform-email-delivery-response.dto';
import { PlatformCommunicationService } from './platform-communication.service';
import { ActivateSmtpConfigurationDto, CreateSmtpConfigurationDraftDto, RollbackSmtpConfigurationDto, SendSmtpTestEmailDto, SmtpConfigurationHistoryQueryDto, TestSmtpConnectionDto, ToggleDatabaseSmtpDto, UpdateSmtpConfigurationDraftDto, ValidateSmtpConfigurationDraftDto } from './dto/smtp-configuration.dto';
import { SmtpConfigurationLifecycleService } from './smtp-configuration-lifecycle.service';
import { SmtpTestEmailService } from './smtp-test-email.service';
import { SmtpConfigurationAuthorityService } from './smtp-configuration-authority.service';
import { CreateEmailTemplateDraftDto, EmailTemplateHistoryQueryDto, PublishEmailTemplateVersionDto,
  PreviewEmailTemplateVersionDto, RollbackEmailTemplateVersionDto, UpdateEmailTemplateDraftDto,
  ValidateEmailTemplateDraftDto } from './dto/email-template.dto';
import { EmailTemplateManagementService } from './email-template-management.service';
import { EmailTemplatePreviewService } from './email-template-preview.service';

@ApiTags('Platform Communication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform-communication')
export class PlatformCommunicationController {
  constructor(private readonly service: PlatformCommunicationService, private readonly smtp: SmtpConfigurationLifecycleService,
    private readonly smtpTestEmail: SmtpTestEmailService, private readonly smtpAuthority: SmtpConfigurationAuthorityService,
    private readonly templates: EmailTemplateManagementService, private readonly templatePreview: EmailTemplatePreviewService) {}

  @Get('email-capability')
  @ApiOkResponse({ type: PlatformEmailCapabilityResponseDto })
  capability() { return this.service.capability(); }

  @Get('email-deliveries')
  @ApiOkResponse({ type: PlatformEmailDeliveryListResponseDto })
  findDeliveries(@Query() query: PlatformEmailDeliveryQueryDto) { return this.service.findDeliveries(query); }

  @Get('email-deliveries/:id')
  @ApiOkResponse({ type: PlatformEmailDeliveryResponseDto })
  findDelivery(@Param('id', ParseUUIDPipe) id: string) { return this.service.findDelivery(id); }

  @Get('email-configuration')
  getEmailConfiguration() { return this.smtp.getConfiguration(); }

  @Get('email-configuration/versions')
  listEmailConfigurationVersions(@Query() query: SmtpConfigurationHistoryQueryDto) { return this.smtp.listVersions(query); }

  @Post('email-configuration/versions')
  createEmailConfigurationDraft(@Body() dto: CreateSmtpConfigurationDraftDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.smtp.createDraft(dto, actor);
  }

  @Patch('email-configuration/versions/:id')
  updateEmailConfigurationDraft(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSmtpConfigurationDraftDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.smtp.updateDraft(id, dto, actor); }

  @Post('email-configuration/versions/:id/validate')
  validateEmailConfigurationDraft(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidateSmtpConfigurationDraftDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.smtp.validateDraft(id, dto, actor); }

  @Post('email-configuration/versions/:id/test-connection')
  testEmailConfigurationConnection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TestSmtpConnectionDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.smtp.testConnection(id, dto, actor); }

  @Post('email-configuration/versions/:id/test-email')
  sendEmailConfigurationTestEmail(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendSmtpTestEmailDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.smtpTestEmail.send(id, dto, actor); }

  @Post('email-configuration/versions/:id/activate')
  activateEmailConfiguration(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateSmtpConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.smtpAuthority.activate(id, dto, actor); }

  @Post('email-configuration/versions/:id/rollback')
  rollbackEmailConfiguration(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RollbackSmtpConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.smtpAuthority.rollback(id, dto, actor); }

  @Post('email-configuration/disable')
  disableDatabaseEmail(@Body() dto: ToggleDatabaseSmtpDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.smtpAuthority.disable(dto, actor);
  }

  @Post('email-configuration/enable')
  enableDatabaseEmail(@Body() dto: ToggleDatabaseSmtpDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.smtpAuthority.enable(dto, actor);
  }

  @Get('email-templates')
  listEmailTemplates() { return this.templates.listCatalog(); }

  @Get('email-templates/:type')
  getEmailTemplate(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType) {
    return this.templates.getTemplate(type);
  }

  @Get('email-templates/:type/versions')
  listEmailTemplateVersions(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Query() query: EmailTemplateHistoryQueryDto) { return this.templates.listVersions(type, query); }

  @Post('email-templates/:type/versions')
  createEmailTemplateDraft(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Body() dto: CreateEmailTemplateDraftDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.templates.createDraft(type, dto, actor);
  }

  @Patch('email-templates/:type/versions/:id')
  updateEmailTemplateDraft(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmailTemplateDraftDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.templates.updateDraft(type, id, dto, actor); }

  @Post('email-templates/:type/versions/:id/validate')
  validateEmailTemplateDraft(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidateEmailTemplateDraftDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.templates.validateDraft(type, id, dto, actor); }

  @Post('email-templates/:type/versions/:id/publish')
  publishEmailTemplateVersion(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishEmailTemplateVersionDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.templates.publish(type, id, dto, actor); }

  @Post('email-templates/:type/versions/:id/rollback')
  rollbackEmailTemplateVersion(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: RollbackEmailTemplateVersionDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.templates.rollback(type, id, dto, actor); }

  @Post('email-templates/:type/versions/:id/preview')
  previewEmailTemplateVersion(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewEmailTemplateVersionDto,
    @CurrentUser() actor: AuthenticatedUser) { return this.templatePreview.preview(type, id, dto.revision, actor); }
}
