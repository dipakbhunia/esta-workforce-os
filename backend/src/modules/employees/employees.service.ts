import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeStatus,
  Prisma,
  RoleName,
  UserStatus,
} from '@prisma/client';
import {
  paginatedResult,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { isSuperAdmin } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const employeeSelect = {
  id: true,
  userId: true,
  companyId: true,
  branchId: true,
  departmentId: true,
  designationId: true,
  shiftId: true,
  reportingManagerId: true,
  employeeCode: true,
  joiningDate: true,
  employmentType: true,
  workMode: true,
  status: true,
  phone: true,
  alternatePhone: true,
  personalEmail: true,
  emergencyContactName: true,
  emergencyContactRelationship: true,
  emergencyContactPhone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  documents: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
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
  reportingManager: {
    select: {
      id: true,
      employeeCode: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
  _count: { select: { directReports: true } },
} satisfies Prisma.EmployeeSelect;

type EmployeeRecord = Prisma.EmployeeGetPayload<{
  select: typeof employeeSelect;
}>;

interface OrganizationReferences {
  branchId?: string;
  departmentId?: string;
  designationId?: string;
  shiftId?: string;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto, actor: AuthenticatedUser) {
    const companyId = this.requireManageableTenant(actor);
    const user = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        companyId,
        deletedAt: null,
        status: { not: UserStatus.SUSPENDED },
      },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found in this tenant');
    }

    await this.validateOrganizationReferences(dto, companyId);
    await this.validateReportingManager(
      dto.reportingManagerId,
      companyId,
      undefined,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            userId: dto.userId,
            companyId,
            branchId: dto.branchId,
            departmentId: dto.departmentId,
            designationId: dto.designationId,
            shiftId: dto.shiftId,
            reportingManagerId: dto.reportingManagerId,
            employeeCode: dto.employeeCode.trim().toUpperCase(),
            joiningDate: this.toDate(dto.joiningDate),
            employmentType: dto.employmentType,
            workMode: dto.workMode,
            status: dto.status ?? EmployeeStatus.ACTIVE,
            ...this.contactData(dto),
            ...(dto.documents !== undefined
              ? { documents: dto.documents as Prisma.InputJsonValue }
              : {}),
          },
          select: employeeSelect,
        });
        await tx.user.update({
          where: { id: dto.userId },
          data: {
            branchId: dto.branchId,
            departmentId: dto.departmentId,
            designationId: dto.designationId,
            shiftId: dto.shiftId,
          },
        });
        return employee;
      });
    } catch (error) {
      this.throwEmployeeConflict(error);
    }
  }

  async findAll(query: EmployeeQueryDto, actor: AuthenticatedUser) {
    const visibility = await this.visibilityWhere(actor, query.companyId);
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...visibility,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.employmentType
        ? { employmentType: query.employmentType }
        : {}),
      ...(query.workMode ? { workMode: query.workMode } : {}),
      ...(query.search
        ? {
            OR: [
              {
                employeeCode: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  firstName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                user: {
                  lastName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: employeeSelect,
        ...paginationArgs(query),
        orderBy: [{ user: { firstName: 'asc' } }, { employeeCode: 'asc' }],
      }),
      this.prisma.employee.count({ where }),
    ]);
    return paginatedResult(data, total, query);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: employeeSelect,
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.assertCanView(employee, actor);
    return employee;
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actor: AuthenticatedUser,
  ) {
    const companyId = this.requireManageableTenant(actor);
    const employee = await this.findTenantEmployee(id, companyId);
    const references = {
      branchId: dto.branchId ?? employee.branchId ?? undefined,
      departmentId: dto.departmentId ?? employee.departmentId ?? undefined,
      designationId:
        dto.designationId ?? employee.designationId ?? undefined,
      shiftId: dto.shiftId ?? employee.shiftId ?? undefined,
    };
    await this.validateOrganizationReferences(references, companyId);
    await this.validateReportingManager(
      dto.reportingManagerId,
      companyId,
      id,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.employee.update({
          where: { id },
          data: {
            ...(dto.employeeCode !== undefined
              ? { employeeCode: dto.employeeCode.trim().toUpperCase() }
              : {}),
            ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
            ...(dto.departmentId !== undefined
              ? { departmentId: dto.departmentId }
              : {}),
            ...(dto.designationId !== undefined
              ? { designationId: dto.designationId }
              : {}),
            ...(dto.shiftId !== undefined ? { shiftId: dto.shiftId } : {}),
            ...(dto.reportingManagerId !== undefined
              ? { reportingManagerId: dto.reportingManagerId }
              : {}),
            ...(dto.joiningDate !== undefined
              ? { joiningDate: this.toDate(dto.joiningDate) }
              : {}),
            ...(dto.employmentType !== undefined
              ? { employmentType: dto.employmentType }
              : {}),
            ...(dto.workMode !== undefined ? { workMode: dto.workMode } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...this.contactData(dto),
            ...(dto.documents !== undefined
              ? { documents: dto.documents as Prisma.InputJsonValue }
              : {}),
          },
          select: employeeSelect,
        });
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            branchId: references.branchId,
            departmentId: references.departmentId,
            designationId: references.designationId,
            shiftId: references.shiftId,
          },
        });
        return updated;
      });
    } catch (error) {
      this.throwEmployeeConflict(error);
    }
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const companyId = this.requireManageableTenant(actor);
    await this.findTenantEmployee(id, companyId);
    return this.prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: { reportingManagerId: id, deletedAt: null },
        data: { reportingManagerId: null },
      });
      return tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: EmployeeStatus.TERMINATED,
        },
        select: employeeSelect,
      });
    });
  }

  private async visibilityWhere(
    actor: AuthenticatedUser,
    requestedCompanyId?: string,
  ): Promise<Prisma.EmployeeWhereInput> {
    if (isSuperAdmin(actor)) {
      return requestedCompanyId ? { companyId: requestedCompanyId } : {};
    }
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      if (!actor.companyId) throw new ForbiddenException('Tenant is required');
      return { companyId: actor.companyId };
    }
    if (actor.roles.includes(RoleName.MANAGER)) {
      const own = await this.prisma.employee.findFirst({
        where: { userId: actor.id, deletedAt: null },
        select: { id: true },
      });
      return own
        ? { OR: [{ id: own.id }, { reportingManagerId: own.id }] }
        : { id: '__missing_employee__' };
    }
    return { userId: actor.id };
  }

  private async assertCanView(
    employee: EmployeeRecord,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (isSuperAdmin(actor)) return;
    if (
      actor.roles.includes(RoleName.COMPANY_ADMIN) ||
      actor.roles.includes(RoleName.HR)
    ) {
      if (employee.companyId !== actor.companyId) {
        throw new ForbiddenException('Cross-tenant access is not allowed');
      }
      return;
    }
    if (actor.roles.includes(RoleName.MANAGER)) {
      const own = await this.prisma.employee.findFirst({
        where: { userId: actor.id, deletedAt: null },
        select: { id: true },
      });
      if (
        own &&
        (employee.id === own.id || employee.reportingManagerId === own.id)
      ) {
        return;
      }
      throw new ForbiddenException('Employee is not in your direct team');
    }
    if (employee.userId !== actor.id) {
      throw new ForbiddenException('You can view only your own profile');
    }
  }

  private requireManageableTenant(actor: AuthenticatedUser): string {
    if (
      !actor.roles.includes(RoleName.COMPANY_ADMIN) &&
      !actor.roles.includes(RoleName.HR)
    ) {
      throw new ForbiddenException('Employee management is not permitted');
    }
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    return actor.companyId;
  }

  private async findTenantEmployee(id: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async validateOrganizationReferences(
    dto: OrganizationReferences,
    companyId: string,
  ): Promise<void> {
    const [branch, department, designation, shift] = await Promise.all([
      dto.branchId
        ? this.prisma.branch.findFirst({
            where: { id: dto.branchId, companyId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
      dto.departmentId
        ? this.prisma.department.findFirst({
            where: { id: dto.departmentId, companyId, deletedAt: null },
            select: { id: true, branchId: true },
          })
        : Promise.resolve(null),
      dto.designationId
        ? this.prisma.designation.findFirst({
            where: { id: dto.designationId, companyId, deletedAt: null },
            select: { id: true, departmentId: true },
          })
        : Promise.resolve(null),
      dto.shiftId
        ? this.prisma.shift.findFirst({
            where: { id: dto.shiftId, companyId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (
      (dto.branchId && !branch) ||
      (dto.departmentId && !department) ||
      (dto.designationId && !designation) ||
      (dto.shiftId && !shift)
    ) {
      throw new NotFoundException(
        'An organization reference was not found in this tenant',
      );
    }
    if (
      dto.branchId &&
      department?.branchId &&
      department.branchId !== dto.branchId
    ) {
      throw new BadRequestException(
        'Department does not belong to the selected branch',
      );
    }
    if (
      dto.departmentId &&
      designation?.departmentId &&
      designation.departmentId !== dto.departmentId
    ) {
      throw new BadRequestException(
        'Designation does not belong to the selected department',
      );
    }
  }

  private async validateReportingManager(
    reportingManagerId: string | undefined,
    companyId: string,
    employeeId: string | undefined,
  ): Promise<void> {
    if (!reportingManagerId) return;
    if (reportingManagerId === employeeId) {
      throw new BadRequestException(
        'Employee cannot be their own reporting manager',
      );
    }
    const manager = await this.prisma.employee.findFirst({
      where: {
        id: reportingManagerId,
        companyId,
        deletedAt: null,
        status: EmployeeStatus.ACTIVE,
      },
      select: { id: true, reportingManagerId: true },
    });
    if (!manager) {
      throw new NotFoundException(
        'Reporting manager was not found in this tenant',
      );
    }
    if (!employeeId) return;

    let nextManagerId = manager.reportingManagerId;
    const visited = new Set<string>([manager.id]);
    while (nextManagerId) {
      if (nextManagerId === employeeId) {
        throw new BadRequestException(
          'Reporting manager assignment would create a cycle',
        );
      }
      if (visited.has(nextManagerId)) break;
      visited.add(nextManagerId);
      const next = await this.prisma.employee.findUnique({
        where: { id: nextManagerId },
        select: { reportingManagerId: true },
      });
      nextManagerId = next?.reportingManagerId ?? null;
    }
  }

  private contactData(
    dto: Partial<CreateEmployeeDto>,
  ) {
    return {
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      ...(dto.alternatePhone !== undefined
        ? { alternatePhone: dto.alternatePhone.trim() }
        : {}),
      ...(dto.personalEmail !== undefined
        ? { personalEmail: dto.personalEmail.trim().toLowerCase() }
        : {}),
      ...(dto.emergencyContactName !== undefined
        ? { emergencyContactName: dto.emergencyContactName.trim() }
        : {}),
      ...(dto.emergencyContactRelationship !== undefined
        ? {
            emergencyContactRelationship:
              dto.emergencyContactRelationship.trim(),
          }
        : {}),
      ...(dto.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: dto.emergencyContactPhone.trim() }
        : {}),
      ...(dto.addressLine1 !== undefined
        ? { addressLine1: dto.addressLine1.trim() }
        : {}),
      ...(dto.addressLine2 !== undefined
        ? { addressLine2: dto.addressLine2.trim() }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
      ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
      ...(dto.postalCode !== undefined
        ? { postalCode: dto.postalCode.trim() }
        : {}),
      ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
    };
  }

  private toDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private throwEmployeeConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An active employee code or employee profile already exists',
      );
    }
    throw error;
  }
}
