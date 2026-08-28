import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentAttempt,
  PaymentAttemptOperation,
  PaymentAttemptStatus,
  PaymentProviderOrderStatus,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  SubscriptionActivationSource,
  SubscriptionStatus,
} from '@prisma/client';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BillingProviderCredentialsService } from '../billing-settings/billing-provider-credentials.service';
import type { EffectiveProviderCredential } from '../billing-settings/provider-credential.types';
import type { CheckoutConfirmationResponseDto } from './dto/checkout-confirmation-response.dto';
import type { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { ProviderRegistryService } from './providers/provider-registry.service';

const CURRENT_ORDER_STATUSES = [PaymentProviderOrderStatus.CREATED, PaymentProviderOrderStatus.PAID];

type ConfirmationPayment = Prisma.PaymentGetPayload<{
  include: {
    subscription: true;
    orders: true;
  };
}>;

@Injectable()
export class PaymentCheckoutConfirmationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: BillingProviderCredentialsService,
    private readonly providers: ProviderRegistryService,
  ) {}

  async confirm(paymentId: string, dto: ConfirmCheckoutDto, actor: AuthenticatedUser): Promise<CheckoutConfirmationResponseDto> {
    try {
      return await this.confirmLocked(paymentId, dto, actor);
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      try {
        return await this.confirmLocked(paymentId, dto, actor);
      } catch (retryError) {
        if (this.isUniqueViolation(retryError)) throw new ConflictException('Checkout confirmation evidence conflicts with an existing payment');
        throw retryError;
      }
    }
  }

  private confirmLocked(paymentId: string, dto: ConfirmCheckoutDto, actor: AuthenticatedUser): Promise<CheckoutConfirmationResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
      if (!locked.length) throw new NotFoundException('Payment not found');

      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          subscription: true,
          orders: { where: { status: { in: CURRENT_ORDER_STATUSES } }, orderBy: { sequence: 'desc' }, take: 1 },
        },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      this.assertTenantAccess(payment.companyId, actor);
      this.assertEligible(payment);

      const order = payment.orders[0];
      if (!order) throw new NotFoundException('Current provider order not found');
      this.assertOrder(payment, order, dto.providerOrderId);

      const existing = await tx.paymentAttempt.findFirst({
        where: { paymentId, operation: PaymentAttemptOperation.CHECKOUT_CONFIRMATION, status: PaymentAttemptStatus.SUCCEEDED },
      });
      if (existing) {
        this.assertExistingEvidence(payment, order, existing, dto.providerPaymentId);
        const credential = await this.resolveCredential(payment, order.credentialVersionId);
        await this.assertValidSignature(payment, order.providerOrderId, dto, credential);
        return this.response(payment, existing);
      }

      const competing = await tx.paymentAttempt.findFirst({
        where: {
          providerConfigurationId: payment.providerConfigurationId,
          providerPaymentId: dto.providerPaymentId,
          operation: PaymentAttemptOperation.CHECKOUT_CONFIRMATION,
          status: PaymentAttemptStatus.SUCCEEDED,
        },
      });
      if (competing) throw new ConflictException('Provider payment evidence is already bound to another payment');

      const credential = await this.resolveCredential(payment, order.credentialVersionId);
      await this.assertValidSignature(payment, order.providerOrderId, dto, credential);
      const sequence = await tx.paymentAttempt.aggregate({ where: { paymentId }, _max: { sequence: true } });
      const completedAt = new Date();
      const attempt = await tx.paymentAttempt.create({
        data: {
          paymentId,
          providerConfigurationId: payment.providerConfigurationId,
          credentialVersionId: order.credentialVersionId,
          providerOrderRecordId: order.id,
          sequence: (sequence._max.sequence ?? 0) + 1,
          operation: PaymentAttemptOperation.CHECKOUT_CONFIRMATION,
          status: PaymentAttemptStatus.SUCCEEDED,
          providerOrderId: order.providerOrderId,
          providerPaymentId: dto.providerPaymentId,
          providerStatus: 'checkout_signature_verified',
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          requestReference: `checkout-confirmation:${order.id}`,
          safeMetadata: { evidenceVersion: 1, verificationType: 'CHECKOUT_SIGNATURE', networkVerified: false },
          completedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: payment.companyId,
          actorUserId: actor.id,
          action: 'PAYMENT_CHECKOUT_CONFIRMATION_VERIFIED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            provider: payment.provider,
            providerMode: payment.providerMode,
            providerOrderRecordId: order.id,
            paymentAttemptId: attempt.id,
            verificationType: 'CHECKOUT_SIGNATURE',
            networkVerified: false,
          },
        },
      });
      return this.response(payment, attempt);
    });
  }

  private assertEligible(payment: ConfirmationPayment): void {
    if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_ACTIVATION) throw new ConflictException('Payment purpose is not eligible for checkout confirmation');
    if (payment.status !== PaymentStatus.PENDING) throw new ConflictException('Payment is not eligible for checkout confirmation');
    if (
      payment.subscription.id !== payment.subscriptionId ||
      payment.subscription.companyId !== payment.companyId ||
      payment.subscription.activationSource !== SubscriptionActivationSource.PAYMENT ||
      payment.subscription.status !== SubscriptionStatus.PENDING
    ) throw new ConflictException('Subscription is not eligible for checkout confirmation');
    if (payment.capturedProviderPaymentId !== null || payment.authorizedAt !== null || payment.capturedAt !== null || payment.failedAt !== null || payment.subscription.activatedByPaymentId !== null) {
      throw new ConflictException('Payment lifecycle evidence is not eligible for checkout confirmation');
    }
  }

  private assertOrder(payment: ConfirmationPayment, order: ConfirmationPayment['orders'][number], submittedOrderId: string): void {
    if (order.providerOrderId !== submittedOrderId) throw new BadRequestException('Checkout completion evidence does not match the provider order');
    if (
      order.paymentId !== payment.id ||
      order.providerConfigurationId !== payment.providerConfigurationId ||
      order.amountMinor !== payment.amountMinor ||
      order.currency !== payment.currency ||
      order.providerReceipt !== this.receipt(payment.id)
    ) throw new ConflictException('Stored provider order evidence is incompatible');
  }

  private assertExistingEvidence(
    payment: ConfirmationPayment,
    order: ConfirmationPayment['orders'][number],
    attempt: PaymentAttempt,
    providerPaymentId: string,
  ): void {
    if (attempt.providerPaymentId !== providerPaymentId) throw new ConflictException('Checkout confirmation conflicts with existing evidence');
    if (
      attempt.providerConfigurationId !== payment.providerConfigurationId ||
      attempt.credentialVersionId !== order.credentialVersionId ||
      attempt.providerOrderRecordId !== order.id ||
      attempt.providerOrderId !== order.providerOrderId ||
      attempt.amountMinor !== payment.amountMinor ||
      attempt.currency !== payment.currency ||
      !attempt.completedAt
    ) throw new ConflictException('Stored checkout confirmation evidence is incompatible');
  }

  private async resolveCredential(payment: ConfirmationPayment, credentialVersionId: string): Promise<EffectiveProviderCredential> {
    const credential = await this.credentials.resolveBoundCredentialForRecovery(
      payment.providerConfigurationId, credentialVersionId, payment.provider, payment.providerMode,
    );
    if (
      credential.providerConfigurationId !== payment.providerConfigurationId ||
      credential.credentialVersionId !== credentialVersionId ||
      credential.provider !== payment.provider ||
      credential.mode !== payment.providerMode
    ) throw new ConflictException('Bound payment provider credential is incompatible');
    return credential;
  }

  private async assertValidSignature(
    payment: ConfirmationPayment,
    storedProviderOrderId: string,
    dto: ConfirmCheckoutDto,
    credential: EffectiveProviderCredential,
  ): Promise<void> {
    let valid: boolean;
    try {
      valid = await this.providers.resolve(payment.provider).verifyCheckoutSignature(
        {
          provider: credential.provider,
          mode: credential.mode,
          providerConfigurationId: credential.providerConfigurationId,
          credentialVersionId: credential.credentialVersionId,
          credentials: credential.material,
        },
        { storedProviderOrderId, providerPaymentId: dto.providerPaymentId, signature: dto.signature },
      );
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Checkout confirmation verification failed');
    }
    if (!valid) throw new BadRequestException('Checkout confirmation verification failed');
  }

  private response(payment: ConfirmationPayment, attempt: PaymentAttempt): CheckoutConfirmationResponseDto {
    return {
      paymentId: payment.id,
      providerOrderId: attempt.providerOrderId!,
      providerPaymentId: attempt.providerPaymentId!,
      verificationStatus: 'VERIFIED',
      verifiedAt: attempt.completedAt!,
      paymentStatus: payment.status,
      subscriptionStatus: payment.subscription.status,
    };
  }

  private receipt(paymentId: string): string { return `pay_${paymentId.replaceAll('-', '').toLowerCase()}`; }
  private assertTenantAccess(companyId: string, actor: AuthenticatedUser): void { if (!isSuperAdmin(actor) && actor.companyId !== companyId) throw new ForbiddenException('Cross-tenant access is not allowed'); }
  private isUniqueViolation(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
}
