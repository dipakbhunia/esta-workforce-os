import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BreakPolicyQueryDto } from './dto/break-policy-query.dto';
import { CreateBreakPolicyDto } from './dto/create-break-policy.dto';
import { UpdateBreakPolicyDto } from './dto/update-break-policy.dto';

@Injectable()
export class BreakPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBreakPolicyDto, actor: AuthenticatedUser) {
    const companyId = this.resolveManageCompanyId(actor, dto.companyId);
    await this.assertUniqueCode(companyId, dto.code);
    return this.prisma.breakPolicy.create({
      data: {
        companyId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        allowedMinutes: dto.allowedMinutes,
        isPaid: dto.isPaid ?? false,
        isActive: dto.isActive ?? true,
        autoPunchOutOnTimeout: dto.autoPunchOutOnTimeout ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findAll(query: BreakPolicyQueryDto, actor: AuthenticatedUser) {
    const where = this.visibilityWhere(actor, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.breakPolicy.findMany({
        where,
        ...paginationArgs(query),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.breakPolicy.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const policy = await this.prisma.breakPolicy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!policy) throw new NotFoundException('Break policy not found');
    if (!this.canView(actor, policy.companyId, policy.isActive)) {
      throw new ForbiddenException('Break policy is not visible');
    }
    return policy;
  }

  async update(id: string, dto: UpdateBreakPolicyDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.breakPolicy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Break policy not found');
    this.assertCanManage(actor, existing.companyId);
    if (dto.code && dto.code.toUpperCase() !== existing.code) {
      await this.assertUniqueCode(existing.companyId, dto.code, id);
    }
    return this.prisma.breakPolicy.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.allowedMinutes !== undefined ? { allowedMinutes: dto.allowedMinutes } : {}),
        ...(dto.isPaid !== undefined ? { isPaid: dto.isPaid } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.autoPunchOutOnTimeout !== undefined
          ? { autoPunchOutOnTimeout: dto.autoPunchOutOnTimeout }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.breakPolicy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Break policy not found');
    this.assertCanManage(actor, existing.companyId);
    return this.prisma.breakPolicy.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  private visibilityWhere(
    actor: AuthenticatedUser,
    query: BreakPolicyQueryDto,
  ): Prisma.BreakPolicyWhereInput {
    const base: Prisma.BreakPolicyWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) {
      if (!query.companyId) throw new BadRequestException('companyId is required');
      return { ...base, companyId: query.companyId };
    }
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    const employeeOnly =
      actor.roles.includes(RoleName.EMPLOYEE) &&
      !(
        actor.roles.includes(RoleName.COMPANY_ADMIN) ||
        actor.roles.includes(RoleName.HR) ||
        actor.roles.includes(RoleName.MANAGER)
      );
    return {
      ...base,
      companyId: actor.companyId,
      ...(employeeOnly ? { isActive: true } : {}),
    };
  }

  private canView(actor: AuthenticatedUser, companyId: string, isActive: boolean): boolean {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return true;
    if (actor.companyId !== companyId) return false;
    if (actor.roles.includes(RoleName.EMPLOYEE)) return isActive;
    return true;
  }

  private resolveManageCompanyId(actor: AuthenticatedUser, companyId?: string): string {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) {
      if (!companyId) throw new BadRequestException('companyId is required');
      return companyId;
    }
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    return actor.companyId;
  }

  private assertCanManage(actor: AuthenticatedUser, companyId: string): void {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return;
    if (actor.companyId !== companyId) {
      throw new ForbiddenException('Break policy is outside your company');
    }
  }

  private async assertUniqueCode(
    companyId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.breakPolicy.findFirst({
      where: {
        companyId,
        code: code.trim().toUpperCase(),
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new ConflictException('Break policy code already exists');
  }
}
