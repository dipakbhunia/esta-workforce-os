import { Module } from '@nestjs/common';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPaymentActivationService } from './subscription-payment-activation.service';
import { SubscriptionPaymentActivationScheduler } from './subscription-payment-activation.scheduler';

@Module({ imports: [UsageSeatsModule], controllers: [SubscriptionsController], providers: [SubscriptionsService, SubscriptionPaymentActivationService, SubscriptionPaymentActivationScheduler], exports: [SubscriptionsService, SubscriptionPaymentActivationService] })
export class SubscriptionsModule {}
