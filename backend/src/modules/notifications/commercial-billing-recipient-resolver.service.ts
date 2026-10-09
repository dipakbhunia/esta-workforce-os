import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { NotificationRecipient } from './notification-recipient-resolver.service';

@Injectable()
export class CommercialBillingRecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(companyId: string): Promise<NotificationRecipient | null> {
    const profile = await this.prisma.companyBillingProfile.findFirst({
      where: { companyId, company: { deletedAt: null } },
      select: {
        companyId: true,
        billingContactUserId: true,
        billingContact: { select: { id: true, companyId: true, email: true, status: true, deletedAt: true } },
      },
    });
    const user = profile?.billingContact;
    if (!profile?.billingContactUserId || !user || user.id !== profile.billingContactUserId ||
        user.companyId !== profile.companyId || user.status !== UserStatus.ACTIVE || user.deletedAt ||
        !this.validEmail(user.email.trim())) return null;
    return { userId: user.id, companyId: user.companyId, email: user.email.trim().toLowerCase() };
  }

  private validEmail(value: string): boolean {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
