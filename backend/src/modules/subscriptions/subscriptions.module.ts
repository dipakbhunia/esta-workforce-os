import { Module } from '@nestjs/common';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({ imports: [UsageSeatsModule], controllers: [SubscriptionsController], providers: [SubscriptionsService], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
