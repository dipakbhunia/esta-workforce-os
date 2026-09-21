import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingInterval,
  Payment,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  SubscriptionActivationSource,
  SubscriptionStatus,
} from '@prisma/client';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertPaymentAmount, assertPaymentCurrency } from './payment-money.util';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { GstTaxDomainError, SubscriptionTaxCalculationService } from './subscription-tax-calculation.service';

const SUPPORTED_INTERVALS: readonly BillingInterval[] = [BillingInterval.MONTHLY, BillingInterval.YEARLY];

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly taxes: SubscriptionTaxCalculationService) {}

  async createForSubscription(subscriptionId: string, actor: AuthenticatedUser): Promise<PaymentResponseDto> {
    const payment = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CompanySubscription" WHERE "id" = ${subscriptionId}::uuid FOR UPDATE`);
        const subscription = await tx.companySubscription.findUnique({ where: { id: subscriptionId } });
        if (!subscription) throw new NotFoundException('Subscription not found');
        this.assertTenantAccess(subscription.companyId, actor);
        this.assertEligibleSubscription(subscription);

        const existing = await tx.payment.findFirst({
          where: { subscriptionId, purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION },
        });
        if (existing) {
          this.assertCompatible(existing, subscription.id, subscription.companyId);
          try { await this.taxes.assertPersistedPayment(tx, existing, { recurringTotalPriceMinor: subscription.recurringTotalPriceMinor!, recurringCurrency: subscription.recurringCurrency! }); }
          catch (error) { this.mapTaxError(error); }
          return existing;
        }

        const provider = await tx.billingProviderConfiguration.findFirst({
          where: { enabled: true, isDefault: true },
        });
        if (!provider || !provider.enabled || !provider.isDefault) {
          throw new ConflictException('No enabled default payment provider is configured');
        }

        const decisionAt = new Date();
        let tax;
        try { tax = await this.taxes.resolve(tx, { companyId: subscription.companyId, recurringTotalPriceMinor: subscription.recurringTotalPriceMinor!, recurringCurrency: subscription.recurringCurrency! }, decisionAt); }
        catch (error) { this.mapTaxError(error); }
        const amountMinor = tax?.grossTotalMinor ?? subscription.recurringTotalPriceMinor!;
        const created = await tx.payment.create({
          data: {
            companyId: subscription.companyId,
            subscriptionId: subscription.id,
            providerConfigurationId: provider.id,
            purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION,
            status: PaymentStatus.PENDING,
            provider: provider.provider,
            providerMode: provider.mode,
            amountMinor,
            currency: subscription.recurringCurrency!,
            idempotencyKey: `subscription-activation:${subscription.id}`,
            businessReference: `subscription-activation:${subscription.id}`,
            createdByUserId: actor.id,
            ...(tax ? { taxSnapshot: { create: {
              company: { connect: { id: subscription.companyId } },
              sourceSubscription: { connect: { id_companyId: { id: subscription.id, companyId: subscription.companyId } } },
              policyVersion: { connect: { id: tax.policyVersionId } },
              treatment: tax.treatment, calculationVersion: tax.calculationVersion, decisionAt: tax.decisionAt,
              currency: tax.currency, taxableSubtotalMinor: tax.taxableSubtotalMinor, totalTaxMinor: tax.totalTaxMinor,
              grossTotalMinor: tax.grossTotalMinor, jurisdictionClassification: tax.jurisdictionClassification,
              serviceClassification: tax.serviceClassification, roundingMode: tax.roundingMode, sellerGstin: tax.sellerGstin,
              sellerLegalName: tax.sellerLegalName, sellerRegisteredState: tax.sellerRegisteredState,
              sellerRegisteredStateCode: tax.sellerRegisteredStateCode, buyerRegistrationStatus: tax.buyerRegistrationStatus,
              buyerGstin: tax.buyerGstin, buyerBillingState: tax.buyerBillingState, buyerBillingStateCode: tax.buyerBillingStateCode,
              placeOfSupplyState: tax.placeOfSupplyState, placeOfSupplyStateCode: tax.placeOfSupplyStateCode,
              components: { create: tax.components.map((component) => component) },
            } } } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: subscription.companyId,
            actorUserId: actor.id,
            action: 'PAYMENT_CREATED',
            entityType: 'Payment',
            entityId: created.id,
            metadata: {
              subscriptionId: subscription.id,
              purpose: created.purpose,
              provider: created.provider,
              providerMode: created.providerMode,
            },
          },
        });
        return created;
    });
    return this.toResponse(payment);
  }

  async createForRenewal(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      subscriptionId: string;
      cycleStart: Date;
      recurringTotalPriceMinor: bigint;
      recurringCurrency: string;
    },
    actorUserId: string | null,
  ): Promise<Payment> {
    const provider = await tx.billingProviderConfiguration.findFirst({ where: { enabled: true, isDefault: true } });
    if (!provider) throw new ConflictException('No enabled default payment provider is configured');
    let tax;
    try {
      tax = await this.taxes.resolve(tx, input, new Date());
    } catch (error) {
      this.mapTaxError(error);
    }
    const amountMinor = tax?.grossTotalMinor ?? input.recurringTotalPriceMinor;
    assertPaymentAmount(amountMinor);
    assertPaymentCurrency(input.recurringCurrency);
    const reference = `subscription-renewal:${input.subscriptionId}:${input.cycleStart.toISOString()}`;
    const payment = await tx.payment.create({ data: {
      companyId: input.companyId,
      subscriptionId: input.subscriptionId,
      providerConfigurationId: provider.id,
      purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL,
      status: PaymentStatus.PENDING,
      provider: provider.provider,
      providerMode: provider.mode,
      amountMinor,
      currency: input.recurringCurrency,
      idempotencyKey: reference,
      businessReference: reference,
      createdByUserId: actorUserId,
      ...(tax ? { taxSnapshot: { create: {
        company: { connect: { id: input.companyId } },
        sourceSubscription: { connect: { id_companyId: { id: input.subscriptionId, companyId: input.companyId } } },
        policyVersion: { connect: { id: tax.policyVersionId } },
        treatment: tax.treatment, calculationVersion: tax.calculationVersion, decisionAt: tax.decisionAt,
        currency: tax.currency, taxableSubtotalMinor: tax.taxableSubtotalMinor, totalTaxMinor: tax.totalTaxMinor,
        grossTotalMinor: tax.grossTotalMinor, jurisdictionClassification: tax.jurisdictionClassification,
        serviceClassification: tax.serviceClassification, roundingMode: tax.roundingMode, sellerGstin: tax.sellerGstin,
        sellerLegalName: tax.sellerLegalName, sellerRegisteredState: tax.sellerRegisteredState,
        sellerRegisteredStateCode: tax.sellerRegisteredStateCode, buyerRegistrationStatus: tax.buyerRegistrationStatus,
        buyerGstin: tax.buyerGstin, buyerBillingState: tax.buyerBillingState,
        buyerBillingStateCode: tax.buyerBillingStateCode, placeOfSupplyState: tax.placeOfSupplyState,
        placeOfSupplyStateCode: tax.placeOfSupplyStateCode,
        components: { create: tax.components.map(component => component) },
      } } } : {}),
    } });
    await tx.auditLog.create({ data: {
      companyId: input.companyId, actorUserId, action: 'PAYMENT_CREATED', entityType: 'Payment', entityId: payment.id,
      metadata: { subscriptionId: input.subscriptionId, purpose: payment.purpose, provider: payment.provider, providerMode: payment.providerMode },
    } });
    return payment;
  }

  async assertRenewalPayment(
    tx: Prisma.TransactionClient,
    payment: Payment,
    authority: { recurringTotalPriceMinor: bigint; recurringCurrency: string },
  ): Promise<void> {
    if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_RENEWAL) {
      throw new ConflictException('Existing renewal Payment purpose is incompatible');
    }
    try {
      await this.taxes.assertPersistedPayment(tx, payment, authority);
    } catch (error) {
      this.mapTaxError(error);
    }
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    this.assertTenantAccess(payment.companyId, actor);
    return this.toResponse(payment);
  }

  private assertEligibleSubscription(subscription: {
    activationSource: SubscriptionActivationSource;
    status: SubscriptionStatus;
    recurringTotalPriceMinor: bigint | null;
    recurringCurrency: string | null;
    pricingInterval: BillingInterval | null;
    pricingResolvedAt: Date | null;
  }): void {
    if (subscription.activationSource !== SubscriptionActivationSource.PAYMENT) {
      throw new BadRequestException('Subscription is not configured for payment activation');
    }
    if (subscription.status !== SubscriptionStatus.PENDING) {
      throw new BadRequestException('Only a pending subscription is eligible for payment creation');
    }
    if (
      subscription.recurringTotalPriceMinor === null ||
      subscription.recurringCurrency === null ||
      subscription.pricingInterval === null ||
      subscription.pricingResolvedAt === null
    ) {
      throw new BadRequestException('Subscription commercial pricing is unresolved');
    }
    if (!SUPPORTED_INTERVALS.includes(subscription.pricingInterval)) {
      throw new BadRequestException('Subscription pricing interval is unsupported');
    }
    try {
      assertPaymentAmount(subscription.recurringTotalPriceMinor);
      assertPaymentCurrency(subscription.recurringCurrency);
    } catch {
      throw new BadRequestException('Subscription commercial pricing is invalid');
    }
  }

  private assertCompatible(payment: Payment, subscriptionId: string, companyId: string): void {
    if (
      payment.subscriptionId !== subscriptionId ||
      payment.companyId !== companyId ||
      payment.purpose !== PaymentPurpose.SUBSCRIPTION_ACTIVATION
    ) {
      throw new ConflictException('An incompatible durable activation payment already exists');
    }
  }

  private mapTaxError(error: unknown): never {
    if (error instanceof GstTaxDomainError) throw new ConflictException(error.message);
    throw error;
  }

  private assertTenantAccess(companyId: string, actor: AuthenticatedUser): void {
    if (!isSuperAdmin(actor) && actor.companyId !== companyId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
  }

  private toResponse(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      companyId: payment.companyId,
      subscriptionId: payment.subscriptionId,
      purpose: payment.purpose,
      status: payment.status,
      provider: payment.provider,
      providerMode: payment.providerMode,
      amountMinor: payment.amountMinor.toString(10),
      currency: payment.currency,
      providerStatus: payment.providerStatus,
      capturedProviderPaymentId: payment.capturedProviderPaymentId,
      authorizedAt: payment.authorizedAt,
      capturedAt: payment.capturedAt,
      failedAt: payment.failedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
