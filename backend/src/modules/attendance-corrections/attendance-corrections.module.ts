import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttendanceCorrectionsController } from './attendance-corrections.controller';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

@Module({
  controllers: [AttendanceCorrectionsController],
  providers: [AttendanceCorrectionsService, RolesGuard],
})
export class AttendanceCorrectionsModule {}
