import { Injectable, NotFoundException } from '@nestjs/common';
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
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@Injectable()
export class DesignationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDesignationDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    await this.validateDepartment(dto.departmentId, companyId);
    try {
      return await this.prisma.designation.create({
        data: {
          companyId,
          departmentId: dto.departmentId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
        },
        include: { department: true },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async findAll(query: PaginationQueryDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const where: Prisma.DesignationWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              {
                department: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.designation.findMany({
        where,
        include: { department: true },
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.designation.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const designation = await this.prisma.designation.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { department: true },
    });
    if (!designation) throw new NotFoundException('Designation not found');
    return designation;
  }

  async update(
    id: string,
    dto: UpdateDesignationDto,
    user: AuthenticatedUser,
  ) {
    const companyId = requireTenantId(user);
    await this.findOne(id, user);
    await this.validateDepartment(dto.departmentId, companyId);
    try {
      return await this.prisma.designation.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId }
            : {}),
        },
        include: { department: true },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { designationId: id },
        data: { designationId: null },
      });
      await tx.employee.updateMany({
        where: { designationId: id },
        data: { designationId: null },
      });
      return tx.designation.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  private async validateDepartment(
    departmentId: string | undefined,
    companyId: string,
  ): Promise<void> {
    if (!departmentId) return;
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found in this tenant');
    }
  }
}
