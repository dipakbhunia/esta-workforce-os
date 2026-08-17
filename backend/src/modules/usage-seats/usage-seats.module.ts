import { Module } from '@nestjs/common';
import { CommercialAccessService } from './commercial-access.service';
import { SeatUsageService } from './seat-usage.service';
import { UsageSeatsController } from './usage-seats.controller';
import { UsageSeatsQueryService } from './usage-seats-query.service';

@Module({
  controllers: [UsageSeatsController],
  providers: [
    CommercialAccessService,
    SeatUsageService,
    UsageSeatsQueryService,
  ],
  exports: [CommercialAccessService, SeatUsageService],
})
export class UsageSeatsModule {}
