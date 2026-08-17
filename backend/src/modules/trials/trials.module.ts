import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { TrialsController } from './trials.controller';
import { TrialsScheduler } from './trials.scheduler';
import { TrialsService } from './trials.service';

@Module({ imports: [SubscriptionsModule, UsageSeatsModule], controllers: [TrialsController], providers: [TrialsService, TrialsScheduler], exports: [TrialsService] })
export class TrialsModule {}
