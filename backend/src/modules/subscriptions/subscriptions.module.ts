import { forwardRef, Module } from '@nestjs/common';
import { InvoiceFoundationModule } from '../invoices/invoice-foundation.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPaymentActivationService } from './subscription-payment-activation.service';
import { SubscriptionPaymentActivationScheduler } from './subscription-payment-activation.scheduler';
import { SubscriptionExpirationService } from './subscription-expiration.service';
import { SubscriptionExpirationScheduler } from './subscription-expiration.scheduler';
import { SubscriptionRenewalPreparationService } from './subscription-renewal-preparation.service';
import { SubscriptionRenewalApplicationService } from './subscription-renewal-application.service';

@Module({ imports: [InvoiceFoundationModule, UsageSeatsModule, forwardRef(() => PaymentsModule)], controllers: [SubscriptionsController], providers: [SubscriptionsService, SubscriptionPaymentActivationService, SubscriptionPaymentActivationScheduler, SubscriptionExpirationService, SubscriptionExpirationScheduler, SubscriptionRenewalPreparationService, SubscriptionRenewalApplicationService], exports: [SubscriptionsService, SubscriptionPaymentActivationService, SubscriptionExpirationService, SubscriptionRenewalPreparationService, SubscriptionRenewalApplicationService] })
export class SubscriptionsModule {}
