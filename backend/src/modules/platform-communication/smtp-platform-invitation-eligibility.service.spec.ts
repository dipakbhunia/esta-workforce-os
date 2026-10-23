import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationStatus, RoleName, SmtpConfigurationLifecycle, UserStatus } from '@prisma/client';
import { SmtpPlatformInvitationEligibilityService } from './smtp-platform-invitation-eligibility.service';

const actor = { id: 'actor', email: 'actor@example.invalid', firstName: 'Act', lastName: 'Or', companyId: null,
  status: UserStatus.ACTIVE, deletedAt: null, roles: [{ role: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } }] };
const target = { ...actor, id: 'target', email: 'TARGET@example.invalid', status: UserStatus.INACTIVE };
const invitation = { id: 'delivery', notificationId: 'notification', recipient: 'target@example.invalid',
  status: NotificationStatus.PENDING, attemptCount: 0, claimToken: null, claimExpiresAt: null, nextRetryAt: null, errorCode: null,
  notification: { accountActionToken: { expiresAt: new Date(Date.now() + 60_000), consumedAt: null, invalidatedAt: null } } };
const smtp = { id: 'smtp', version: 1, revision: 3, lifecycle: SmtpConfigurationLifecycle.TESTED };

function fixture(overrides: Record<string, unknown> = {}) {
  const tx = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => where.id === actor.id ? actor : target },
    notificationDelivery: { findMany: async () => [invitation], count: async () => 1 },
    platformEmailSettings: { findUnique: async () => null },
    smtpConfigurationVersion: { findMany: async () => [smtp] },
    auditLog: { count: async () => 0 },
    $queryRaw: async () => [],
    ...overrides,
  };
  const prisma = { $transaction: (fn: (value: unknown) => unknown) => fn(tx) };
  const config = { get: (key: string) => key === 'SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED' };
  return { service: new SmtpPlatformInvitationEligibilityService(prisma as never, config as never), tx };
}

describe('SmtpPlatformInvitationEligibilityService', () => {
  it('returns only server-selected identifiers for an eligible platform invitation', async () => {
    const result = await fixture().service.get(target.id, { id: actor.id } as never);
    assert.equal(result.available, true);
    assert.equal(result.reasonCode, 'ELIGIBLE');
    assert.deepEqual(result.delivery && { id: result.delivery.deliveryId, attempts: result.delivery.attemptCount }, { id: 'delivery', attempts: 0 });
    assert.deepEqual(result.smtp && { id: result.smtp.configurationId, revision: result.smtp.revision }, { id: 'smtp', revision: 3 });
    assert.equal(result.target.email, 'target@example.invalid');
    assert.equal('recipient' in result, false);
  });

  it('reports disabled gate without weakening the remaining authority checks', async () => {
    const { service } = fixture();
    (service as unknown as { config: { get: (key: string) => boolean } }).config.get = () => false;
    const result = await service.get(target.id, { id: actor.id } as never);
    assert.deepEqual({ available: result.available, reason: result.reasonCode, gate: result.gateEnabled },
      { available: false, reason: 'GATE_DISABLED', gate: false });
  });

  it('fails closed for ambiguous eligible SMTP authority', async () => {
    const { service } = fixture({ smtpConfigurationVersion: { findMany: async () => [smtp, { ...smtp, id: 'smtp-2', version: 2 }] } });
    const result = await service.get(target.id, { id: actor.id } as never);
    assert.equal(result.reasonCode, 'SMTP_CONFIGURATION_AMBIGUOUS');
    assert.equal(result.available, false);
  });

  for (const state of ['expired', 'consumed', 'invalidated'] as const) {
    it(`ignores a ${state} historical invitation when one current invitation is eligible`, async () => {
      let receivedWhere: unknown;
      const { service } = fixture({ notificationDelivery: {
        findMany: async ({ where }: { where: unknown }) => { receivedWhere = where; return [invitation]; },
        count: async () => 2,
      } });
      const result = await service.get(target.id, { id: actor.id } as never);
      assert.equal(result.available, true);
      assert.equal(result.delivery?.deliveryId, invitation.id);
      assert.match(JSON.stringify(receivedWhere), /consumedAt.*invalidatedAt.*expiresAt/);
    });
  }

  it('fails closed when multiple currently eligible invitations remain', async () => {
    const { service } = fixture({ notificationDelivery: { findMany: async () => [invitation, { ...invitation, id: 'delivery-2' }], count: async () => 2 } });
    const result = await service.get(target.id, { id: actor.id } as never);
    assert.equal(result.reasonCode, 'INVITATION_AMBIGUOUS');
  });

  it('accepts a due retry and an expired claim below the attempt limit', async () => {
    const retry = { ...invitation, attemptCount: 2, errorCode: 'SMTP_CONNECTION_FAILED',
      nextRetryAt: new Date(Date.now() - 1_000), claimToken: 'expired-claim', claimExpiresAt: new Date(Date.now() - 1_000) };
    const { service } = fixture({ notificationDelivery: { findMany: async () => [retry], count: async () => 1 } });
    const result = await service.get(target.id, { id: actor.id } as never);
    assert.equal(result.available, true);
    assert.equal(result.delivery?.attemptCount, 2);
    assert.equal(result.delivery?.isClaimed, false);
  });

  for (const state of ['future retry', 'active claim', 'exhausted attempts', 'uncertain acceptance'] as const) {
    it(`rejects ${state}`, async () => {
      const { service } = fixture({ notificationDelivery: { findMany: async () => [], count: async () => 1 } });
      const result = await service.get(target.id, { id: actor.id } as never);
      assert.equal(result.available, false);
      assert.equal(result.reasonCode, 'DELIVERY_INELIGIBLE');
    });
  }

  it('uses the exact normalized recipient in the eligible-candidate query', async () => {
    let receivedWhere: { recipient?: string } = {};
    const { service } = fixture({ notificationDelivery: {
      findMany: async ({ where }: { where: { recipient?: string } }) => { receivedWhere = where; return [invitation]; }, count: async () => 1,
    } });
    await service.get(target.id, { id: actor.id } as never);
    assert.equal(receivedWhere.recipient, 'target@example.invalid');
  });

  it('rejects a stale live actor before exposing invitation state', async () => {
    const staleActor = { ...actor, status: UserStatus.SUSPENDED };
    const { service } = fixture({ user: { findUnique: async ({ where }: { where: { id: string } }) => where.id === actor.id ? staleActor : target } });
    await assert.rejects(() => service.get(target.id, { id: actor.id } as never), (error: unknown) =>
      error instanceof Error && error.constructor.name === 'ForbiddenException');
  });
});
