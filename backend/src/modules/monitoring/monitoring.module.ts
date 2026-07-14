import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { MinioObjectStorageService } from './minio-object-storage.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AttendanceModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MinioObjectStorageService],
})
export class MonitoringModule {}
