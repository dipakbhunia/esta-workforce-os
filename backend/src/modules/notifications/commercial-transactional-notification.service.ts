import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';
import { getEmailEventPolicy } from './email-event-policy.registry';
import type { CommercialInvoiceEmailPayload, CommercialPaymentEmailPayload } from './email-composition.types';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';

type CommercialType = typeof NotificationType.PAYMENT_CAPTURED | typeof NotificationType.PAYMENT_FAILED | typeof NotificationType.INVOICE_ISSUED;

@Injectable()
export class CommercialTransactionalNotificationService {
  constructor(private readonly recipients: CommercialBillingRecipientResolver) {}

  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: { type: CommercialType; sourceId: string; companyId: string; payload: CommercialPaymentEmailPayload | CommercialInvoiceEmailPayload },
  ): Promise<boolean> {
    const recipient = await this.recipients.resolveInTransaction(tx, input.companyId);
    if (!recipient || recipient.companyId !== input.companyId) return false;
    const composition = emailRendererRegistry.render(input.type, input.payload as never);
    const policy = getEmailEventPolicy(input.type);
    try {
      await tx.notification.create({ data: {
        companyId: input.companyId, userId: recipient.userId, type: input.type, channel: NotificationChannel.EMAIL,
        title: composition.subject, message: composition.message, status: NotificationStatus.PENDING,
        detailsPath: null,
        idempotencyKey: policy.buildIdempotencyKey({ sourceId: input.sourceId, userId: recipient.userId, channel: NotificationChannel.EMAIL }),
        deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: recipient.email, status: NotificationStatus.PENDING } },
      } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && Array.isArray(error.meta?.target) && error.meta.target.length === 1 && error.meta.target[0] === 'idempotencyKey') return false;
      throw error;
    }
  }
}
