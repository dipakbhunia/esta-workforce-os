import { BadRequestException, Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderEventStatus, PaymentProviderOrderStatus, PaymentProviderType, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BillingProviderCredentialsService } from '../billing-settings/billing-provider-credentials.service';
import { transitionPaymentState } from './payment-state-machine';
import type { StoredNormalizedProviderEvent } from './payment-provider-event.types';
import { ProviderRegistryService } from './providers/provider-registry.service';

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;
const PROCESSING_LEASE_MS = 5 * 60_000;
export const MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS = 10;

class ProviderOrderNotFoundError extends Error {}

@Injectable()
export class PaymentProviderEventsService {
  constructor(private readonly prisma: PrismaService, private readonly credentials: BillingProviderCredentialsService, private readonly providers: ProviderRegistryService) {}

  async ingest(provider: PaymentProviderType, configurationId: string, rawBody: Buffer, signature: string, providerEventId?: string) {
    let candidates;
    try { candidates = await this.credentials.resolveWebhookCandidates(configurationId, provider); }
    catch { throw new ServiceUnavailableException('Payment provider webhook is unavailable'); }
    const adapter = this.providers.resolve(provider);
    const verified = candidates.find((candidate) => adapter.verifyWebhookSignature({
      provider: candidate.provider, mode: candidate.mode, providerConfigurationId: candidate.providerConfigurationId,
      credentialVersionId: candidate.credentialVersionId, credentials: candidate.material,
    }, rawBody, signature));
    if (!verified) return { accepted: false as const, reason: 'INVALID_SIGNATURE' as const };
    let normalized;
    try { normalized = adapter.normalizeWebhookEvent(rawBody, providerEventId); }
    catch { throw new BadRequestException('Webhook payload is invalid'); }
    let event;
    try {
      event = await this.prisma.paymentProviderEvent.create({ data: {
        providerConfigurationId: configurationId, credentialVersionId: verified.credentialVersionId,
        provider, providerMode: verified.mode, providerEventId: normalized.providerEventId,
        eventType: normalized.sourceEventType, primaryEntityType: normalized.providerPaymentId ? 'payment' : null,
        primaryEntityId: normalized.providerPaymentId, providerOrderId: normalized.providerOrderId,
        providerPaymentId: normalized.providerPaymentId, providerCreatedAt: normalized.occurredAt,
        payloadHash: normalized.payloadHash, normalizedPayloadVersion: normalized.normalizedPayloadVersion,
        normalizedPayload: normalized.normalizedPayload as Prisma.InputJsonObject,
        signatureVerifiedAt: new Date(), status: PaymentProviderEventStatus.RECEIVED,
      } });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const [eventIdRow, payloadRow] = await Promise.all([
        normalized.providerEventId ? this.prisma.paymentProviderEvent.findFirst({ where: { providerConfigurationId: configurationId, providerEventId: normalized.providerEventId } }) : Promise.resolve(null),
        this.prisma.paymentProviderEvent.findFirst({ where: { providerConfigurationId: configurationId, payloadHash: normalized.payloadHash } }),
      ]);
      if (!eventIdRow && !payloadRow) throw new InternalServerErrorException('Payment provider event persistence conflict');
      if (eventIdRow && payloadRow && eventIdRow.id !== payloadRow.id) {
        event = await this.recordIngestionConflict([eventIdRow.id, payloadRow.id], 'DEDUPE_KEYS_RESOLVE_TO_DIFFERENT_EVENTS');
        return { accepted: true as const, eventId: event.id, conflict: true as const };
      }
      event = eventIdRow ?? payloadRow!;
      if (!this.isExactDuplicate(event, normalized, verified.credentialVersionId, provider, verified.mode, configurationId)) {
        await this.recordIngestionConflict([event.id], eventIdRow ? 'CONTRADICTORY_PROVIDER_EVENT_ID_REUSE' : 'CONTRADICTORY_PAYLOAD_REUSE');
        return { accepted: true as const, eventId: event.id, conflict: true as const };
      }
    }
    await this.process(event.id);
    return { accepted: true as const, eventId: event.id };
  }

