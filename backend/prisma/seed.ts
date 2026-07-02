import {
  CompanyStatus,
  EmployeeStatus,
  EmploymentType,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

const permissionDefinitions = [
  ['users.read', 'View users'],
  ['users.create', 'Create users'],
  ['users.update', 'Update users'],
  ['users.delete', 'Soft-delete users'],
  ['users.status', 'Activate or deactivate users'],
  ['users.password.reset', 'Reset user passwords'],
  ['users.roles.assign', 'Assign and remove user roles'],
  ['roles.read', 'View roles and permissions'],
  ['roles.create', 'Create roles'],
  ['roles.update', 'Update roles'],
  ['roles.permissions.assign', 'Assign permissions to roles'],
] as const;

const defaultRolePermissions: Record<RoleName, string[]> = {
  [RoleName.SUPER_ADMIN]: permissionDefinitions.map(([key]) => key),
  [RoleName.COMPANY_ADMIN]: permissionDefinitions.map(([key]) => key),
  [RoleName.HR]: [
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'users.status',
    'users.password.reset',
    'users.roles.assign',
    'roles.read',
  ],
  [RoleName.MANAGER]: [],
  [RoleName.EMPLOYEE]: [],
};

async function upsertRole(companyId: string | null, systemName: RoleName) {
  const existingRole = await prisma.role.findFirst({
    where: { companyId, systemName, deletedAt: null },
  });

  if (existingRole) {
    return prisma.role.update({
      where: { id: existingRole.id },
      data: {
        key: systemName,
        name: systemName
          .toLowerCase()
          .split('_')
          .map((part) => part[0].toUpperCase() + part.slice(1))
          .join(' '),
      },
    });
  }

  return prisma.role.create({
    data: {
      companyId,
      key: systemName,
      name: systemName
        .toLowerCase()
        .split('_')
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' '),
      systemName,
    },
  });
}

async function upsertBranch(companyId: string) {
  const existingBranch = await prisma.branch.findFirst({
    where: { companyId, code: 'MAIN', deletedAt: null },
  });
  const data = {
    companyId,
    name: 'Main Branch',
    code: 'MAIN',
    address: 'Demo Company Main Office',
    deletedAt: null,
  };
  return existingBranch
    ? prisma.branch.update({ where: { id: existingBranch.id }, data })
    : prisma.branch.create({ data });
}

async function upsertDepartment(companyId: string, branchId: string) {
  const existingDepartment = await prisma.department.findFirst({
    where: { companyId, code: 'ADMIN', deletedAt: null },
  });
  const data = {
    companyId,
    branchId,
    name: 'Administration',
    code: 'ADMIN',
    deletedAt: null,
  };
  return existingDepartment
    ? prisma.department.update({ where: { id: existingDepartment.id }, data })
    : prisma.department.create({ data });
}

async function upsertDesignation(companyId: string, departmentId: string) {
  const existingDesignation = await prisma.designation.findFirst({
    where: { companyId, code: 'COMPANY_ADMIN', deletedAt: null },
  });
  const data = {
    companyId,
    departmentId,
    name: 'Company Admin',
    code: 'COMPANY_ADMIN',
    deletedAt: null,
  };
  return existingDesignation
    ? prisma.designation.update({ where: { id: existingDesignation.id }, data })
    : prisma.designation.create({ data });
}

async function upsertShift(companyId: string) {
  const existingShift = await prisma.shift.findFirst({
    where: { companyId, code: 'GENERAL', deletedAt: null },
  });
  const data = {
    companyId,
    name: 'General Shift',
    code: 'GENERAL',
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'Asia/Kolkata',
    deletedAt: null,
  };
  return existingShift
    ? prisma.shift.update({ where: { id: existingShift.id }, data })
    : prisma.shift.create({ data });
}

