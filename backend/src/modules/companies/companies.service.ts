import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { throwIfPrismaConflict } from '../../common/utils/prisma-error.util';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    try {
      return await this.prisma.company.create({
        data: {
          name: dto.name.trim(),
          slug: dto.slug,
          status: dto.status,
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async findAll(
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
      ...(isSuperAdmin(user)
        ? {}
        : { id: user.companyId ?? '__missing_tenant__' }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.company.count({ where }),
    ]);

    return paginatedResult(data, total, query);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    this.assertTenantAccess(id, user);
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, user: AuthenticatedUser) {
    this.assertTenantAccess(id, user);
    await this.findOne(id, user);

    try {
      return await this.prisma.company.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async remove(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await Promise.all([
        tx.branch.updateMany({ where: { companyId: id }, data: { deletedAt } }),
        tx.department.updateMany({
          where: { companyId: id },
          data: { deletedAt },
        }),
        tx.designation.updateMany({
          where: { companyId: id },
          data: { deletedAt },
        }),
        tx.shift.updateMany({ where: { companyId: id }, data: { deletedAt } }),
      ]);
      return tx.company.update({
        where: { id },
        data: { deletedAt, status: CompanyStatus.SUSPENDED },
      });
    });
  }

  private assertTenantAccess(id: string, user: AuthenticatedUser): void {
    if (!isSuperAdmin(user) && user.companyId !== id) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
  }
}
