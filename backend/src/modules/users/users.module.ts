import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IdentityActionsModule } from '../identity-actions/identity-actions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [NotificationsModule, IdentityActionsModule, UsageSeatsModule],
  controllers: [UsersController],
  providers: [UsersService, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
