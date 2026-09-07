import { Module } from '@nestjs/common';
import { PlatformPaymentsController } from './platform-payments.controller';
import { PlatformPaymentsService } from './platform-payments.service';

@Module({
  controllers: [PlatformPaymentsController],
  providers: [PlatformPaymentsService],
})
export class PlatformPaymentsModule {}
