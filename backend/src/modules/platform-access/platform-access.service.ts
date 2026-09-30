import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UsersService } from '../users/users.service';
import { CreatePlatformUserDto, PlatformAuditQueryDto, PlatformRoleAssignmentDto, PlatformRoleQueryDto, PlatformUserQueryDto, PlatformUserStatusDto, UpdatePlatformUserDto } from './dto/platform-access.dto';

const platformUserSelect = {
  id: true, companyId: true, email: true, firstName: true, lastName: true, status: true,
  lastLoginAt: true, createdAt: true, updatedAt: true, deletedAt: true,
  roles: { select: { assignedAt: true, role: { select: { id: true, companyId: true, key: true, name: true, systemName: true, description: true } } } },
} satisfies Prisma.UserSelect;

const globalRoleSelect = {
  id: true, companyId: true, key: true, name: true, description: true, systemName: true,
  createdAt: true, updatedAt: true,
  permissions: {
    select: {
      assignedAt: true,
      permission: { select: { id: true, key: true, description: true } },
    },
    orderBy: { permission: { key: 'asc' as const } },
  },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

const auditSelect = {
  id: true, companyId: true, actorUserId: true, action: true, entityType: true, entityId: true,
  ipAddress: true, userAgent: true, createdAt: true,
  actor: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
} satisfies Prisma.AuditLogSelect;

@Injectable()
export class PlatformAccessService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService) {}

  async listUsers(query: PlatformUserQueryDto) {
    const where: Prisma.UserWhereInput = { companyId: null, deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ email: { contains: query.search, mode: 'insensitive' } }, { firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: platformUserSelect, ...paginationArgs(query), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.user.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, companyId: null, deletedAt: null }, select: platformUserSelect });
    if (!user) throw new NotFoundException('Platform user not found');
    return user;
  }

  createUser(dto: CreatePlatformUserDto, actor: AuthenticatedUser) { return this.users.create({ ...dto }, actor); }
  async updateUser(id: string, dto: UpdatePlatformUserDto, actor: AuthenticatedUser) { await this.getUser(id); return this.users.update(id, dto, actor); }
  async setUserStatus(id: string, dto: PlatformUserStatusDto, actor: AuthenticatedUser) { await this.getUser(id); return this.users.setStatus(id, dto, actor); }
  async deleteUser(id: string, actor: AuthenticatedUser) { await this.getUser(id); return this.users.remove(id, actor); }
  async assignRole(id: string, dto: PlatformRoleAssignmentDto, actor: AuthenticatedUser) { await this.getUser(id); return this.users.assignRole(id, dto, actor); }
  async removeRole(id: string, roleId: string, actor: AuthenticatedUser) { await this.getUser(id); return this.users.removeRole(id, roleId, actor); }

  async listRoles(query: PlatformRoleQueryDto) {
    const where: Prisma.RoleWhereInput = { companyId: null, deletedAt: null,
      ...(query.systemName ? { systemName: query.systemName } : {}),
      ...(query.search ? { OR: [{ key: { contains: query.search, mode: 'insensitive' } }, { name: { contains: query.search, mode: 'insensitive' } }] } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({ where, select: globalRoleSelect, ...paginationArgs(query), orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      this.prisma.role.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, companyId: null, deletedAt: null }, select: globalRoleSelect });
    if (!role) throw new NotFoundException('Platform role not found');
    return role;
  }
  listPermissions() { return this.prisma.permission.findMany({ select: { id: true, key: true, description: true }, orderBy: { key: 'asc' } }); }

  async listAuditLogs(query: PlatformAuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = { companyId: null,
      ...(query.action ? { action: query.action } : {}), ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}) };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, select: auditSelect, skip, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async getAuditLog(id: string) {
    const record = await this.prisma.auditLog.findFirst({ where: { id, companyId: null }, select: auditSelect });
    if (!record) throw new NotFoundException('Platform audit record not found');
    return record;
  }
}
