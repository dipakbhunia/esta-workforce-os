import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ProviderRuntimeModule } from './provider-runtime.module';
import { PaymentProviderOrdersService } from './payment-provider-orders.service';
import { PaymentCheckoutConfirmationsService } from './payment-checkout-confirmations.service';
import { PaymentProviderEventsService } from './payment-provider-events.service';
import { PaymentProviderEventRecoveryScheduler } from './payment-provider-event-recovery.scheduler';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({ imports: [ProviderRuntimeModule, SubscriptionsModule], controllers: [PaymentsController, PaymentWebhooksController], providers: [PaymentsService, PaymentProviderOrdersService, PaymentCheckoutConfirmationsService, PaymentProviderEventsService, PaymentProviderEventRecoveryScheduler], exports: [PaymentsService, PaymentProviderOrdersService, PaymentCheckoutConfirmationsService, PaymentProviderEventsService] })
export class PaymentsModule {}
