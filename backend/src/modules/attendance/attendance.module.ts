import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ShiftAssignmentsModule } from '../shift-assignments/shift-assignments.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { StaleAttendanceScheduler } from './stale-attendance.scheduler';
import { TimeBoundaryService } from './time-boundary.service';

@Module({
  imports: [ShiftAssignmentsModule],
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
