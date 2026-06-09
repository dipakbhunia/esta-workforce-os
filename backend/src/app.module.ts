import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { environmentValidationSchema } from './config/environment.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DesignationsModule } from './modules/designations/designations.module';
import { HealthModule } from './modules/health/health.module';
import { ShiftsModule } from './modules/shifts/shifts.module';

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
    DatabaseModule,
    AuthModule,
    CompaniesModule,
    BranchesModule,
    DepartmentsModule,
    DesignationsModule,
    ShiftsModule,
    HealthModule,
  ],
})
export class AppModule {}
