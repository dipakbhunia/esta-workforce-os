import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ShiftAssignmentsController } from './shift-assignments.controller';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { ShiftResolutionService } from './shift-resolution.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ShiftAssignmentsController],
  providers: [ShiftAssignmentsService, ShiftResolutionService],
  exports: [ShiftResolutionService],
})
export class ShiftAssignmentsModule {}
