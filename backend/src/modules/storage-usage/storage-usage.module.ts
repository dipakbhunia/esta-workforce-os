import { Module } from '@nestjs/common';
import { StorageUsageController } from './storage-usage.controller';
import { StorageUsageQueryService } from './storage-usage-query.service';
import { StorageUsageService } from './storage-usage.service';

@Module({
  controllers: [StorageUsageController],
  providers: [StorageUsageService, StorageUsageQueryService],
  exports: [StorageUsageQueryService],
})
export class StorageUsageModule {}
