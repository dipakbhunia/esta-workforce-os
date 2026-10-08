import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityActionsService } from './identity-actions.service';

@Module({
  imports: [NotificationsModule],
  providers: [IdentityActionsService],
  exports: [IdentityActionsService],
})
export class IdentityActionsModule {}
