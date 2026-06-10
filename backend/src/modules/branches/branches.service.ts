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
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranchDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    try {
      return await this.prisma.branch.create({
        data: {
          companyId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          address: dto.address?.trim(),
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async findAll(query: PaginationQueryDto, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const where: Prisma.BranchWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { address: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.branch.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const companyId = requireTenantId(user);
    const branch = await this.prisma.branch.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
    user: AuthenticatedUser,
  ) {
    await this.findOne(id, user);
    try {
      return await this.prisma.branch.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.address !== undefined
            ? { address: dto.address.trim() || null }
            : {}),
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    const deletedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.department.updateMany({
        where: { branchId: id, deletedAt: null },
        data: { branchId: null },
      });
      await tx.user.updateMany({
        where: { branchId: id },
        data: { branchId: null },
      });
      await tx.employee.updateMany({
        where: { branchId: id },
        data: { branchId: null },
      });
      return tx.branch.update({ where: { id }, data: { deletedAt } });
    });
  }
}
