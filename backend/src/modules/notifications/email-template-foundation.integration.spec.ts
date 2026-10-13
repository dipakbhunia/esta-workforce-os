import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

const enabled = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;

after(async () => prisma?.$disconnect());

async function createActor(label: string) {
  assert.ok(prisma);
  return prisma.user.create({ data: {
    email: `et-b1-${label}-${randomUUID()}@example.invalid`,
    passwordHash: 'integration-only', firstName: 'ET-B1', lastName: label,
  }, select: { id: true } });
}

async function createTemplate(type: string, key = `ET_${randomUUID().replaceAll('-', '').toUpperCase()}`) {
  assert.ok(prisma);
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "EmailTemplate" ("id", "templateKey", "notificationType", "createdAt", "updatedAt")
     VALUES ($1::uuid, $2, $3::"NotificationType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id, key, type,
  );
  return { id, key };
}

async function createVersion(templateId: string, actorId: string, subject = 'Subject') {
  assert.ok(prisma);
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "EmailTemplateVersion" (
       "id", "templateId", "subjectTemplate", "textBodyTemplate", "createdByUserId", "createdAt", "updatedAt"
     ) VALUES ($1::uuid, $2::uuid, $3, 'Plain text body', $4::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id, templateId, subject, actorId,
  );
  const [row] = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
    `SELECT "version" FROM "EmailTemplateVersion" WHERE "id" = $1::uuid`, id,
  );
  return { id, version: row.version };
}

