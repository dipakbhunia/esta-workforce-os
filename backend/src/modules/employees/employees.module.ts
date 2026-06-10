import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, RolesGuard],
})
export class EmployeesModule {}
