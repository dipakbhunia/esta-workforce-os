import { Injectable } from '@nestjs/common';
import { MonitoringAlertSeverity, RoleName } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

interface AlertRecipientInput {
  companyId: string;
  employeeId: string | null;
  severity: MonitoringAlertSeverity;
}

export interface NotificationRecipient {
  userId: string;
  email: string;
  companyId: string | null;
}

@Injectable()
export class NotificationRecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForAlert(input: AlertRecipientInput): Promise<NotificationRecipient[]> {
    const recipients = new Map<string, NotificationRecipient>();
    const addUser = (user: { id: string; email: string; companyId: string | null } | null | undefined) => {
      if (user?.id && !recipients.has(user.id)) recipients.set(user.id, { userId: user.id, email: user.email, companyId: user.companyId });
    };

    const roleUsers = await this.prisma.user.findMany({
      where: {
        companyId: input.companyId,
        deletedAt: null,
        status: 'ACTIVE',
        roles: { some: { role: { systemName: { in: [RoleName.COMPANY_ADMIN, RoleName.HR] } } } },
      },
      select: { id: true, email: true, companyId: true },
      take: 50,
    });
    roleUsers.forEach(addUser);

    if (input.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
        include: {
          user: { select: { id: true, email: true, companyId: true } },
          reportingManager: { include: { user: { select: { id: true, email: true, companyId: true } } } },
        },
      });
      addUser(employee?.reportingManager?.user);
      if (input.severity !== MonitoringAlertSeverity.WARNING) addUser(employee?.user);
    }

    return [...recipients.values()];
  }
}
