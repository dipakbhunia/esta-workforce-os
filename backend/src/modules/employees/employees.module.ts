import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [UsageSeatsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, RolesGuard],
})
export class EmployeesModule {}
