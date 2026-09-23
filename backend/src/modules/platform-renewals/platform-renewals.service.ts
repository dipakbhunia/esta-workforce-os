import {
  ConflictException, Injectable, InternalServerErrorException, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import {
  RenewalPreparationError, SubscriptionRenewalPreparationService,
} from '../subscriptions/subscription-renewal-preparation.service';
import { SubscriptionRenewalApplicationService } from '../subscriptions/subscription-renewal-application.service';
import { PlatformRenewalQueryDto } from './dto/platform-renewal-query.dto';
import {
  mapPlatformRenewal, mapPlatformRenewalDetails, platformRenewalDetailsSelect, platformRenewalListSelect,
} from './platform-renewal.mapper';

@Injectable()
export class PlatformRenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: SubscriptionRenewalPreparationService,
    private readonly application: SubscriptionRenewalApplicationService,
  ) {}

  async findAll(query: PlatformRenewalQueryDto) {
    const where: Prisma.SubscriptionRenewalWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.subscriptionId && { subscriptionId: query.subscriptionId }),
      ...(query.paymentId && { paymentId: query.paymentId }),
      ...(query.status && { status: query.status }),
      ...(query.billingInterval && { billingInterval: query.billingInterval }),
      ...(query.from && query.to && { createdAt: { gte: new Date(query.from), lt: new Date(query.to) } }),
    };
    const [rows, total] = await this.prisma.$transaction(
      async tx => Promise.all([
        tx.subscriptionRenewal.findMany({ where, ...paginationArgs(query),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: platformRenewalListSelect }),
        tx.subscriptionRenewal.count({ where }),
      ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return paginatedResult(rows.map(mapPlatformRenewal), total, query);
  }

  async findOne(id: string) {
    const row = await this.prisma.subscriptionRenewal.findUnique({ where: { id }, select: platformRenewalDetailsSelect });
    if (!row) throw new NotFoundException('Renewal not found');
    return mapPlatformRenewalDetails(row);
  }

  async prepare(subscriptionId: string, actorUserId: string) {
    try {
      return await this.preparation.prepare(subscriptionId, { source: 'MANUAL', actorUserId });
    } catch (error) {
      throw this.mapPreparationError(error);
    }
  }

  async recover(id: string) {
    const renewal = await this.prisma.subscriptionRenewal.findUnique({
      where: { id }, select: { id: true, subscriptionId: true, paymentId: true, status: true },
    });
    if (!renewal) throw new NotFoundException('Renewal not found');
    try {
      const result = await this.application.apply(renewal.paymentId);
      if (result.outcome === 'NOT_READY') {
        throw new ConflictException({ message: 'Renewal payment is not captured', code: 'PAYMENT_NOT_CAPTURED' });
      }
      if (result.outcome === 'BLOCKED') {
        throw new ConflictException({ message: 'Renewal recovery is blocked', code: result.code });
      }
      return result;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Renewal recovery failed');
    }
  }

  private mapPreparationError(error: unknown): Error {
    if (!(error instanceof RenewalPreparationError)) return new InternalServerErrorException('Renewal preparation failed');
    if (error.code === 'SUBSCRIPTION_NOT_FOUND') return new NotFoundException(error.message);
    if (['UNSUPPORTED_RENEWAL_PATH', 'UNSUPPORTED_INTERVAL', 'INVALID_CYCLE_BOUNDARY',
      'COMMERCIAL_SNAPSHOT_INCOMPLETE', 'COMMERCIAL_SNAPSHOT_INVALID'].includes(error.code)) {
      return new UnprocessableEntityException({ message: error.message, code: error.code });
    }
    return new ConflictException({ message: error.message, code: error.code });
  }
}