  async process(eventId: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.paymentProviderEvent.updateMany({ where: { id: eventId, attemptCount: { lt: MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS }, OR: [
      { status: PaymentProviderEventStatus.RECEIVED },
      { status: PaymentProviderEventStatus.FAILED, nextRetryAt: { not: null, lte: now } },
      { status: PaymentProviderEventStatus.PROCESSING, processingStartedAt: { lte: new Date(now.getTime() - PROCESSING_LEASE_MS) } },
    ] }, data: { status: PaymentProviderEventStatus.PROCESSING, processingStartedAt: now, attemptCount: { increment: 1 }, nextRetryAt: null, safeErrorMessage: null } });
    if (claimed.count !== 1) return;
    try { await this.applyTruth(eventId); }
    catch (error) { if (this.isUniqueViolation(error)) await this.markPermanentConflict(eventId); else await this.markRetryableFailure(eventId, error); }
  }

  async recoverDue(limit = 25): Promise<void> {
    const now = new Date();
    const exhausted = await this.prisma.paymentProviderEvent.findMany({ where: {
      status: PaymentProviderEventStatus.PROCESSING, attemptCount: { gte: MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS },
      processingStartedAt: { lte: new Date(now.getTime() - PROCESSING_LEASE_MS) },
    }, orderBy: { receivedAt: 'asc' }, take: Math.min(Math.max(limit, 1), 100), select: { id: true } });
    for (const row of exhausted) { try { await this.markExhausted(row.id, 'PROCESSING_LEASE_EXHAUSTED'); } catch { /* another recovery run may retry terminalization */ } }
    const rows = await this.prisma.paymentProviderEvent.findMany({ where: { OR: [
      { status: PaymentProviderEventStatus.RECEIVED, attemptCount: { lt: MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS } },
      { status: PaymentProviderEventStatus.FAILED, attemptCount: { lt: MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS }, nextRetryAt: { not: null, lte: now } },
      { status: PaymentProviderEventStatus.PROCESSING, attemptCount: { lt: MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS }, processingStartedAt: { lte: new Date(now.getTime() - PROCESSING_LEASE_MS) } },
    ] }, orderBy: { receivedAt: 'asc' }, take: Math.min(Math.max(limit, 1), 100), select: { id: true } });
    for (const row of rows) { try { await this.process(row.id); } catch { /* isolate poisoned events; durable claim recovery remains available */ } }
  }

