import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { MinioObjectStorageService } from './minio-object-storage.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringOperationsService } from './monitoring-operations.service';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AttendanceModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringOperationsService, MinioObjectStorageService],
})
export class MonitoringModule {}
