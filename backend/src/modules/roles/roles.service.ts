import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = {
  permissions: {
    include: { permission: true },
    orderBy: { permission: { key: 'asc' as const } },
  },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

const hrVisibleRoles: RoleName[] = [
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto, actor: AuthenticatedUser) {
    const companyId = this.resolveCompanyId(dto.companyId, actor);
    this.validateSystemRole(dto.systemName, companyId, actor);
    const permissionIds = [...new Set(dto.permissionIds ?? [])];
    await this.validatePermissions(permissionIds);
    try {
      return await this.prisma.role.create({
        data: {
          companyId,
          key: dto.key,
          name: dto.name.trim(),
          systemName: dto.systemName,
          description: dto.description?.trim(),
          permissions: {
            create: permissionIds.map((permissionId) => ({
              permissionId,
            })),
          },
        },
        include: roleInclude,
      });
    } catch (error) {
      this.throwRoleConflict(error);
    }
  }

  async findAll(query: RoleQueryDto, actor: AuthenticatedUser) {
    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      ...(isSuperAdmin(actor)
        ? query.companyId
          ? { companyId: query.companyId }
          : {}
        : { companyId: actor.companyId ?? '__missing_tenant__' }),
      ...(actor.roles.includes(RoleName.HR)
        ? { systemName: { in: hrVisibleRoles } }
        : query.systemName
          ? { systemName: query.systemName }
          : {}),
      ...(query.search
        ? {
            OR: [
              { key: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include: roleInclude,
        ...paginationArgs(query),
        orderBy: { name: 'asc' },
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: roleInclude,
    });
    if (!role) throw new NotFoundException('Role not found');
    this.assertRoleAccess(role.companyId, role.systemName, actor);
    return role;
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    actor: AuthenticatedUser,
  ) {
    const role = await this.findOne(id, actor);
    if (role.systemName && dto.key && dto.key !== role.key) {
      throw new ForbiddenException('Built-in role keys cannot be changed');
    }
    try {
      return await this.prisma.role.update({
        where: { id },
        data: {
          ...(dto.key !== undefined ? { key: dto.key } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
        },
        include: roleInclude,
      });
    } catch (error) {
      this.throwRoleConflict(error);
    }
  }

  async assignPermissions(
    id: string,
    dto: AssignPermissionsDto,
    actor: AuthenticatedUser,
  ) {
    await this.findOne(id, actor);
    const permissionIds = [...new Set(dto.permissionIds)];
    await this.validatePermissions(permissionIds);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...permissionIds.map((permissionId) =>
        this.prisma.rolePermission.create({
          data: { roleId: id, permissionId },
        }),
      ),
    ]);
    return this.findOne(id, actor);
  }

  findPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  private resolveCompanyId(
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

  private validateSystemRole(
    systemName: RoleName | undefined,
    companyId: string | null,
    actor: AuthenticatedUser,
  ): void {
    if (!systemName) return;
    if (systemName === RoleName.SUPER_ADMIN) {
      if (!isSuperAdmin(actor) || companyId !== null) {
        throw new ForbiddenException(
          'The super-admin role must be global and managed by a super admin',
        );
      }
    } else if (!companyId) {
      throw new ForbiddenException(
        'Company system roles require a tenant company',
      );
    }
  }

  private assertRoleAccess(
    companyId: string | null,
    systemName: RoleName | null,
    actor: AuthenticatedUser,
  ): void {
    if (isSuperAdmin(actor)) return;
    if (companyId !== actor.companyId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
    if (
      actor.roles.includes(RoleName.HR) &&
      (!systemName || !hrVisibleRoles.includes(systemName))
    ) {
      throw new ForbiddenException(
        'HR can access only Manager and Employee roles',
      );
    }
  }

  private async validatePermissions(permissionIds: string[]): Promise<void> {
    if (!permissionIds.length) return;
    const count = await this.prisma.permission.count({
      where: { id: { in: permissionIds } },
    });
    if (count !== permissionIds.length) {
      throw new NotFoundException('One or more permissions were not found');
    }
  }

  private throwRoleConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An active role with this key or system name already exists',
      );
    }
    throw error;
  }
}
