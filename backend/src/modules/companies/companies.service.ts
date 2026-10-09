import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountActionTokenPurpose, CompanyStatus, EmployeeStatus, Prisma, RoleName, UserStatus } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { throwIfPrismaConflict } from '../../common/utils/prisma-error.util';
import { isSuperAdmin, requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateDesignatedLeaveApproverDto } from './dto/update-designated-leave-approver.dto';
import { DesignatedLeaveApproverResponseDto } from './dto/designated-leave-approver-response.dto';
import { UpdateDesignatedAttendanceApproverDto } from './dto/update-designated-attendance-approver.dto';
import { DesignatedAttendanceApproverResponseDto } from './dto/designated-attendance-approver-response.dto';
import { IdentityActionsService } from '../identity-actions/identity-actions.service';
import { EligibleBillingContactQueryDto, UpdateBillingContactDto } from './dto/billing-contact.dto';

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

const designatedApproverSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

type DesignatedApprover = Prisma.UserGetPayload<{
  select: typeof designatedApproverSelect;
}>;

const billingContactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

type BillingContact = Prisma.UserGetPayload<{ select: typeof billingContactSelect }>;

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService, private readonly identityActions: IdentityActionsService = undefined as never) {}

  async create(
    dto: CreateCompanyDto,
    actor: AuthenticatedUser,
  ) {
    try {
      const passwordHash = dto.initialAdmin ? await this.identityActions.unusablePasswordHash() : null;
      const result = await this.prisma.$transaction(async (tx) => {
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
        if (!dto.initialAdmin || !passwordHash) return { company: created, invitation: null };
        const role = await tx.role.create({
          data: { companyId: created.id, key: 'COMPANY_ADMIN', name: 'Company Admin', systemName: RoleName.COMPANY_ADMIN, description: 'Built-in tenant administrator role' },
        });
        const admin = await tx.user.create({
          data: {
            companyId: created.id,
            email: dto.initialAdmin.email.trim().toLowerCase(),
            firstName: dto.initialAdmin.firstName.trim(),
            lastName: dto.initialAdmin.lastName.trim(),
            passwordHash,
            status: UserStatus.INACTIVE,
            roles: { create: { roleId: role.id } },
          },
        });
        const token = await this.identityActions.issueTokenInTransaction(tx, {
          purpose: AccountActionTokenPurpose.INVITATION,
          userId: admin.id,
          companyId: created.id,
          createdByUserId: actor.id,
        });
        await tx.auditLog.createMany({
          data: [
            { companyId: created.id, actorUserId: actor.id, action: 'USER_INVITED', entityType: 'User', entityId: admin.id, metadata: { roleIds: [role.id], initialCompanyAdmin: true } },
            { companyId: created.id, actorUserId: actor.id, action: 'INITIAL_COMPANY_ADMIN_PROVISIONED', entityType: 'Company', entityId: created.id, metadata: { userId: admin.id, roleId: role.id } },
          ],
        });
        return { company: created, invitation: { tokenId: token.id, userId: admin.id, email: admin.email } };
      });
      if (!result.invitation) return this.toResponse(result.company);
      const queued = await this.identityActions.enqueueInvitation(result.invitation.tokenId, result.invitation.userId, result.company.name);
      return { ...this.toResponse(result.company), initialAdminInvitation: { userId: result.invitation.userId, email: result.invitation.email, queued } };
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

  async getDesignatedLeaveApprover(
    actor: AuthenticatedUser,
  ): Promise<DesignatedLeaveApproverResponseDto> {
    const companyId = requireTenantId(actor);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { designatedLeaveApproverUserId: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    return this.designatedApproverResponse(
      this.prisma,
      companyId,
      company.designatedLeaveApproverUserId,
    );
  }

  async updateDesignatedLeaveApprover(
    dto: UpdateDesignatedLeaveApproverDto,
    actor: AuthenticatedUser,
  ): Promise<DesignatedLeaveApproverResponseDto> {
    const companyId = requireTenantId(actor);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "Company"
        WHERE "id" = ${companyId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (locked.length !== 1) throw new NotFoundException('Company not found');

      const current = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { designatedLeaveApproverUserId: true },
      });
      const requestedId = dto.designatedLeaveApproverUserId;
      if (requestedId !== null) {
        await this.requireEligibleDesignatedApprover(tx, companyId, requestedId);
      }

      if (current.designatedLeaveApproverUserId === requestedId) {
        return this.designatedApproverResponse(tx, companyId, requestedId);
      }

      await tx.company.update({
        where: { id: companyId },
        data: { designatedLeaveApproverUserId: requestedId },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          actorUserId: actor.id,
          action: 'COMPANY_DESIGNATED_LEAVE_APPROVER_CHANGED',
          entityType: 'Company',
          entityId: companyId,
          metadata: {
            previousDesignatedLeaveApproverUserId:
              current.designatedLeaveApproverUserId,
            designatedLeaveApproverUserId: requestedId,
          },
        },
      });
      return this.designatedApproverResponse(tx, companyId, requestedId);
    });
  }

  async getDesignatedAttendanceApprover(
    actor: AuthenticatedUser,
  ): Promise<DesignatedAttendanceApproverResponseDto> {
    const companyId = requireTenantId(actor);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { designatedAttendanceApproverUserId: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return this.designatedAttendanceApproverResponse(
      this.prisma,
      companyId,
      company.designatedAttendanceApproverUserId,
    );
  }

  async updateDesignatedAttendanceApprover(
    dto: UpdateDesignatedAttendanceApproverDto,
    actor: AuthenticatedUser,
  ): Promise<DesignatedAttendanceApproverResponseDto> {
    const companyId = requireTenantId(actor);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Company"
        WHERE "id" = ${companyId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (locked.length !== 1) throw new NotFoundException('Company not found');
      const current = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { designatedAttendanceApproverUserId: true },
      });
      const requestedId = dto.designatedAttendanceApproverUserId;
      if (requestedId !== null) {
        await this.requireEligibleAttendanceApprover(tx, companyId, requestedId);
      }
      if (current.designatedAttendanceApproverUserId === requestedId) {
        return this.designatedAttendanceApproverResponse(tx, companyId, requestedId);
      }
      await tx.company.update({
        where: { id: companyId },
        data: { designatedAttendanceApproverUserId: requestedId },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          actorUserId: actor.id,
          action: 'COMPANY_DESIGNATED_ATTENDANCE_APPROVER_CHANGED',
          entityType: 'Company',
          entityId: companyId,
          metadata: {
            previousDesignatedAttendanceApproverUserId: current.designatedAttendanceApproverUserId,
            designatedAttendanceApproverUserId: requestedId,
          },
        },
      });
      return this.designatedAttendanceApproverResponse(tx, companyId, requestedId);
    });
  }

  async getBillingContact(companyId: string, actor: AuthenticatedUser) {
    this.assertTenantAccess(companyId, actor);
    await this.requireCompany(companyId);
    const profile = await this.prisma.companyBillingProfile.findUnique({
      where: { companyId },
      select: { billingContactUserId: true },
    });
    if (!profile) return { companyId, billingProfileExists: false, billingContactUserId: null, billingContact: null };
    return this.billingContactResponse(this.prisma, companyId, profile.billingContactUserId);
  }

  async listEligibleBillingContacts(companyId: string, query: EligibleBillingContactQueryDto, actor: AuthenticatedUser): Promise<BillingContact[]> {
    this.assertTenantAccess(companyId, actor);
    await this.requireCompany(companyId);
    const search = query.search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        ...(search ? { OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ] } : {}),
      },
      select: billingContactSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return users.filter((user) => this.validEmail(user.email));
  }

  async updateBillingContact(companyId: string, dto: UpdateBillingContactDto, actor: AuthenticatedUser) {
    this.assertTenantAccess(companyId, actor);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Company"
        WHERE "id" = ${companyId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (company.length !== 1) throw new NotFoundException('Company not found');
      const profiles = await tx.$queryRaw<Array<{ id: string; billingContactUserId: string | null }>>(Prisma.sql`
        SELECT "id", "billingContactUserId" FROM "CompanyBillingProfile"
        WHERE "companyId" = ${companyId}::uuid
        FOR UPDATE
      `);
      const profile = profiles[0];
      if (!profile) throw new NotFoundException('Company billing profile not found');
      const requestedId = dto.billingContactUserId;
      if (requestedId !== null) await this.requireEligibleBillingContact(tx, companyId, requestedId);
      if (profile.billingContactUserId === requestedId) {
        return this.billingContactResponse(tx, companyId, requestedId);
      }
      await tx.companyBillingProfile.update({ where: { id: profile.id }, data: { billingContactUserId: requestedId } });
      await tx.auditLog.create({ data: {
        companyId,
        actorUserId: actor.id,
        action: 'COMPANY_BILLING_CONTACT_CHANGED',
        entityType: 'CompanyBillingProfile',
        entityId: profile.id,
        metadata: { previousBillingContactUserId: profile.billingContactUserId, billingContactUserId: requestedId },
      } });
      return this.billingContactResponse(tx, companyId, requestedId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
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

  private async requireCompany(companyId: string): Promise<void> {
    const company = await this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { id: true } });
    if (!company) throw new NotFoundException('Company not found');
  }

  private async requireEligibleBillingContact(tx: Prisma.TransactionClient, companyId: string, userId: string): Promise<BillingContact> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId}::uuid AND "companyId" = ${companyId}::uuid
        AND "status" = 'ACTIVE' AND "deletedAt" IS NULL
      FOR KEY SHARE
    `);
    if (locked.length !== 1) throw new NotFoundException('Eligible Billing Contact user not found');
    const user = await tx.user.findFirst({
      where: { id: userId, companyId, status: UserStatus.ACTIVE, deletedAt: null },
      select: billingContactSelect,
    });
    if (!user || !this.validEmail(user.email)) throw new NotFoundException('Eligible Billing Contact user not found');
    return user;
  }

  private async billingContactResponse(client: Prisma.TransactionClient | PrismaService, companyId: string, userId: string | null) {
    if (!userId) return { companyId, billingProfileExists: true, billingContactUserId: null, billingContact: null };
    const user = await client.user.findFirst({
      where: { id: userId, companyId, status: UserStatus.ACTIVE, deletedAt: null },
      select: billingContactSelect,
    });
    return {
      companyId,
      billingProfileExists: true,
      billingContactUserId: user?.id ?? userId,
      billingContact: user && this.validEmail(user.email) ? user : null,
    };
  }

  private validEmail(value: string): boolean {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private eligibleDesignatedApproverWhere(
    companyId: string,
    userId: string,
  ): Prisma.UserWhereInput {
    return {
      id: userId,
      companyId,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      roles: {
        some: {
          role: {
            companyId,
            deletedAt: null,
            systemName: { in: [RoleName.HR, RoleName.COMPANY_ADMIN] },
          },
        },
      },
    };
  }

  private async requireEligibleDesignatedApprover(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
  ): Promise<DesignatedApprover> {
    const candidate = await tx.user.findFirst({
      where: this.eligibleDesignatedApproverWhere(companyId, userId),
      select: designatedApproverSelect,
    });
    if (!candidate) {
      throw new NotFoundException('Eligible designated leave approver not found');
    }
    return candidate;
  }

  private async designatedApproverResponse(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    designatedLeaveApproverUserId: string | null,
  ): Promise<DesignatedLeaveApproverResponseDto> {
    const designatedLeaveApprover = designatedLeaveApproverUserId
      ? await client.user.findFirst({
          where: this.eligibleDesignatedApproverWhere(
            companyId,
            designatedLeaveApproverUserId,
          ),
          select: designatedApproverSelect,
        })
      : null;
    return { designatedLeaveApproverUserId, designatedLeaveApprover };
  }

  private eligibleAttendanceApproverWhere(
    companyId: string,
    userId: string,
  ): Prisma.UserWhereInput {
    return {
      id: userId,
      companyId,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      employee: { is: { companyId, deletedAt: null, status: EmployeeStatus.ACTIVE } },
      roles: {
        some: {
          role: {
            companyId,
            deletedAt: null,
            systemName: { in: [RoleName.HR, RoleName.COMPANY_ADMIN] },
          },
        },
      },
    };
  }

  private async requireEligibleAttendanceApprover(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
  ): Promise<DesignatedApprover> {
    const candidate = await tx.user.findFirst({
      where: this.eligibleAttendanceApproverWhere(companyId, userId),
      select: designatedApproverSelect,
    });
    if (!candidate) {
      throw new NotFoundException('Eligible designated attendance approver not found');
    }
    return candidate;
  }

  private async designatedAttendanceApproverResponse(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    designatedAttendanceApproverUserId: string | null,
  ): Promise<DesignatedAttendanceApproverResponseDto> {
    const designatedAttendanceApprover = designatedAttendanceApproverUserId
      ? await client.user.findFirst({
          where: this.eligibleAttendanceApproverWhere(companyId, designatedAttendanceApproverUserId),
          select: designatedApproverSelect,
        })
      : null;
    return { designatedAttendanceApproverUserId, designatedAttendanceApprover };
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
