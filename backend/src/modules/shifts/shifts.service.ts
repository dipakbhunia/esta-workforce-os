import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { throwIfPrismaConflict } from '../../common/utils/prisma-error.util';
import { requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShiftDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    this.validateTimes(dto.startTime, dto.endTime);
    this.validateTimezone(dto.timezone);
    try {
      return await this.prisma.shift.create({
        data: {
          companyId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          startTime: dto.startTime,
          endTime: dto.endTime,
          timezone: dto.timezone,
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async findAll(query: PaginationQueryDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const where: Prisma.ShiftWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { timezone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.shift.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const shift = await this.prisma.shift.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async update(id: string, dto: UpdateShiftDto, user: AuthenticatedUser) {
    const shift = await this.findOne(id, user);
    const startTime = dto.startTime ?? shift.startTime;
    const endTime = dto.endTime ?? shift.endTime;
    this.validateTimes(startTime, endTime);
    if (dto.timezone !== undefined) this.validateTimezone(dto.timezone);
    try {
      return await this.prisma.shift.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
          ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { shiftId: id },
        data: { shiftId: null },
      });
      await tx.employee.updateMany({
        where: { shiftId: id },
        data: { shiftId: null },
      });
      return tx.shift.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  private validateTimes(startTime: string, endTime: string): void {
    if (startTime === endTime) {
      throw new BadRequestException('Shift start and end times must differ');
    }
  }

  private validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException('Invalid IANA timezone');
    }
  }
}
