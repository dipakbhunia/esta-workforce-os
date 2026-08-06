import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { resolve } from 'node:path';
import { environmentValidationSchema } from './config/environment.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AttendanceCorrectionsModule } from './modules/attendance-corrections/attendance-corrections.module';
import { BreakPoliciesModule } from './modules/break-policies/break-policies.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DesignationsModule } from './modules/designations/designations.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { LeaveModule } from './modules/leave/leave.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { MonitoringAlertsModule } from './modules/monitoring-alerts/monitoring-alerts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProductivityModule } from './modules/productivity/productivity.module';
import { RolesModule } from './modules/roles/roles.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { ShiftAssignmentsModule } from './modules/shift-assignments/shift-assignments.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        resolve(process.cwd(), '../.env'),
        resolve(process.cwd(), '.env'),
      ],
      validationSchema: environmentValidationSchema,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AttendanceModule,
    AttendanceCorrectionsModule,
    BreakPoliciesModule,
    CompaniesModule,
    BranchesModule,
    DepartmentsModule,
    DesignationsModule,
    EmployeesModule,
    LeaveModule,
    MonitoringModule,
    MonitoringAlertsModule,
    NotificationsModule,
    ProductivityModule,
    SchedulingModule,
    ShiftAssignmentsModule,
    ShiftsModule,
    UsersModule,
    RolesModule,
    HealthModule,
  ],
})
export class AppModule {}
