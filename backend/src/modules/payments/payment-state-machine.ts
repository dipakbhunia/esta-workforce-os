import { PaymentStatus } from '@prisma/client';
import type { PaymentStateSnapshot } from './payment.types';

const allowedTransitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.PENDING,
    PaymentStatus.AUTHORIZED,
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.AUTHORIZED]: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.PENDING,
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.CAPTURED]: [PaymentStatus.CAPTURED],
  [PaymentStatus.FAILED]: [PaymentStatus.FAILED, PaymentStatus.CAPTURED],
};

export interface PaymentTransitionEvidence {
  providerStatus?: string | null;
  observedAt?: Date;
  providerPaymentId?: string;
  failureCode?: string;
  safeFailureMessage?: string;
}

export interface PaymentTransitionResult {
  changed: boolean;
  recoveredAfterFailure: boolean;
  state: PaymentStateSnapshot;
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionPaymentState(
  current: PaymentStateSnapshot,
  target: PaymentStatus,
  evidence: PaymentTransitionEvidence = {},
): PaymentTransitionResult {
  if (!canTransitionPayment(current.status, target)) {
    throw new Error(`Payment cannot transition from ${current.status} to ${target}`);
  }

  if (current.status === target) {
    return { changed: false, recoveredAfterFailure: false, state: { ...current } };
  }

  const observedAt = evidence.observedAt ?? new Date();
  const next: PaymentStateSnapshot = {
    ...current,
    status: target,
    providerStatus: evidence.providerStatus ?? current.providerStatus,
  };

  if (target === PaymentStatus.AUTHORIZED) {
    next.authorizedAt = observedAt;
  }
  if (target === PaymentStatus.CAPTURED) {
    if (!evidence.providerPaymentId?.trim()) {
      throw new Error('Captured payment requires an authoritative provider payment ID');
    }
    next.capturedAt = observedAt;
    next.capturedProviderPaymentId = evidence.providerPaymentId.trim();
  }
  if (target === PaymentStatus.FAILED) {
    next.failedAt = observedAt;
    next.failureCode = evidence.failureCode?.trim() || current.failureCode;
    next.safeFailureMessage = evidence.safeFailureMessage?.trim() || current.safeFailureMessage;
  }

  return {
    changed: true,
    recoveredAfterFailure:
      current.status === PaymentStatus.FAILED && target === PaymentStatus.CAPTURED,
    state: next,
  };
}
