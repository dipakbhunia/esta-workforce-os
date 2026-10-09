import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EmailNotificationChannel } from './email-notification-channel.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';
import { NotificationDeliveriesController, NotificationPreferencesController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController, NotificationPreferencesController, NotificationDeliveriesController],
  providers: [
    NotificationsService,
    NotificationRecipientResolver,
    NotificationPreferenceService,
    NotificationDeliveryService,
    EmailNotificationChannel,
    CommercialBillingRecipientResolver,
  ],
  exports: [NotificationsService, CommercialBillingRecipientResolver],
})
export class NotificationsModule {}
