import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SchedulerExecutionGuard } from './scheduler-execution.guard';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [SchedulerExecutionGuard],
  exports: [SchedulerExecutionGuard],
})
export class SchedulerRuntimeSafetyModule {}