  private async applyTruth(eventId: string): Promise<void> {
    const candidate = await this.prisma.paymentProviderEvent.findUnique({ where: { id: eventId } });
    if (!candidate) return;
    const normalized = candidate.normalizedPayload as unknown as StoredNormalizedProviderEvent;
    if (normalized.truth === 'IGNORED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentProviderEvent.update({ where: { id: eventId }, data: { status: PaymentProviderEventStatus.IGNORED, processedAt: new Date(), processingStartedAt: null, safeErrorMessage: 'Unsupported provider event type' } });
        await tx.auditLog.create({ data: { action: 'PAYMENT_PROVIDER_EVENT_IGNORED', entityType: 'PaymentProviderEvent', entityId: eventId, metadata: { category: 'UNSUPPORTED_EVENT_TYPE' } } });
      });
      return;
    }
    if (!candidate.providerOrderId) throw new ProviderOrderNotFoundError('Provider order correlation is unavailable');
    const order = await this.prisma.paymentProviderOrder.findUnique({ where: { providerConfigurationId_providerOrderId: { providerConfigurationId: candidate.providerConfigurationId, providerOrderId: candidate.providerOrderId } }, select: { paymentId: true } });
    if (!order) throw new ProviderOrderNotFoundError('Provider order correlation is unavailable');
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${order.paymentId}::uuid FOR UPDATE`);
      if (!locked.length) throw new Error('Payment correlation is unavailable');
      const [event, payment, providerOrder] = await Promise.all([
        tx.paymentProviderEvent.findUnique({ where: { id: eventId } }),
        tx.payment.findUnique({ where: { id: order.paymentId }, include: { subscription: true, attempts: { where: { operation: PaymentAttemptOperation.CHECKOUT_CONFIRMATION, status: PaymentAttemptStatus.SUCCEEDED }, take: 1 } } }),
        tx.paymentProviderOrder.findUnique({ where: { providerConfigurationId_providerOrderId: { providerConfigurationId: candidate.providerConfigurationId, providerOrderId: candidate.providerOrderId! } } }),
      ]);
      if (!event || !payment || !providerOrder) throw new Error('Provider event correlation changed');
      const evidence = event.normalizedPayload as unknown as StoredNormalizedProviderEvent;
      const amountMinor = evidence.amountMinor ? BigInt(evidence.amountMinor) : null;
      await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { paymentId: payment.id, providerOrderRecordId: providerOrder.id } });
      const coherent = event.providerConfigurationId === payment.providerConfigurationId && event.provider === payment.provider
        && event.providerMode === payment.providerMode && providerOrder.paymentId === payment.id
        && providerOrder.providerConfigurationId === payment.providerConfigurationId
        && providerOrder.amountMinor === payment.amountMinor && providerOrder.currency === payment.currency
        && amountMinor === payment.amountMinor && evidence.currency === payment.currency
        && event.providerPaymentId === evidence.providerPaymentId
        && (!payment.attempts[0] || payment.attempts[0].providerPaymentId === evidence.providerPaymentId);
      if (!coherent) { await this.ignoreConflict(tx, event.id, payment.companyId, 'Provider payment evidence conflicts with stored ownership or money'); return; }
      if (evidence.providerPaymentId) {
        const competing = await tx.payment.findFirst({ where: { providerConfigurationId: payment.providerConfigurationId, capturedProviderPaymentId: evidence.providerPaymentId, id: { not: payment.id } }, select: { id: true } });
        if (competing) { await this.ignoreConflict(tx, event.id, payment.companyId, 'Provider payment identity is already bound to another payment'); return; }
      }
      const target = this.targetStatus(evidence.truth);
      if (!target) { await this.ignore(tx, event.id, 'Provider event does not carry payment truth', payment.companyId); return; }
      if (payment.status === PaymentStatus.CAPTURED) {
        if (target === PaymentStatus.CAPTURED && payment.capturedProviderPaymentId !== evidence.providerPaymentId) { await this.ignoreConflict(tx, event.id, payment.companyId, 'Captured provider payment identity conflicts with existing truth'); return; }
        await this.ignore(tx, event.id, target === PaymentStatus.CAPTURED ? 'Duplicate captured provider truth' : 'Stale provider truth after capture', payment.companyId); return;
      }
      if (payment.status === PaymentStatus.FAILED && target === PaymentStatus.AUTHORIZED) { await this.ignore(tx, event.id, 'Stale authorization after provider failure', payment.companyId); return; }
      const transition = transitionPaymentState(payment, target, {
        observedAt: evidence.occurredAt ? new Date(evidence.occurredAt) : event.receivedAt,
        providerStatus: evidence.providerPaymentStatus, providerPaymentId: evidence.providerPaymentId ?? undefined,
        failureCode: evidence.safeFailureCode ?? undefined, safeFailureMessage: evidence.safeFailureMessage ?? undefined,
      });
      if (transition.changed) await tx.payment.update({ where: { id: payment.id }, data: {
        status: transition.state.status, providerStatus: transition.state.providerStatus,
        authorizedAt: transition.state.authorizedAt, capturedAt: transition.state.capturedAt, failedAt: transition.state.failedAt,
        capturedProviderPaymentId: transition.state.capturedProviderPaymentId, failureCode: transition.state.failureCode,
        safeFailureMessage: transition.state.safeFailureMessage,
      } });
      if (target === PaymentStatus.CAPTURED && providerOrder.status === PaymentProviderOrderStatus.CREATED) await tx.paymentProviderOrder.update({ where: { id: providerOrder.id }, data: { status: PaymentProviderOrderStatus.PAID, providerStatus: 'paid' } });
      const action = target === PaymentStatus.AUTHORIZED ? 'PAYMENT_AUTHORIZED' : target === PaymentStatus.FAILED ? 'PAYMENT_FAILED' : transition.recoveredAfterFailure ? 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE' : 'PAYMENT_CAPTURED';
      if (transition.changed) await tx.auditLog.create({ data: { companyId: payment.companyId, action, entityType: 'Payment', entityId: payment.id, metadata: { provider: payment.provider, providerMode: payment.providerMode, providerEventId: event.id, providerOrderRecordId: providerOrder.id } } });
      if (target === PaymentStatus.CAPTURED && providerOrder.status === PaymentProviderOrderStatus.CLOSED) await tx.auditLog.create({ data: { companyId: payment.companyId, action: 'PAYMENT_CAPTURED_AFTER_ORDER_CLOSED', entityType: 'Payment', entityId: payment.id, metadata: { providerEventId: event.id, providerOrderRecordId: providerOrder.id } } });
      if (target === PaymentStatus.CAPTURED && payment.subscription.status === 'CANCELLED') await tx.auditLog.create({ data: { companyId: payment.companyId, action: 'PAYMENT_CAPTURED_FOR_CANCELLED_SUBSCRIPTION', entityType: 'Payment', entityId: payment.id, metadata: { providerEventId: event.id, subscriptionId: payment.subscriptionId } } });
      await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { paymentId: payment.id, providerOrderRecordId: providerOrder.id, status: PaymentProviderEventStatus.PROCESSED, processedAt: new Date(), processingStartedAt: null, safeErrorMessage: null } });
    });
  }

  private targetStatus(truth: StoredNormalizedProviderEvent['truth']): PaymentStatus | null { if (truth === 'PAYMENT_AUTHORIZED') return PaymentStatus.AUTHORIZED; if (truth === 'PAYMENT_CAPTURED') return PaymentStatus.CAPTURED; if (truth === 'PAYMENT_FAILED') return PaymentStatus.FAILED; return null; }
  private async ignore(tx: Prisma.TransactionClient, id: string, reason: string, companyId?: string) { await tx.paymentProviderEvent.update({ where: { id }, data: { status: PaymentProviderEventStatus.IGNORED, processedAt: new Date(), processingStartedAt: null, safeErrorMessage: reason } }); await tx.auditLog.create({ data: { companyId, action: 'PAYMENT_PROVIDER_EVENT_IGNORED', entityType: 'PaymentProviderEvent', entityId: id, metadata: { category: reason.includes('Duplicate') ? 'DUPLICATE_TRUTH' : 'STALE_TRUTH' } } }); }
  private async ignoreConflict(tx: Prisma.TransactionClient, eventId: string, companyId: string, reason: string) { await tx.paymentProviderEvent.update({ where: { id: eventId }, data: { status: PaymentProviderEventStatus.IGNORED, processedAt: new Date(), processingStartedAt: null, safeErrorMessage: reason } }); await tx.auditLog.create({ data: { companyId, action: 'PAYMENT_PROVIDER_EVENT_CONFLICT', entityType: 'PaymentProviderEvent', entityId: eventId, metadata: { category: 'CORRELATION_CONFLICT' } } }); }
  private async markRetryableFailure(id: string, error: unknown) { await this.prisma.$transaction(async (tx) => { const row = await tx.paymentProviderEvent.findUnique({ where: { id }, select: { attemptCount: true } }); if (!row) return; const category = error instanceof ProviderOrderNotFoundError ? 'PROVIDER_ORDER_NOT_FOUND' : 'PROCESSING_UNAVAILABLE'; if (row.attemptCount >= MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS) { await this.markExhaustedInTransaction(tx, id, category); return; } const delay = Math.min(RETRY_BASE_MS * 2 ** Math.min(Math.max(row.attemptCount - 1, 0), 6), RETRY_MAX_MS); await tx.paymentProviderEvent.update({ where: { id }, data: { status: PaymentProviderEventStatus.FAILED, processingStartedAt: null, nextRetryAt: new Date(Date.now() + delay), safeErrorMessage: category === 'PROVIDER_ORDER_NOT_FOUND' ? 'Provider order was not found during bounded correlation' : 'Provider event processing is temporarily unavailable' } }); await tx.auditLog.create({ data: { action: 'PAYMENT_PROVIDER_EVENT_PROCESSING_FAILED', entityType: 'PaymentProviderEvent', entityId: id, metadata: { category } } }); }); }
  private async markPermanentConflict(id: string) { await this.prisma.$transaction(async (tx) => { const event = await tx.paymentProviderEvent.findUnique({ where: { id } }); if (!event) return; await tx.paymentProviderEvent.update({ where: { id }, data: { status: PaymentProviderEventStatus.IGNORED, processingStartedAt: null, processedAt: new Date(), nextRetryAt: null, safeErrorMessage: 'Provider payment identity conflicts with existing truth' } }); await tx.auditLog.create({ data: { action: 'PAYMENT_PROVIDER_EVENT_CONFLICT', entityType: 'PaymentProviderEvent', entityId: id, metadata: { category: 'PROVIDER_PAYMENT_IDENTITY_CONFLICT' } } }); }); }
  private isUniqueViolation(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
  private async markExhausted(id: string, category: string) { await this.prisma.$transaction((tx) => this.markExhaustedInTransaction(tx, id, category)); }
  private async markExhaustedInTransaction(tx: Prisma.TransactionClient, id: string, category: string) { const changed = await tx.paymentProviderEvent.updateMany({ where: { id, OR: [{ status: PaymentProviderEventStatus.PROCESSING }, { status: PaymentProviderEventStatus.FAILED, nextRetryAt: { not: null } }] }, data: { status: PaymentProviderEventStatus.FAILED, processingStartedAt: null, nextRetryAt: null, safeErrorMessage: 'Provider event processing attempts were exhausted; manual review is required' } }); if (changed.count === 1) await tx.auditLog.create({ data: { action: 'PAYMENT_PROVIDER_EVENT_PROCESSING_EXHAUSTED', entityType: 'PaymentProviderEvent', entityId: id, metadata: { category, maxAttempts: MAX_PROVIDER_EVENT_PROCESSING_ATTEMPTS } } }); }
  private async recordIngestionConflict(eventIds: string[], category: string) { const ordered = [...new Set(eventIds)].sort(); return this.prisma.$transaction(async (tx) => { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentProviderEvent" WHERE "id" IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR UPDATE`); const primaryId = ordered[0]; const existingAudit = await tx.auditLog.findFirst({ where: { action: 'PAYMENT_PROVIDER_EVENT_CONFLICT', entityType: 'PaymentProviderEvent', entityId: primaryId, metadata: { path: ['category'], equals: category } } }); if (!existingAudit) await tx.auditLog.create({ data: { action: 'PAYMENT_PROVIDER_EVENT_CONFLICT', entityType: 'PaymentProviderEvent', entityId: primaryId, metadata: { category, relatedEventIds: ordered.slice(1) } } }); const event = await tx.paymentProviderEvent.findUnique({ where: { id: primaryId } }); if (!event) throw new InternalServerErrorException('Payment provider event persistence conflict'); return event; }); }
  private isExactDuplicate(existing: { providerConfigurationId: string; provider: PaymentProviderType; providerMode: string; providerEventId: string | null; payloadHash: string; credentialVersionId: string; eventType: string; providerOrderId: string | null; providerPaymentId: string | null; providerCreatedAt: Date | null; normalizedPayloadVersion: number; normalizedPayload: Prisma.JsonValue }, incoming: { providerEventId: string | null; payloadHash: string; sourceEventType: string; providerOrderId: string | null; providerPaymentId: string | null; occurredAt: Date | null; normalizedPayloadVersion: number; normalizedPayload: Record<string, unknown> }, credentialVersionId: string, provider: PaymentProviderType, mode: string, configurationId: string) { return existing.providerConfigurationId === configurationId && existing.provider === provider && existing.providerMode === mode && existing.providerEventId === incoming.providerEventId && existing.payloadHash === incoming.payloadHash && existing.credentialVersionId === credentialVersionId && existing.eventType === incoming.sourceEventType && existing.providerOrderId === incoming.providerOrderId && existing.providerPaymentId === incoming.providerPaymentId && existing.providerCreatedAt?.getTime() === incoming.occurredAt?.getTime() && existing.normalizedPayloadVersion === incoming.normalizedPayloadVersion && this.canonicalJson(existing.normalizedPayload) === this.canonicalJson(incoming.normalizedPayload); }
  private canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(',')}}`; return JSON.stringify(value); }
}
