import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MonitoringAlertSeverity } from '@prisma/client';
import { NotificationRecipientResolver } from './notification-recipient-resolver.service';

describe('NotificationRecipientResolver monitoring authority', () => {
  const roleUser = { id: 'admin', email: 'admin@example.test', companyId: 'company' };
  const employeeUser = { id: 'employee-user', email: 'employee@example.test', companyId: 'company' };
  const prisma = { user: { findMany: async ({ where }: { where: { companyId: string } }) => {
    assert.equal(where.companyId, 'company'); return [roleUser]; }, findUnique: async () => employeeUser }, employee: { findFirst: async ({ where }: { where: { companyId: string } }) => {
      assert.equal(where.companyId, 'company');
      return { user: employeeUser, reportingManager: { user: roleUser } };
    } } };

  it('deduplicates role and manager recipients and includes the employee for critical/info', async () => {
    const resolver = new NotificationRecipientResolver(prisma as never);
    const result = await resolver.resolveForAlert({ companyId: 'company', employeeId: 'employee', severity: MonitoringAlertSeverity.CRITICAL });
    assert.deepEqual(result.map((row) => row.userId), ['admin', 'employee-user']);
  });

  it('excludes the affected employee for warning alerts', async () => {
    const resolver = new NotificationRecipientResolver(prisma as never);
    const result = await resolver.resolveForAlert({ companyId: 'company', employeeId: 'employee', severity: MonitoringAlertSeverity.WARNING });
    assert.deepEqual(result.map((row) => row.userId), ['admin']);
  });

  it('rejects a recipient relation that does not belong to the alert company', async () => {
    const resolver = new NotificationRecipientResolver({ user: { findMany: async () => [] }, employee: { findFirst: async () => ({
      user: { ...employeeUser, companyId: 'other-company' }, reportingManager: null,
    }) } } as never);
    assert.deepEqual(await resolver.resolveForAlert({ companyId: 'company', employeeId: 'employee', severity: MonitoringAlertSeverity.CRITICAL }), []);
  });

  it('resolves exactly the affected durable user without status or tenant fallback', async () => {
    const resolver = new NotificationRecipientResolver(prisma as never);
    assert.deepEqual(await resolver.resolveAffectedUser(employeeUser.id), {
      userId: employeeUser.id,
      email: employeeUser.email,
      companyId: employeeUser.companyId,
    });
    const missing = new NotificationRecipientResolver({ user: { findUnique: async () => null } } as never);
    assert.equal(await missing.resolveAffectedUser('missing'), null);
  });
});
