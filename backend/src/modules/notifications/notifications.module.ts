import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EmailNotificationChannel } from './email-notification-channel.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';
import { NotificationDeliveriesController, NotificationPreferencesController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';
import { CommercialTransactionalNotificationService } from './commercial-transactional-notification.service';
import { SmtpRuntimeModule } from '../smtp-runtime/smtp-runtime.module';
import { EmailTemplateRuntimeResolver } from './email-template-runtime-resolver.service';

@Module({
  imports: [DatabaseModule, SmtpRuntimeModule],
  controllers: [NotificationsController, NotificationPreferencesController, NotificationDeliveriesController],
  providers: [
    NotificationsService,
    NotificationRecipientResolver,
    NotificationPreferenceService,
    NotificationDeliveryService,
    EmailNotificationChannel,
    CommercialBillingRecipientResolver,
    CommercialTransactionalNotificationService,
    EmailTemplateRuntimeResolver,
  ],
  exports: [NotificationsService, CommercialBillingRecipientResolver, CommercialTransactionalNotificationService],
})
export class NotificationsModule {}
