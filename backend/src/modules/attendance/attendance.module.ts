import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, RolesGuard],
})
export class AttendanceModule {}
