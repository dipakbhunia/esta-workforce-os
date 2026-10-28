import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { IdentityActionsService } from './identity-actions.service';

@Module({
  imports: [NotificationsModule, UsageSeatsModule],
  providers: [IdentityActionsService],
  exports: [IdentityActionsService],
})
export class IdentityActionsModule {}
