import {
  BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import {
  Payment, PaymentAttempt, PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderMode,
  PaymentProviderOrder, PaymentProviderOrderStatus, PaymentProviderType, PaymentStatus, Prisma, SubscriptionStatus,
} from '@prisma/client';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { BillingProviderCredentialsService } from '../billing-settings/billing-provider-credentials.service';
import type { EffectiveProviderCredential } from '../billing-settings/provider-credential.types';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertPaymentAmount, assertPaymentCurrency } from './payment-money.util';
import type { ProviderOrder, PaymentProviderContext } from './providers/payment-provider.interface';
import { ProviderOperationError } from './providers/provider-operation.error';
import { ProviderRegistryService } from './providers/provider-registry.service';
import type { ProviderOrderResponseDto } from './dto/provider-order-response.dto';

const CURRENT_ORDER_STATUSES = [PaymentProviderOrderStatus.CREATED, PaymentProviderOrderStatus.PAID];

type PaymentWithSubscription = Payment & { subscription: { status: SubscriptionStatus } };
type ReservedOperation = { payment: PaymentWithSubscription; attempt: PaymentAttempt; existingOrder: PaymentProviderOrder | null; fresh: boolean };

@Injectable()
export class PaymentProviderOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: BillingProviderCredentialsService,
    private readonly providers: ProviderRegistryService,
  ) {}

  async prepare(paymentId: string, actor: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    const initial = await this.loadPayment(paymentId, actor);
    this.assertEligiblePayment(initial);

    const current = await this.findCurrentOrder(initial.id);
    if (current) return this.response(initial, current, await this.resolveHistorical(initial, current.credentialVersionId));

    const existingAttempt = await this.prisma.paymentAttempt.findFirst({
      where: { paymentId, operation: PaymentAttemptOperation.ORDER_CREATE }, orderBy: { sequence: 'desc' },
    });
    if (existingAttempt) return this.resume(initial, existingAttempt, actor);

    const effective = await this.credentials.resolveForOperation(
      initial.providerConfigurationId, initial.provider, initial.providerMode,
    );
    const reserved = await this.reserve(initial.id, effective, actor);
    if (reserved.existingOrder) {
      return this.response(reserved.payment, reserved.existingOrder, await this.resolveHistorical(reserved.payment, reserved.existingOrder.credentialVersionId));
    }
    if (!reserved.fresh) return this.resume(reserved.payment, reserved.attempt, actor);
    return this.dispatch(reserved.payment, reserved.attempt, effective, actor);
  }

  private async reserve(paymentId: string, effective: EffectiveProviderCredential, actor: AuthenticatedUser): Promise<ReservedOperation> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { subscription: { select: { status: true } } } });
      if (!payment) throw new NotFoundException('Payment not found');
      this.assertTenantAccess(payment.companyId, actor);
      this.assertEligiblePayment(payment);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingProviderConfiguration" WHERE "id" = ${payment.providerConfigurationId}::uuid FOR UPDATE`);
      const configuration = await tx.billingProviderConfiguration.findUnique({ where: { id: payment.providerConfigurationId } });
      const credential = await tx.billingProviderCredential.findFirst({ where: { id: effective.credentialVersionId, providerConfigurationId: payment.providerConfigurationId } });
      if (!configuration?.enabled || configuration.provider !== payment.provider || configuration.mode !== payment.providerMode || credential?.retiredAt !== null) {
        throw new ConflictException('Payment provider eligibility changed before order reservation');
      }
      const existingOrder = await tx.paymentProviderOrder.findFirst({ where: { paymentId, status: { in: CURRENT_ORDER_STATUSES } } });
      const prior = await tx.paymentAttempt.findFirst({ where: { paymentId, operation: PaymentAttemptOperation.ORDER_CREATE }, orderBy: { sequence: 'desc' } });
      if (existingOrder || prior) return { payment, attempt: prior!, existingOrder, fresh: false };
      const attemptSequence = await tx.paymentAttempt.aggregate({ where: { paymentId }, _max: { sequence: true } });
      const attempt = await tx.paymentAttempt.create({ data: {
        paymentId, providerConfigurationId: payment.providerConfigurationId, credentialVersionId: effective.credentialVersionId,
        sequence: (attemptSequence._max.sequence ?? 0) + 1, operation: PaymentAttemptOperation.ORDER_CREATE, status: PaymentAttemptStatus.PENDING,
        amountMinor: payment.amountMinor, currency: payment.currency, requestReference: this.requestReference(payment.id),
        safeMetadata: { provider: payment.provider, providerMode: payment.providerMode },
      } });
      return { payment, attempt, existingOrder: null, fresh: true };
    });
  }

  private async resume(payment: PaymentWithSubscription, attempt: PaymentAttempt, actor: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    this.assertAttemptCompatible(payment, attempt);
    if (attempt.status === PaymentAttemptStatus.SUCCEEDED) {
      const order = await this.findCurrentOrder(payment.id);
      if (!order) throw new ConflictException('Provider order history is inconsistent');
      return this.response(payment, order, await this.resolveHistorical(payment, order.credentialVersionId));
    }
    if (attempt.status === PaymentAttemptStatus.FAILED) throw new ConflictException('Provider order creation was definitively rejected');
    const historical = await this.resolveHistorical(payment, attempt.credentialVersionId!);
    if (attempt.status === PaymentAttemptStatus.UNKNOWN) return this.reconcile(payment, attempt, historical, actor);
    return this.dispatch(payment, attempt, historical, actor);
  }

  private async dispatch(payment: PaymentWithSubscription, attempt: PaymentAttempt, credential: EffectiveProviderCredential, actor: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    const claimed = await this.prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
      data: { status: PaymentAttemptStatus.UNKNOWN, completedAt: new Date(), failureCode: 'DISPATCH_STARTED', safeFailureMessage: 'Provider order dispatch requires confirmation' },
    });
    if (claimed.count !== 1) {
      const latest = await this.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      return this.resume(payment, latest, actor);
    }
    let durableOrder: PaymentProviderOrder;
    try {
      const adapter = this.providers.resolve(payment.provider);
      const order = await adapter.createOrder(this.context(credential), {
        amountMinor: payment.amountMinor, currency: payment.currency, receipt: this.receipt(payment.id),
        notes: { payment_id: payment.id, subscription_id: payment.subscriptionId },
      });
      this.assertProviderOrder(payment, order);
      durableOrder = await this.persistSuccess(payment, attempt, order, false, actor);
    } catch (error) {
      return this.handleProviderFailure(payment, attempt, error, actor);
    }
    return this.materializeResponse(payment, durableOrder);
  }

  private async reconcile(payment: PaymentWithSubscription, attempt: PaymentAttempt, credential: EffectiveProviderCredential, actor: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    let durableOrder: PaymentProviderOrder;
    try {
      const matches = await this.providers.resolve(payment.provider).findOrdersByReceipt(this.context(credential), this.receipt(payment.id));
      if (matches.length !== 1) {
        await this.keepUnknown(attempt.id, matches.length ? 'RECONCILIATION_CONFLICT' : 'RECONCILIATION_NOT_PROVEN', matches.length ? 'Provider reconciliation returned conflicting orders' : 'Provider order absence could not be proven');
        throw new ConflictException('Provider order result remains unknown and requires reconciliation');
      }
      this.assertProviderOrder(payment, matches[0]);
      durableOrder = await this.persistSuccess(payment, attempt, matches[0], true, actor);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      await this.keepUnknown(attempt.id, 'RECONCILIATION_UNAVAILABLE', 'Provider order reconciliation could not be completed');
      throw new ConflictException('Provider order result remains unknown and requires reconciliation');
    }
    return this.materializeResponse(payment, durableOrder);
  }

  private async persistSuccess(payment: PaymentWithSubscription, attempt: PaymentAttempt, providerOrder: ProviderOrder, recovered: boolean, actor: AuthenticatedUser): Promise<PaymentProviderOrder> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id}::uuid FOR UPDATE`);
      const durablePayment = await tx.payment.findUnique({ where: { id: payment.id }, include: { subscription: { select: { status: true } } } });
      if (!durablePayment) throw new NotFoundException('Payment not found');
      this.assertEligiblePayment(durablePayment);
      const durableAttempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      this.assertAttemptCompatible(durablePayment, durableAttempt);
      const existing = await tx.paymentProviderOrder.findFirst({ where: { paymentId: payment.id, status: { in: CURRENT_ORDER_STATUSES } } });
      if (existing) {
        this.assertExistingOrderMatchesProviderResult(payment, existing, providerOrder);
        if (durableAttempt.status === PaymentAttemptStatus.SUCCEEDED) {
          if (durableAttempt.providerOrderRecordId !== existing.id || durableAttempt.providerOrderId !== existing.providerOrderId) throw new ConflictException('Successful provider order attempt history is inconsistent');
          return existing;
        }
        if (durableAttempt.status === PaymentAttemptStatus.FAILED) throw new ConflictException('Failed provider order attempt cannot be rewritten as successful');
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: {
          status: PaymentAttemptStatus.SUCCEEDED, completedAt: new Date(), providerOrderRecordId: existing.id,
          providerOrderId: existing.providerOrderId, providerStatus: existing.providerStatus,
          failureCode: null, safeFailureMessage: null, safeMetadata: { recovered: true, resolution: 'existing-current-order' },
        } });
        await tx.auditLog.create({ data: {
          companyId: payment.companyId, actorUserId: actor.id,
          action: 'PAYMENT_PROVIDER_ORDER_RECONCILED', entityType: 'Payment', entityId: payment.id,
          metadata: { provider: payment.provider, providerMode: payment.providerMode, providerOrderId: existing.providerOrderId, receipt: existing.providerReceipt },
        } });
        return existing;
      }
      if (durableAttempt.status === PaymentAttemptStatus.SUCCEEDED || durableAttempt.status === PaymentAttemptStatus.FAILED) throw new ConflictException('Terminal provider order attempt history is inconsistent');
      const orderSequence = await tx.paymentProviderOrder.aggregate({ where: { paymentId: payment.id }, _max: { sequence: true } });
      const created = await tx.paymentProviderOrder.create({ data: {
        paymentId: payment.id, providerConfigurationId: payment.providerConfigurationId,
        credentialVersionId: durableAttempt.credentialVersionId!, sequence: (orderSequence._max.sequence ?? 0) + 1,
        status: this.orderStatus(providerOrder.status), providerOrderId: providerOrder.id,
        providerStatus: providerOrder.status, providerReceipt: providerOrder.receipt,
        amountMinor: providerOrder.amountMinor, currency: providerOrder.currency,
        providerCreatedAt: providerOrder.createdAt, safeMetadata: { recovered },
      } });
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: {
        status: PaymentAttemptStatus.SUCCEEDED, completedAt: new Date(), providerOrderRecordId: created.id,
        providerOrderId: created.providerOrderId, providerStatus: created.providerStatus,
        failureCode: null, safeFailureMessage: null, safeMetadata: { recovered },
      } });
      await tx.auditLog.create({ data: {
        companyId: payment.companyId, actorUserId: actor.id,
        action: recovered ? 'PAYMENT_PROVIDER_ORDER_RECONCILED' : 'PAYMENT_PROVIDER_ORDER_CREATED',
        entityType: 'Payment', entityId: payment.id,
        metadata: { provider: payment.provider, providerMode: payment.providerMode, providerOrderId: created.providerOrderId, receipt: created.providerReceipt },
      } });
      return created;
    });
  }

  private async handleProviderFailure(payment: PaymentWithSubscription, attempt: PaymentAttempt, error: unknown, actor: AuthenticatedUser): Promise<never> {
    const normalized = error instanceof ProviderOperationError ? error : new ProviderOperationError('AMBIGUOUS', 'PROVIDER_RESULT_UNKNOWN', 'Payment provider result is unknown');
    if (normalized.outcome === 'DEFINITE_FAILURE') {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.paymentAttempt.updateMany({ where: { id: attempt.id, status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.UNKNOWN] } }, data: { status: PaymentAttemptStatus.FAILED, completedAt: new Date(), failureCode: normalized.safeCode, safeFailureMessage: normalized.safeMessage } });
        if (changed.count === 1) await tx.auditLog.create({ data: { companyId: payment.companyId, actorUserId: actor.id, action: 'PAYMENT_PROVIDER_ORDER_FAILED', entityType: 'Payment', entityId: payment.id, metadata: { category: normalized.safeCode } } });
      });
      throw new BadGatewayException('Payment provider rejected the order request');
    }
    await this.keepUnknown(attempt.id, normalized.safeCode, normalized.safeMessage);
    throw new ConflictException('Provider order result is unknown and requires reconciliation');
  }

  private keepUnknown(id: string, failureCode: string, safeFailureMessage: string) {
    return this.prisma.paymentAttempt.updateMany({ where: { id, status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.UNKNOWN] } }, data: { status: PaymentAttemptStatus.UNKNOWN, completedAt: new Date(), failureCode, safeFailureMessage } });
  }

  private async materializeResponse(payment: Payment, order: PaymentProviderOrder): Promise<ProviderOrderResponseDto> {
    return this.response(payment, order, await this.resolveHistorical(payment, order.credentialVersionId));
  }

  private async loadPayment(id: string, actor: AuthenticatedUser): Promise<PaymentWithSubscription> {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { subscription: { select: { status: true } } } });
    if (!payment) throw new NotFoundException('Payment not found');
    this.assertTenantAccess(payment.companyId, actor);
    return payment;
  }
  private findCurrentOrder(paymentId: string) { return this.prisma.paymentProviderOrder.findFirst({ where: { paymentId, status: { in: CURRENT_ORDER_STATUSES } } }); }
  private resolveHistorical(payment: Payment, credentialVersionId: string) { return this.credentials.resolveBoundCredentialForRecovery(payment.providerConfigurationId, credentialVersionId, payment.provider, payment.providerMode); }
  private context(value: EffectiveProviderCredential): PaymentProviderContext { return { provider: value.provider, mode: value.mode, providerConfigurationId: value.providerConfigurationId, credentialVersionId: value.credentialVersionId, credentials: value.material }; }
  private receipt(paymentId: string): string { return `pay_${paymentId.replaceAll('-', '').toLowerCase()}`; }
  private requestReference(paymentId: string): string { return `order-create:${this.receipt(paymentId)}`; }
  private assertEligiblePayment(payment: PaymentWithSubscription): void {
    if (payment.status !== PaymentStatus.PENDING || payment.subscription.status !== SubscriptionStatus.PENDING) throw new BadRequestException('Only a pending payment and subscription can create a provider order');
    if (payment.provider !== PaymentProviderType.RAZORPAY || payment.providerMode !== PaymentProviderMode.TEST) throw new ConflictException('Provider order execution is available only for Razorpay TEST mode');
    assertPaymentAmount(payment.amountMinor); assertPaymentCurrency(payment.currency);
  }
  private assertAttemptCompatible(payment: Payment, attempt: PaymentAttempt): void {
    if (attempt.paymentId !== payment.id || attempt.providerConfigurationId !== payment.providerConfigurationId || !attempt.credentialVersionId || attempt.amountMinor !== payment.amountMinor || attempt.currency !== payment.currency || attempt.requestReference !== this.requestReference(payment.id)) throw new ConflictException('Provider order attempt evidence is incompatible');
  }
  private assertProviderOrder(payment: Payment, order: ProviderOrder): void {
    if (!order.id.trim() || order.amountMinor !== payment.amountMinor || order.currency !== payment.currency || order.receipt !== this.receipt(payment.id) || !['created', 'attempted', 'paid'].includes(order.status) || !order.createdAt || !Number.isFinite(order.createdAt.getTime())) throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_ORDER_MISMATCH', 'Payment provider response could not be verified');
  }
  private assertStoredOrder(payment: Payment, order: PaymentProviderOrder): void {
    if (order.paymentId !== payment.id || order.providerConfigurationId !== payment.providerConfigurationId || order.amountMinor !== payment.amountMinor || order.currency !== payment.currency || order.providerReceipt !== this.receipt(payment.id)) throw new ConflictException('Stored provider order evidence is incompatible');
  }
  private assertExistingOrderMatchesProviderResult(payment: Payment, order: PaymentProviderOrder, providerOrder: ProviderOrder): void {
    this.assertStoredOrder(payment, order);
    if (order.providerOrderId !== providerOrder.id || order.amountMinor !== providerOrder.amountMinor || order.currency !== providerOrder.currency || order.providerReceipt !== providerOrder.receipt || !order.providerCreatedAt || !providerOrder.createdAt || order.providerCreatedAt.getTime() !== providerOrder.createdAt.getTime()) {
      throw new ConflictException('Competing provider order evidence is incompatible');
    }
  }
  private orderStatus(status: string): PaymentProviderOrderStatus { return status === 'paid' ? PaymentProviderOrderStatus.PAID : PaymentProviderOrderStatus.CREATED; }
  private response(payment: Payment, order: PaymentProviderOrder, credential: EffectiveProviderCredential): ProviderOrderResponseDto {
    this.assertStoredOrder(payment, order);
    if (credential.credentialVersionId !== order.credentialVersionId || credential.providerConfigurationId !== order.providerConfigurationId || credential.provider !== payment.provider || credential.mode !== payment.providerMode) {
      throw new ConflictException('Provider order credential evidence is incompatible');
    }
    const keyId = credential.material.keyId;
    if (!keyId) throw new ConflictException('Checkout public key is unavailable');
    return { paymentId: payment.id, providerOrderId: order.providerOrderId, receipt: order.providerReceipt, provider: payment.provider, providerMode: payment.providerMode, status: order.status, providerStatus: order.providerStatus, amountMinor: order.amountMinor.toString(10), currency: order.currency, keyId, providerCreatedAt: order.providerCreatedAt };
  }
  private assertTenantAccess(companyId: string, actor: AuthenticatedUser): void { if (!isSuperAdmin(actor) && actor.companyId !== companyId) throw new ForbiddenException('Cross-tenant access is not allowed'); }
}