async function upsertBreakPolicy(
  companyId: string,
  policy: {
    name: string;
    code: string;
    allowedMinutes: number;
    sortOrder: number;
  },
) {
  const existingPolicy = await prisma.breakPolicy.findFirst({
    where: { companyId, code: policy.code, deletedAt: null },
  });
  const data = {
    companyId,
    name: policy.name,
    code: policy.code,
    allowedMinutes: policy.allowedMinutes,
    isPaid: false,
    isActive: true,
    autoPunchOutOnTimeout: true,
    sortOrder: policy.sortOrder,
    deletedAt: null,
  };
  return existingPolicy
    ? prisma.breakPolicy.update({ where: { id: existingPolicy.id }, data })
    : prisma.breakPolicy.create({ data });
}

async function upsertLeaveType(
  companyId: string,
  leaveType: {
    name: string;
    code: string;
    defaultDays: number;
  },
) {
  const existingLeaveType = await prisma.leaveType.findFirst({
    where: { companyId, code: leaveType.code, deletedAt: null },
  });
  const data = {
    companyId,
    name: leaveType.name,
    code: leaveType.code,
    defaultDays: leaveType.defaultDays,
    requiresApproval: true,
    managerCanApprove: true,
    deletedAt: null,
  };
  return existingLeaveType
    ? prisma.leaveType.update({ where: { id: existingLeaveType.id }, data })
    : prisma.leaveType.create({ data });
}

async function upsertAttendancePolicy(companyId: string) {
  const existingPolicy = await prisma.attendancePolicy.findFirst({
    where: { companyId },
  });
  const data = {
    companyId,
    autoPunchOutOnHeartbeatLoss: true,
    heartbeatTimeoutMinutes: 30,
    attendanceDayStartTime: '00:00',
    allowMultiplePunchSessions: true,
    autoClosePreviousDayOpenSession: true,
    isActive: true,
  };
  return existingPolicy
    ? prisma.attendancePolicy.update({ where: { id: existingPolicy.id }, data })
    : prisma.attendancePolicy.create({ data });
}

