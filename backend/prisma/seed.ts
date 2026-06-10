import {
  CompanyStatus,
  PrismaClient,
  RoleName,
  UserStatus,
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
      passwordHash: await bcrypt.hash(companyAdminPassword, SALT_ROUNDS),
      firstName: 'Demo',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      companyId: company.id,
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

  console.log('Seed completed.');
  console.log(`Super admin: ${superAdmin.email}`);
  console.log(`Company admin: ${companyAdmin.email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
