import { Module } from '@nestjs/common';
import { StorageUsageModule } from '../storage-usage/storage-usage.module';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformDashboardService } from './platform-dashboard.service';

@Module({
  imports: [StorageUsageModule],
  controllers: [PlatformDashboardController],
  providers: [PlatformDashboardService],
})
export class PlatformDashboardModule {}
