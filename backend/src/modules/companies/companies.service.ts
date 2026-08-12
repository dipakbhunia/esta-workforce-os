import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyStatus, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { throwIfPrismaConflict } from '../../common/utils/prisma-error.util';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const companyCounts = Prisma.validator<Prisma.CompanyInclude>()({
  _count: {
    select: {
      branches: { where: { deletedAt: null } },
      departments: { where: { deletedAt: null } },
      designations: { where: { deletedAt: null } },
      employees: { where: { deletedAt: null } },
      users: { where: { deletedAt: null } },
    },
  },
});

type CompanyWithCounts = Prisma.CompanyGetPayload<{
  include: typeof companyCounts;
}>;

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateCompanyDto,
    actor: AuthenticatedUser,
  ): Promise<CompanyResponseDto> {
    try {
      const company = await this.prisma.$transaction(async (tx): Promise<CompanyWithCounts> => {
        const created = await tx.company.create({
          data: this.createData(dto),
          include: companyCounts,
        });
        await tx.auditLog.create({
          data: {
            companyId: created.id,
            actorUserId: actor.id,
            action: 'COMPANY_CREATED',
            entityType: 'Company',
            entityId: created.id,
            metadata: { status: created.status },
          },
        });
        return created;
      });
      return this.toResponse(company);
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async findAll(
    query: CompanyQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<CompanyResponseDto>> {
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
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
        include: companyCounts,
      }),
      this.prisma.company.count({ where }),
    ]);

    return paginatedResult(data.map((company) => this.toResponse(company)), total, query);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<CompanyResponseDto> {
    this.assertTenantAccess(id, user);
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: companyCounts,
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.toResponse(company);
  }

  async update(
    id: string,
    dto: UpdateCompanyDto,
    user: AuthenticatedUser,
  ): Promise<CompanyResponseDto> {
    this.assertTenantAccess(id, user);
    const current = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Company not found');

    try {
      const company = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.company.update({
          where: { id },
          data: this.updateData(dto),
          include: companyCounts,
        });
        const changedFields = Object.keys(dto).filter(
          (field) => dto[field as keyof UpdateCompanyDto] !== undefined,
        );
        await tx.auditLog.create({
          data: {
            companyId: id,
            actorUserId: user.id,
            action: 'COMPANY_UPDATED',
            entityType: 'Company',
            entityId: id,
            metadata: { changedFields },
          },
        });
        if (dto.status !== undefined && dto.status !== current.status) {
          await tx.auditLog.create({
            data: {
              companyId: id,
              actorUserId: user.id,
              action: 'COMPANY_STATUS_CHANGED',
              entityType: 'Company',
              entityId: id,
              metadata: { from: current.status, to: dto.status },
            },
          });
        }
        return updated;
      });
      return this.toResponse(company);
    } catch (error) {
      throwIfPrismaConflict(error);
    }
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<CompanyResponseDto> {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const archived = await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      const updated = await tx.company.update({
        where: { id },
        data: { deletedAt, status: CompanyStatus.SUSPENDED },
        include: companyCounts,
      });
      await tx.auditLog.create({
        data: {
          companyId: id,
          actorUserId: actor.id,
          action: 'COMPANY_ARCHIVED',
          entityType: 'Company',
          entityId: id,
          metadata: { previousStatus: company.status },
        },
      });
      return updated;
    });
    return this.toResponse(archived);
  }

  private assertTenantAccess(id: string, user: AuthenticatedUser): void {
    if (!isSuperAdmin(user) && user.companyId !== id) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
  }

  private createData(dto: CreateCompanyDto): Prisma.CompanyCreateInput {
    return {
      name: this.normalizeRequiredText(dto.name, 'Company name'),
      slug: this.normalizeRequiredText(dto.slug, 'Company code'),
      primaryEmail: this.optionalText(dto.primaryEmail),
      phone: this.optionalText(dto.phone),
      website: this.optionalText(dto.website),
      country: this.optionalText(dto.country),
      timezone: dto.timezone === undefined
        ? 'UTC'
        : this.normalizeTimezone(dto.timezone),
      currency: this.optionalText(dto.currency)?.toUpperCase() ?? null,
      address: this.optionalText(dto.address),
      ...(dto.status !== undefined ? { status: this.normalizeStatus(dto.status) } : {}),
    };
  }

  private updateData(dto: UpdateCompanyDto): Prisma.CompanyUpdateInput {
    return {
      ...(dto.name !== undefined ? { name: this.normalizeRequiredText(dto.name, 'Company name') } : {}),
      ...(dto.slug !== undefined ? { slug: this.normalizeRequiredText(dto.slug, 'Company code') } : {}),
      ...(dto.primaryEmail !== undefined ? { primaryEmail: this.optionalText(dto.primaryEmail) } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.website !== undefined ? { website: this.optionalText(dto.website) } : {}),
      ...(dto.country !== undefined ? { country: this.optionalText(dto.country) } : {}),
      ...(dto.timezone !== undefined ? { timezone: this.normalizeTimezone(dto.timezone) } : {}),
      ...(dto.currency !== undefined ? { currency: this.optionalText(dto.currency)?.toUpperCase() ?? null } : {}),
      ...(dto.address !== undefined ? { address: this.optionalText(dto.address) } : {}),
      ...(dto.status !== undefined ? { status: this.normalizeStatus(dto.status) } : {}),
    };
  }

  private optionalText(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    return normalized || null;
  }

  private normalizeTimezone(value: string | null): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Timezone is required');
    }
    return value.trim();
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    field: string,
  ): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private normalizeStatus(value: CompanyStatus | null): CompanyStatus {
    if (!value || !Object.values(CompanyStatus).includes(value)) {
      throw new BadRequestException('Company status is invalid');
    }
    return value;
  }

  private toResponse(company: CompanyWithCounts): CompanyResponseDto {
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      primaryEmail: company.primaryEmail,
      phone: company.phone,
      website: company.website,
      country: company.country,
      timezone: company.timezone,
      currency: company.currency,
      address: company.address,
      status: company.status,
      counts: company._count,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}
