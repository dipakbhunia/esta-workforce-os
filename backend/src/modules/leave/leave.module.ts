import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LeaveController],
  providers: [LeaveService, RolesGuard],
})
export class LeaveModule {}
