import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceCorrectionsController } from './attendance-corrections.controller';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AttendanceCorrectionsController],
  providers: [AttendanceCorrectionsService, RolesGuard],
})
export class AttendanceCorrectionsModule {}