async function main(): Promise<void> {
  const superAdminEmail =
    process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@esta.local';
  const superAdminPassword =
    process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123';
  const companyAdminEmail =
    process.env.SEED_COMPANY_ADMIN_EMAIL ?? 'admin@demo.esta.local';
  const companyAdminPassword =
    process.env.SEED_COMPANY_ADMIN_PASSWORD ?? 'CompanyAdmin@123';

  const existingCompany = await prisma.company.findFirst({
    where: { slug: 'demo-company', deletedAt: null },
  });
  const company = existingCompany
    ? await prisma.company.update({
        where: { id: existingCompany.id },
        data: {
          name: 'Demo Company',
          status: CompanyStatus.TRIAL,
        },
      })
    : await prisma.company.create({
        data: {
          name: 'Demo Company',
          slug: 'demo-company',
          status: CompanyStatus.TRIAL,
        },
      });

  const branch = await upsertBranch(company.id);
  const department = await upsertDepartment(company.id, branch.id);
  const designation = await upsertDesignation(company.id, department.id);
  const shift = await upsertShift(company.id);
  await upsertAttendancePolicy(company.id);
  await Promise.all([
    upsertBreakPolicy(company.id, {
      name: 'Lunch Break',
      code: 'LUNCH',
      allowedMinutes: 60,
      sortOrder: 10,
    }),
    upsertBreakPolicy(company.id, {
      name: 'Tea Break',
      code: 'TEA',
      allowedMinutes: 15,
      sortOrder: 20,
    }),
    upsertBreakPolicy(company.id, {
      name: 'Short Break',
      code: 'SHORT',
      allowedMinutes: 15,
      sortOrder: 30,
    }),
    upsertBreakPolicy(company.id, {
      name: 'Custom Break',
      code: 'CUSTOM',
      allowedMinutes: 10,
      sortOrder: 40,
    }),
  ]);
  await Promise.all([
    upsertLeaveType(company.id, {
      name: 'Casual Leave',
      code: 'CASUAL',
      defaultDays: 12,
    }),
    upsertLeaveType(company.id, {
      name: 'Sick Leave',
      code: 'SICK',
      defaultDays: 12,
    }),
    upsertLeaveType(company.id, {
      name: 'Earned Leave',
      code: 'EARNED',
      defaultDays: 18,
    }),
    upsertLeaveType(company.id, {
      name: 'Unpaid Leave',
      code: 'UNPAID',
      defaultDays: 0,
    }),
  ]);

  const permissions = await Promise.all(
    permissionDefinitions.map(([key, description]) =>
      prisma.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description },
      }),
    ),
  );

  const superAdminRole = await upsertRole(null, RoleName.SUPER_ADMIN);
  const companyRoles = await Promise.all(
    [
      RoleName.COMPANY_ADMIN,
      RoleName.HR,
      RoleName.MANAGER,
      RoleName.EMPLOYEE,
    ].map((name) => upsertRole(company.id, name)),
  );
  const companyAdminRole = companyRoles.find(
    (role) => role.systemName === RoleName.COMPANY_ADMIN,
  );

  if (!companyAdminRole) {
    throw new Error('Company admin role was not created');
  }

  const allRoles = [superAdminRole, ...companyRoles];
  for (const role of allRoles) {
    if (!role.systemName) continue;
    const allowedKeys = defaultRolePermissions[role.systemName];
    const permissionIds = permissions
      .filter((permission) => allowedKeys.includes(permission.key))
      .map((permission) => permission.id);

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      ...permissionIds.map((permissionId) =>
        prisma.rolePermission.create({
          data: { roleId: role.id, permissionId },
        }),
      ),
    ]);
  }

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail.toLowerCase() },
    update: {
      passwordHash: await bcrypt.hash(superAdminPassword, SALT_ROUNDS),
      firstName: 'Super',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      email: superAdminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(superAdminPassword, SALT_ROUNDS),
      firstName: 'Super',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
    },
  });

  const companyAdmin = await prisma.user.upsert({
    where: { email: companyAdminEmail.toLowerCase() },
    update: {
      companyId: company.id,
      branchId: branch.id,
      departmentId: department.id,
      designationId: designation.id,
      shiftId: shift.id,
      passwordHash: await bcrypt.hash(companyAdminPassword, SALT_ROUNDS),
      firstName: 'Demo',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      companyId: company.id,
      branchId: branch.id,
      departmentId: department.id,
      designationId: designation.id,
      shiftId: shift.id,
      email: companyAdminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(companyAdminPassword, SALT_ROUNDS),
      firstName: 'Demo',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: companyAdmin.id,
        roleId: companyAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: companyAdmin.id,
      roleId: companyAdminRole.id,
    },
  });

  await prisma.employee.upsert({
    where: { userId: companyAdmin.id },
    update: {
      companyId: company.id,
      branchId: branch.id,
      departmentId: department.id,
      designationId: designation.id,
      shiftId: shift.id,
      employeeCode: 'EMP-ADMIN-001',
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.HYBRID,
      status: EmployeeStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      userId: companyAdmin.id,
      companyId: company.id,
      branchId: branch.id,
      departmentId: department.id,
      designationId: designation.id,
      shiftId: shift.id,
      employeeCode: 'EMP-ADMIN-001',
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.HYBRID,
      status: EmployeeStatus.ACTIVE,
    },
  });

  console.log('Seed completed.');
  console.log(`Super admin: ${superAdmin.email}`);
  console.log(`Company admin: ${companyAdmin.email}`);
  console.log('Company admin employee: EMP-ADMIN-001');
  console.log('Demo organization: MAIN / ADMIN / COMPANY_ADMIN / GENERAL');
  console.log('Demo break policies: LUNCH / TEA / SHORT / CUSTOM');
  console.log('Demo leave types: CASUAL / SICK / EARNED / UNPAID');
  console.log('Demo attendance policy: heartbeat loss auto punch-out / 30 minutes / multi-session enabled');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
