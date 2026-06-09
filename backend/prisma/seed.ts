import {
  CompanyStatus,
  PrismaClient,
  RoleName,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function upsertRole(companyId: string | null, name: RoleName) {
  const existingRole = await prisma.role.findFirst({
    where: { companyId, name },
  });

  if (existingRole) {
    return existingRole;
  }

  return prisma.role.create({
    data: { companyId, name },
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

  const company = await prisma.company.upsert({
    where: { slug: 'demo-company' },
    update: {
      name: 'Demo Company',
      status: CompanyStatus.TRIAL,
    },
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      status: CompanyStatus.TRIAL,
    },
  });

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
    (role) => role.name === RoleName.COMPANY_ADMIN,
  );

  if (!companyAdminRole) {
    throw new Error('Company admin role was not created');
  }

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail.toLowerCase() },
    update: {
      passwordHash: await bcrypt.hash(superAdminPassword, SALT_ROUNDS),
      firstName: 'Super',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
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
