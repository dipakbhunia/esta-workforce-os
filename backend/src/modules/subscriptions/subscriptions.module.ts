import { Module } from '@nestjs/common';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPaymentActivationService } from './subscription-payment-activation.service';
import { SubscriptionPaymentActivationScheduler } from './subscription-payment-activation.scheduler';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { SubscriptionExpirationScheduler } from './subscription-expiration.scheduler';

@Module({ imports: [UsageSeatsModule], controllers: [SubscriptionsController], providers: [SubscriptionsService, SubscriptionPaymentActivationService, SubscriptionPaymentActivationScheduler, SubscriptionExpirationService, SubscriptionExpirationScheduler], exports: [SubscriptionsService, SubscriptionPaymentActivationService, SubscriptionExpirationService] })
export class SubscriptionsModule {}