async function publishVersion(id: string, actorId: string) {
  assert.ok(prisma);
  await prisma.$executeRawUnsafe(
    `UPDATE "EmailTemplateVersion"
       SET "validationResultCode" = 'VALID', "validatedAt" = CURRENT_TIMESTAMP,
           "validatedByUserId" = $2::uuid, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1::uuid`, id, actorId,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "EmailTemplateVersion"
       SET "lifecycle" = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP,
           "publishedByUserId" = $2::uuid, "revision" = "revision" + 1,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1::uuid`, id, actorId,
  );
}

describe('Email Templates PostgreSQL foundation', { skip: !enabled }, () => {
  it('adds no templates automatically and preserves existing notifications with nullable provenance', async () => {
    assert.ok(prisma);
    assert.equal(await prisma.emailTemplate.count(), 0);
    const actor = await createActor('Compatibility');
    const notification = await prisma.notification.create({ data: {
      userId: actor.id, type: 'PASSWORD_CHANGED', channel: 'EMAIL', title: 'Existing',
      message: 'Code-rendered content', idempotencyKey: `et-b1-existing-${randomUUID()}`,
    } });
    assert.equal(notification.emailTemplateVersionId, null);
    assert.equal(notification.emailCompositionVersion, null);
  });

  it('enforces stable-key and notification-type uniqueness', async () => {
    assert.ok(prisma);
    const first = await createTemplate('PASSWORD_CHANGED');
    await assert.rejects(() => createTemplate('ACCOUNT_STATUS_CHANGED', first.key));
    await assert.rejects(() => createTemplate('PASSWORD_CHANGED'));
    await assert.rejects(() => createTemplate('ACCOUNT_STATUS_CHANGED', 'invalid-key'));
    await assert.rejects(() => createTemplate('ALERT_ACKNOWLEDGED'));
  });

  it('allocates unique sequential per-template versions under multi-client concurrency', async () => {
    assert.ok(prisma);
    const actor = await createActor('Concurrency');
    const template = await createTemplate('ACCOUNT_STATUS_CHANGED');
    const clients = Array.from({ length: 8 }, () => new PrismaClient());
    try {
      const ids = Array.from({ length: clients.length }, () => randomUUID());
      await Promise.all(clients.map((client, index) => client.$executeRawUnsafe(
        `INSERT INTO "EmailTemplateVersion" (
           "id", "templateId", "subjectTemplate", "textBodyTemplate", "createdByUserId", "createdAt", "updatedAt"
         ) VALUES ($1::uuid, $2::uuid, $3, 'Concurrent body', $4::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ids[index], template.id, `Concurrent ${index}`, actor.id,
      )));
      const rows = await prisma.emailTemplateVersion.findMany({
        where: { id: { in: ids } }, select: { version: true }, orderBy: { version: 'asc' },
      });
      assert.deepEqual(rows.map(({ version }) => version), [1, 2, 3, 4, 5, 6, 7, 8]);
      const explicitId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmailTemplateVersion" (
           "id", "templateId", "version", "subjectTemplate", "textBodyTemplate", "createdByUserId", "createdAt", "updatedAt"
         ) VALUES ($1::uuid, $2::uuid, 999, 'Explicit probe', 'Body', $3::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        explicitId, template.id, actor.id,
      );
      assert.equal((await prisma.emailTemplateVersion.findUniqueOrThrow({ where: { id: explicitId } })).version, 9);
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  });

  it('allows draft edits but requires coherent validation and publication evidence', async () => {
    assert.ok(prisma);
    const actor = await createActor('Draft');
    const template = await createTemplate('ACCOUNT_INVITATION');
    const version = await createVersion(template.id, actor.id);
    await prisma.emailTemplateVersion.update({
      where: { id: version.id }, data: { subjectTemplate: 'Edited draft', revision: { increment: 1 } },
    });
    await assert.rejects(() => prisma.$executeRawUnsafe(
      `UPDATE "EmailTemplateVersion" SET "validatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1::uuid`, version.id,
    ));
    await assert.rejects(() => prisma.$executeRawUnsafe(
      `UPDATE "EmailTemplateVersion" SET "lifecycle" = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP WHERE "id" = $1::uuid`, version.id,
    ));
    await assert.rejects(() => prisma.$executeRawUnsafe(
      `UPDATE "EmailTemplateVersion" SET "lifecycle" = 'RETIRED', "retiredAt" = CURRENT_TIMESTAMP WHERE "id" = $1::uuid`, version.id,
    ));
  });

  it('enforces published immutability and safe lifecycle transitions', async () => {
    assert.ok(prisma);
    const actor = await createActor('History');
    const template = await createTemplate('PASSWORD_RESET_REQUESTED');
    const version = await createVersion(template.id, actor.id);
    await publishVersion(version.id, actor.id);
    await assert.rejects(() => prisma.emailTemplateVersion.update({
      where: { id: version.id }, data: { subjectTemplate: 'Mutated' },
    }));
    await assert.rejects(() => prisma.emailTemplateVersion.update({
      where: { id: version.id }, data: { lifecycle: 'DRAFT' },
    }));
    await assert.rejects(() => prisma.emailTemplateVersion.delete({ where: { id: version.id } }));
    await prisma.emailTemplateVersion.update({
      where: { id: version.id },
      data: { lifecycle: 'RETIRED', retiredAt: new Date(), retiredByUserId: actor.id, revision: { increment: 1 } },
    });
    await assert.rejects(() => prisma.emailTemplateVersion.update({
      where: { id: version.id }, data: { lifecycle: 'PUBLISHED' },
    }));
  });

  it('requires an active version to be published and owned by the same template', async () => {
    assert.ok(prisma);
    const actor = await createActor('Ownership');
    const first = await createTemplate('EMAIL_VERIFICATION');
    const second = await createTemplate('PAYMENT_CAPTURED');
    const draft = await createVersion(first.id, actor.id);
    const published = await createVersion(second.id, actor.id);
    await publishVersion(published.id, actor.id);
    await assert.rejects(() => prisma.emailTemplate.update({
      where: { id: first.id }, data: { activeVersionId: draft.id },
    }));
    await assert.rejects(() => prisma.emailTemplate.update({
      where: { id: first.id }, data: { activeVersionId: published.id },
    }));
    await prisma.emailTemplate.update({
      where: { id: second.id }, data: { activeVersionId: published.id, revision: { increment: 1 } },
    });
    await assert.rejects(() => prisma.emailTemplateVersion.update({
      where: { id: published.id },
      data: { lifecycle: 'RETIRED', retiredAt: new Date(), retiredByUserId: actor.id },
    }));
  });

  it('atomically changes or rolls back active pointers and supports rollback to published history', async () => {
    assert.ok(prisma);
    const actor = await createActor('Publication');
    const template = await createTemplate('PAYMENT_FAILED');
    const first = await createVersion(template.id, actor.id, 'First');
    const second = await createVersion(template.id, actor.id, 'Second');
    await publishVersion(first.id, actor.id); await publishVersion(second.id, actor.id);
    await prisma.emailTemplate.update({ where: { id: template.id }, data: { activeVersionId: first.id } });
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      await tx.emailTemplate.update({
        where: { id: template.id }, data: { activeVersionId: second.id, revision: { increment: 1 } },
      });
      throw new Error('ROLLBACK_PROBE');
    }));
    assert.equal((await prisma.emailTemplate.findUniqueOrThrow({ where: { id: template.id } })).activeVersionId, first.id);
    await prisma.emailTemplate.update({
      where: { id: template.id }, data: { activeVersionId: second.id, revision: { increment: 1 } },
    });
    await prisma.emailTemplate.update({
      where: { id: template.id }, data: { activeVersionId: first.id, revision: { increment: 1 } },
    });
    assert.equal((await prisma.emailTemplate.findUniqueOrThrow({ where: { id: template.id } })).activeVersionId, first.id);
  });

  it('preserves notification provenance and supports optimistic revision fencing', async () => {
    assert.ok(prisma);
    const actor = await createActor('Provenance');
    const template = await createTemplate('INVOICE_ISSUED');
    const version = await createVersion(template.id, actor.id);
    await publishVersion(version.id, actor.id);
    const notification = await prisma.notification.create({ data: {
      userId: actor.id, type: 'INVOICE_ISSUED', channel: 'EMAIL', title: 'Invoice', message: 'Issued',
      idempotencyKey: `et-b1-provenance-${randomUUID()}`, emailTemplateVersionId: version.id,
      emailCompositionVersion: 'email-composition/v1',
    } });
    await prisma.emailTemplate.update({ where: { id: template.id }, data: { revision: { increment: 1 } } });
    const fenced = await prisma.emailTemplate.updateMany({
      where: { id: template.id, revision: 1 }, data: { revision: { increment: 1 } },
    });
    assert.equal(fenced.count, 0);
    const persisted = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    assert.equal(persisted.emailTemplateVersionId, version.id);
    assert.equal(persisted.emailCompositionVersion, 'email-composition/v1');
    await assert.rejects(() => prisma.emailTemplateVersion.delete({ where: { id: version.id } }));
  });
});
