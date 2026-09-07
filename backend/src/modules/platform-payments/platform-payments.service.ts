import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PlatformPaymentQueryDto } from './dto/platform-payment-query.dto';
import { mapPlatformPayment } from './platform-payment.mapper';

const ACTIVATION_BLOCKED = 'SUBSCRIPTION_PAYMENT_ACTIVATION_BLOCKED';

const paymentSelect = {
  id: true,
  purpose: true,
  amountMinor: true,
  currency: true,
  status: true,
  provider: true,
  providerMode: true,
  providerStatus: true,
  failureCode: true,
  safeFailureMessage: true,
  authorizedAt: true,
  capturedAt: true,
  failedAt: true,
  capturedProviderPaymentId: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  subscription: {
    select: {
      id: true,
      status: true,
      activationSource: true,
      activatedByPaymentId: true,
      planId: true,
      planCodeSnapshot: true,
      planNameSnapshot: true,
    },
  },
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PlatformPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PlatformPaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.status && { status: query.status }),
      ...(query.provider && { provider: query.provider }),
      ...(query.mode && { providerMode: query.mode }),
      ...(query.purpose && { purpose: query.purpose }),
      ...(query.subscriptionId && { subscriptionId: query.subscriptionId }),
      ...(query.from && query.to && {
        createdAt: { gte: new Date(query.from), lt: new Date(query.to) },
      }),
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const [payments, total] = await Promise.all([
        tx.payment.findMany({
          where,
          ...paginationArgs(query),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: paymentSelect,
        }),
        tx.payment.count({ where }),
      ]);
      const paymentIds = payments.map((payment) => payment.id);
      if (paymentIds.length === 0) return { payments, total, orders: [], audits: [] };

      const [orders, audits] = await Promise.all([
        tx.paymentProviderOrder.findMany({
          where: { paymentId: { in: paymentIds } },
          orderBy: [{ paymentId: 'asc' }, { sequence: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            paymentId: true,
            sequence: true,
            providerOrderId: true,
            status: true,
            providerStatus: true,
          },
        }),
        tx.auditLog.findMany({
          where: {
            action: ACTIVATION_BLOCKED,
            entityType: 'Payment',
            entityId: { in: paymentIds },
          },
          select: { companyId: true, entityId: true, metadata: true },
        }),
      ]);
      return { payments, total, orders, audits };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const currentOrder = new Map<string, (typeof result.orders)[number]>();
    for (const order of result.orders) {
      const current = currentOrder.get(order.paymentId);
      if (!current || order.sequence > current.sequence ||
        (order.sequence === current.sequence && order.id > current.id)) {
        currentOrder.set(order.paymentId, order);
      }
    }
    const blocked = new Set<string>();
    for (const payment of result.payments) {
      if (result.audits.some((audit) => {
        const metadata = audit.metadata;
        return audit.entityId === payment.id &&
          audit.companyId === payment.company.id &&
          typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) &&
          (metadata as Prisma.JsonObject).subscriptionId === payment.subscription.id;
      })) blocked.add(payment.id);
    }

    return paginatedResult(
      result.payments.map((payment) =>
        mapPlatformPayment(payment, currentOrder.get(payment.id) ?? null, blocked.has(payment.id)),
      ),
      result.total,
      query,
    );
  }
}
