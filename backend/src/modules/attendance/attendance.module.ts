import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { StaleAttendanceScheduler } from './stale-attendance.scheduler';
import { TimeBoundaryService } from './time-boundary.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    TimeBoundaryService,
    StaleAttendanceScheduler,
    RolesGuard,
  ],
  exports: [AttendanceService, TimeBoundaryService],
})
export class AttendanceModule {}
