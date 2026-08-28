import { IsString, Matches, MaxLength } from 'class-validator';

const PROVIDER_ORDER_ID = /^order_[A-Za-z0-9]+$/;
const PROVIDER_PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;
const CHECKOUT_SIGNATURE = /^[a-f0-9]{64}$/;

export class ConfirmCheckoutDto {
  @IsString()
  @MaxLength(100)
  @Matches(PROVIDER_ORDER_ID)
  providerOrderId!: string;

  @IsString()
  @MaxLength(100)
  @Matches(PROVIDER_PAYMENT_ID)
  providerPaymentId!: string;

  @IsString()
  @MaxLength(64)
  @Matches(CHECKOUT_SIGNATURE)
  signature!: string;
}
