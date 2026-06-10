import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserStatusDto } from './dto/user-status.dto';

const SALT_ROUNDS = 12;
const hrManageableRoles: RoleName[] = [
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

const userSelect = {
  id: true,
  companyId: true,
  branchId: true,
  departmentId: true,
  designationId: true,
  shiftId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  company: { select: { id: true, name: true, slug: true } },
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
  shift: {
    select: {
      id: true,
      name: true,
      code: true,
      startTime: true,
      endTime: true,
      timezone: true,
    },
  },
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type ManagedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const companyId = this.resolveCreateCompanyId(dto.companyId, actor);
    const roles = await this.getAssignableRoles(dto.roleIds, companyId, actor);
    await this.validateOrganizationReferences(dto, companyId);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            companyId,
            email: dto.email.trim().toLowerCase(),
            passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            status: dto.status ?? UserStatus.ACTIVE,
            branchId: dto.branchId,
            departmentId: dto.departmentId,
            designationId: dto.designationId,
            shiftId: dto.shiftId,
          },
        });
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: created.id,
            roleId: role.id,
          })),
        });
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          select: userSelect,
        });
      });
      return user;
    } catch (error) {
      this.throwUserConflict(error);
    }
  }

  async findAll(query: UserQueryDto, actor: AuthenticatedUser) {
    const where = this.listWhere(query, actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        ...paginationArgs(query),
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertCanAccessTarget(user, actor);
    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ) {
    const user = await this.findOne(id, actor);
    this.assertCanManageTarget(user, actor);
    await this.validateOrganizationReferences(dto, user.companyId);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined
            ? { email: dto.email.trim().toLowerCase() }
            : {}),
          ...(dto.firstName !== undefined
            ? { firstName: dto.firstName.trim() }
            : {}),
          ...(dto.lastName !== undefined
            ? { lastName: dto.lastName.trim() }
            : {}),
          ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId }
            : {}),
          ...(dto.designationId !== undefined
            ? { designationId: dto.designationId }
            : {}),
          ...(dto.shiftId !== undefined ? { shiftId: dto.shiftId } : {}),
        },
        select: userSelect,
      });
    } catch (error) {
      this.throwUserConflict(error);
    }
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const user = await this.findOne(id, actor);
    this.assertCanManageTarget(user, actor);
    this.assertNotSelf(id, actor);
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: UserStatus.INACTIVE,
        },
        select: userSelect,
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return deleted;
    });
  }

  async setStatus(
    id: string,
    dto: UserStatusDto,
    actor: AuthenticatedUser,
  ) {
    const user = await this.findOne(id, actor);
    this.assertCanManageTarget(user, actor);
    this.assertNotSelf(id, actor);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: dto.status },
        select: userSelect,
      });
      if (dto.status !== UserStatus.ACTIVE) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
  }

  async assignRole(
    id: string,
    dto: AssignRoleDto,
    actor: AuthenticatedUser,
  ) {
    const user = await this.findOne(id, actor);
    this.assertCanManageTarget(user, actor);
    const [role] = await this.getAssignableRoles(
      [dto.roleId],
      user.companyId,
      actor,
    );
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: id, roleId: role.id } },
      create: { userId: id, roleId: role.id },
      update: {},
    });
    return this.findOne(id, actor);
  }

  async removeRole(id: string, roleId: string, actor: AuthenticatedUser) {
    const user = await this.findOne(id, actor);
    this.assertCanManageTarget(user, actor);
    this.assertNotSelf(id, actor);
    await this.getAssignableRoles([roleId], user.companyId, actor);
    if (user.roles.length <= 1) {
      throw new BadRequestException('A user must retain at least one role');
    }
    const removed = await this.prisma.userRole.deleteMany({
      where: { userId: id, roleId },
    });
    if (!removed.count) throw new NotFoundException('User role not found');
    return this.findOne(id, actor);
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: AuthenticatedUser,
  ) {
    const user = await this.findOne(id, actor);
    this.assertCanManageTarget(user, actor);
    this.assertNotSelf(id, actor);
    await this.updatePasswordAndRevokeTokens(id, dto.newPassword);
    return { success: true as const };
  }

  async changePassword(dto: ChangePasswordDto, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true, deletedAt: true },
    });
    if (
      !user ||
      user.deletedAt ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must differ from the current password',
      );
    }
    await this.updatePasswordAndRevokeTokens(actor.id, dto.newPassword);
    return { success: true as const };
  }

  private listWhere(
    query: UserQueryDto,
    actor: AuthenticatedUser,
  ): Prisma.UserWhereInput {
    const tenantWhere = isSuperAdmin(actor)
      ? query.companyId
        ? { companyId: query.companyId }
        : {}
      : { companyId: actor.companyId ?? '__missing_tenant__' };
    const hrWhere = actor.roles.includes(RoleName.HR)
      ? {
          roles: {
            every: {
              role: {
                systemName: { in: hrManageableRoles },
                deletedAt: null,
              },
            },
          },
        }
      : {};
    return {
      deletedAt: null,
      ...tenantWhere,
      ...hrWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private resolveCreateCompanyId(
    requestedCompanyId: string | undefined,
    actor: AuthenticatedUser,
  ): string | null {
    if (isSuperAdmin(actor)) return requestedCompanyId ?? null;
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
    return actor.companyId;
  }

  private async getAssignableRoles(
    roleIds: string[],
    companyId: string | null,
    actor: AuthenticatedUser,
  ) {
    const uniqueIds = [...new Set(roleIds)];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
    });
    if (roles.length !== uniqueIds.length) {
      throw new NotFoundException('One or more roles were not found');
    }
    for (const role of roles) {
      if (role.companyId !== companyId) {
        throw new ForbiddenException('Role belongs to another tenant');
      }
      if (
        !isSuperAdmin(actor) &&
        role.systemName === RoleName.SUPER_ADMIN
      ) {
        throw new ForbiddenException('Cannot assign the super-admin role');
      }
      if (
        actor.roles.includes(RoleName.HR) &&
        (!role.systemName || !hrManageableRoles.includes(role.systemName))
      ) {
        throw new ForbiddenException(
          'HR can assign only Manager and Employee roles',
        );
      }
    }
    return roles;
  }

  private assertCanAccessTarget(
    target: ManagedUser,
    actor: AuthenticatedUser,
  ): void {
    if (!isSuperAdmin(actor) && target.companyId !== actor.companyId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
    if (actor.roles.includes(RoleName.HR)) {
      this.assertHrTarget(target);
    }
  }

  private assertCanManageTarget(
    target: ManagedUser,
    actor: AuthenticatedUser,
  ): void {
    this.assertCanAccessTarget(target, actor);
  }

  private assertHrTarget(target: ManagedUser): void {
    const roles = target.roles.map(({ role }) => role.systemName);
    if (
      !roles.length ||
      roles.some((role) => !role || !hrManageableRoles.includes(role))
    ) {
      throw new ForbiddenException(
        'HR can manage only Manager and Employee users',
      );
    }
  }

  private assertNotSelf(id: string, actor: AuthenticatedUser): void {
    if (id === actor.id) {
      throw new ForbiddenException('This action cannot target your own account');
    }
  }

  private async validateOrganizationReferences(
    dto: {
      branchId?: string;
      departmentId?: string;
      designationId?: string;
      shiftId?: string;
    },
    companyId: string | null,
  ): Promise<void> {
    if (
      !dto.branchId &&
      !dto.departmentId &&
      !dto.designationId &&
      !dto.shiftId
    ) {
      return;
    }
    if (!companyId) {
      throw new BadRequestException(
        'Organization references require a tenant company',
      );
    }
    const [branch, department, designation, shift] = await Promise.all([
      dto.branchId
        ? this.prisma.branch.findFirst({
            where: { id: dto.branchId, companyId, deletedAt: null },
          })
        : Promise.resolve(true),
      dto.departmentId
        ? this.prisma.department.findFirst({
            where: { id: dto.departmentId, companyId, deletedAt: null },
          })
        : Promise.resolve(true),
      dto.designationId
        ? this.prisma.designation.findFirst({
            where: { id: dto.designationId, companyId, deletedAt: null },
          })
        : Promise.resolve(true),
      dto.shiftId
        ? this.prisma.shift.findFirst({
            where: { id: dto.shiftId, companyId, deletedAt: null },
          })
        : Promise.resolve(true),
    ]);
    if (!branch || !department || !designation || !shift) {
      throw new NotFoundException(
        'An organization reference was not found in this tenant',
      );
    }
  }

  private async updatePasswordAndRevokeTokens(
    userId: string,
    password: string,
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private throwUserConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A user with this email already exists');
    }
    throw error;
  }
}
