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
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    await this.validateBranch(dto.branchId, companyId);
    try {
      return await this.prisma.department.create({
        data: {
          companyId,
          branchId: dto.branchId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
        },
        include: { branch: true },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async findAll(query: PaginationQueryDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const where: Prisma.DepartmentWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              {
                branch: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        include: { branch: true },
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const department = await this.prisma.department.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { branch: true },
    });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    user: AuthenticatedUser,
  ) {
    const companyId = requireTenantId(user);
    await this.findOne(id, user);
    await this.validateBranch(dto.branchId, companyId);
    try {
      return await this.prisma.department.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        },
        include: { branch: true },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.designation.updateMany({
        where: { departmentId: id, deletedAt: null },
        data: { departmentId: null },
      });
      await tx.user.updateMany({
        where: { departmentId: id },
        data: { departmentId: null },
      });
      await tx.employee.updateMany({
        where: { departmentId: id },
        data: { departmentId: null },
      });
      return tx.department.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  private async validateBranch(
    branchId: string | undefined,
    companyId: string,
  ): Promise<void> {
    if (!branchId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found in this tenant');
    }
  }
}
