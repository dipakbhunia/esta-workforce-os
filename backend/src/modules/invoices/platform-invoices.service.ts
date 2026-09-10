import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationArgs, paginatedResult } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { PlatformInvoiceQueryDto } from './dto/platform-invoice.dto';
import {
  mapPlatformInvoiceDetails,
  mapPlatformInvoiceSummary,
  platformInvoiceDetailsSelect,
  platformInvoiceListSelect,
} from './platform-invoice.mapper';

@Injectable()
export class PlatformInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PlatformInvoiceQueryDto) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.subscriptionId && { sourceSubscriptionId: query.subscriptionId }),
      ...(query.sourcePaymentId && { sourcePaymentId: query.sourcePaymentId }),
      ...(query.invoiceNumber && { invoiceNumber: query.invoiceNumber }),
      ...(query.from && query.to && {
        issuedAt: { gte: new Date(query.from), lt: new Date(query.to) },
      }),
    };

    const [invoices, total] = await this.prisma.$transaction(
      async (tx) => Promise.all([
        tx.invoice.findMany({
          where,
          ...paginationArgs(query),
          orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
          select: platformInvoiceListSelect,
        }),
        tx.invoice.count({ where }),
      ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return paginatedResult(invoices.map(mapPlatformInvoiceSummary), total, query);
  }

  async findOne(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: platformInvoiceDetailsSelect,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return mapPlatformInvoiceDetails(invoice);
  }
}
