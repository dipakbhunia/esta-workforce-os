import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { GstTaxPolicyStatus, GstTaxTreatment, PrismaClient } from '@prisma/client';
import { PlatformGstService } from './platform-gst.service';

const enabled = process.env.RUN_GST_ADMIN_DB_INTEGRATION === '1';

describe('GST-B PostgreSQL policy administration', () => {
  it('appends deterministic versions and rejects cross-code ACTIVE overlap without enabling GST', { skip: !enabled }, async () => {
    const prisma = new PrismaClient();
    const suffix = randomUUID().replaceAll('-', '').toUpperCase();
    const code = `GSTB_${suffix}`;
    const ids: string[] = [];
    let actorId: string | undefined;
    await prisma.$connect();
    try {
      const actor = await prisma.user.create({ data: { email: `gstb-${suffix}@example.invalid`, passwordHash: 'integration-only', firstName: 'GST-B', lastName: 'Actor' }, select: { id: true } });
      actorId = actor.id;
      const before = await prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' }, select: { gstEnabled: true } });
      const service = new PlatformGstService(prisma as never);
      const base = { policyCode: code, currency: 'INR', treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1200, cgstRateBasisPoints: 600, sgstRateBasisPoints: 600, igstRateBasisPoints: 1200, serviceClassification: '9983' };
      let releaseLock!: () => void; let lockAcquired!: () => void;
      const release = new Promise<void>(resolve => { releaseLock = resolve; });
      const acquired = new Promise<void>(resolve => { lockAcquired = resolve; });
      const blocker = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${code}))::text`; lockAcquired(); await release; });
      await acquired;
      let firstSettled = false; let secondSettled = false;
      const firstPromise = service.createPolicy({ ...base, status: GstTaxPolicyStatus.DRAFT, effectiveFrom: '2090-01-01T00:00:00Z' }, actor.id).finally(() => { firstSettled = true; });
      const secondPromise = service.createPolicy({ ...base, status: GstTaxPolicyStatus.DRAFT, effectiveFrom: '2090-02-01T00:00:00Z' }, actor.id).finally(() => { secondSettled = true; });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(firstSettled, false); assert.equal(secondSettled, false);
      releaseLock(); await blocker;
      const concurrent = await Promise.all([firstPromise, secondPromise]); ids.push(...concurrent.map(row => row.id));
      assert.deepEqual(concurrent.map(row => row.version).sort((a, b) => a - b), [1, 2]);
      const durableConcurrent = await prisma.gstTaxPolicyVersion.findMany({ where: { id: { in: concurrent.map(row => row.id) } }, orderBy: { version: 'asc' }, select: { id: true, policyCode: true, version: true } });
      assert.deepEqual(durableConcurrent.map(row => row.version), [1, 2]);
      assert.equal(new Set(durableConcurrent.map(row => row.id)).size, 2);
      assert.ok(durableConcurrent.every(row => row.policyCode === code));
      const active = await service.createPolicy({ ...base, status: GstTaxPolicyStatus.ACTIVE, effectiveFrom: '2090-01-01T00:00:00Z', effectiveUntil: '2091-01-01T00:00:00Z' }, actor.id); ids.push(active.id); assert.equal(active.version, 3);
      await assert.rejects(() => service.createPolicy({ ...base, policyCode: `OTHER_${suffix}`, status: GstTaxPolicyStatus.ACTIVE, effectiveFrom: '2090-06-01T00:00:00Z', effectiveUntil: '2090-07-01T00:00:00Z' }, actor.id), ConflictException);
      const next = await service.createPolicy({ ...base, status: GstTaxPolicyStatus.ACTIVE, effectiveFrom: '2091-01-01T00:00:00Z', effectiveUntil: '2092-01-01T00:00:00Z' }, actor.id); ids.push(next.id); assert.equal(next.version, 4);
      const page = await service.listPolicies({ page: 1, limit: 20, currency: 'INR', effectiveAt: '2090-06-01T00:00:00Z' });
      assert.equal(page.data.filter(row => row.id === active.id).length, 1);
      assert.deepEqual(await service.getPolicy(concurrent[0].id), concurrent[0]);
      const after = await prisma.billingSettings.findUnique({ where: { scope: 'PLATFORM' }, select: { gstEnabled: true } });
      assert.deepEqual(after, before);
    } finally {
      await prisma.gstTaxPolicyVersion.deleteMany({ where: { id: { in: ids } } });
      if (actorId) await prisma.user.delete({ where: { id: actorId } });
      await prisma.$disconnect();
    }
  });
});
