import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformCommunicationController } from './platform-communication.controller';
import { PlatformCommunicationService } from './platform-communication.service';
import { SmtpConfigurationLifecycleService } from './smtp-configuration-lifecycle.service';
import { SmtpTestEmailService } from './smtp-test-email.service';
import { SmtpConfigurationAuthorityService } from './smtp-configuration-authority.service';
import { SmtpRuntimeModule } from '../smtp-runtime/smtp-runtime.module';
import { EmailTemplateManagementService } from './email-template-management.service';
import { EmailTemplatePreviewService } from './email-template-preview.service';
import { SmtpEmailVerificationBootstrapService } from './smtp-email-verification-bootstrap.service';
import { SmtpPlatformInvitationBootstrapService } from './smtp-platform-invitation-bootstrap.service';

@Module({
  imports: [DatabaseModule, NotificationsModule, SmtpRuntimeModule],
  controllers: [PlatformCommunicationController],
  providers: [PlatformCommunicationService, SmtpConfigurationLifecycleService, SmtpTestEmailService,
    SmtpConfigurationAuthorityService, EmailTemplateManagementService, EmailTemplatePreviewService,
    SmtpEmailVerificationBootstrapService, SmtpPlatformInvitationBootstrapService],
})
export class PlatformCommunicationModule {}
