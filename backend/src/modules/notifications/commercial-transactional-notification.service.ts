import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { emailRendererRegistry } from './email-renderer.registry';
import { EmailDeliveryPolicy, getEmailEventPolicy } from './email-event-policy.registry';
import { EmailPreferencePolicyId, EmailQuietHoursPolicyId, type CommercialInvoiceEmailPayload, type CommercialPaymentEmailPayload, type CommercialRenewalBlockedEmailPayload, type CommercialRenewalPeriodEmailPayload, type CommercialSubscriptionActivatedEmailPayload, type CommercialSubscriptionExpiredEmailPayload } from './email-composition.types';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';

type CommercialType = typeof NotificationType.PAYMENT_CAPTURED | typeof NotificationType.PAYMENT_FAILED | typeof NotificationType.INVOICE_ISSUED |
  typeof NotificationType.SUBSCRIPTION_ACTIVATED | typeof NotificationType.SUBSCRIPTION_EXPIRED | typeof NotificationType.RENEWAL_APPLIED |
  typeof NotificationType.RENEWAL_BLOCKED | typeof NotificationType.RENEWAL_PREPARED;
type CommercialPayload = CommercialPaymentEmailPayload | CommercialInvoiceEmailPayload | CommercialSubscriptionActivatedEmailPayload |
  CommercialSubscriptionExpiredEmailPayload | CommercialRenewalPeriodEmailPayload | CommercialRenewalBlockedEmailPayload;

@Injectable()
export class CommercialTransactionalNotificationService {
  constructor(private readonly recipients: CommercialBillingRecipientResolver) {}

  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: { type: CommercialType; sourceId: string; companyId: string; payload: CommercialPayload },
  ): Promise<boolean> {
    const recipient = await this.recipients.resolveInTransaction(tx, input.companyId);
    if (!recipient || recipient.companyId !== input.companyId) return false;
    const composition = emailRendererRegistry.render(input.type, input.payload as never);
    const policy = getEmailEventPolicy(input.type);
    let nextRetryAt: Date | null = null;
    if (policy.deliveryPolicy === EmailDeliveryPolicy.PREFERENCE_CONTROLLED) {
      if (policy.preferenceEvaluator !== EmailPreferencePolicyId.USER_EMAIL_ENABLED || policy.quietHours !== EmailQuietHoursPolicyId.NON_CRITICAL_EMAIL) {
        throw new Error('Commercial preference-controlled email policy is invalid');
      }
      const preference = await tx.notificationPreference.findUnique({ where: { userId: recipient.userId } });
      if (preference && !preference.emailEnabled) return false;
      nextRetryAt = this.quietHoursEnd(preference?.quietHoursStart, preference?.quietHoursEnd);
    } else if (policy.preferenceEvaluator !== EmailPreferencePolicyId.NONE || policy.quietHours !== EmailQuietHoursPolicyId.NONE) {
      throw new Error('Commercial mandatory email policy is invalid');
    }
    try {
      await tx.notification.create({ data: {
        companyId: input.companyId, userId: recipient.userId, type: input.type, channel: NotificationChannel.EMAIL,
        title: composition.subject, message: composition.message, status: NotificationStatus.PENDING,
        detailsPath: null,
        idempotencyKey: policy.buildIdempotencyKey({ sourceId: input.sourceId, userId: recipient.userId, channel: NotificationChannel.EMAIL }),
        deliveries: { create: { channel: NotificationChannel.EMAIL, recipient: recipient.email, status: NotificationStatus.PENDING, nextRetryAt } },
      } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && Array.isArray(error.meta?.target) && error.meta.target.length === 1 && error.meta.target[0] === 'idempotencyKey') return false;
      throw error;
    }
  }

  private quietHoursEnd(startValue?: string | null, endValue?: string | null, now = new Date()): Date | null {
    if (!startValue || !endValue) return null;
    const start = this.minutes(startValue);
    const end = this.minutes(endValue);
    if (start === null || end === null || start === end) return null;
    const current = now.getUTCHours() * 60 + now.getUTCMinutes();
    const inQuiet = start < end ? current >= start && current < end : current >= start || current < end;
    if (!inQuiet) return null;
    const delayMinutes = current < end ? end - current : 24 * 60 - current + end;
    return new Date(now.getTime() + delayMinutes * 60_000);
  }

  private minutes(value: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
  }
}
