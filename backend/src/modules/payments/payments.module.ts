import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ProviderRuntimeModule } from './provider-runtime.module';
import { PaymentProviderOrdersService } from './payment-provider-orders.service';

@Module({ imports: [ProviderRuntimeModule], controllers: [PaymentsController], providers: [PaymentsService, PaymentProviderOrdersService], exports: [PaymentsService, PaymentProviderOrdersService] })
export class PaymentsModule {}
