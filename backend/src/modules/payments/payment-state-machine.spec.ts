import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus } from '@prisma/client';
import type { PaymentStateSnapshot } from './payment.types';
import { canTransitionPayment, transitionPaymentState } from './payment-state-machine';

const base = (status: PaymentStatus): PaymentStateSnapshot => ({
  status,
  providerStatus: null,
  authorizedAt: null,
  capturedAt: null,
  failedAt: null,
  failureCode: null,
  safeFailureMessage: null,
  capturedProviderPaymentId: null,
});

describe('payment state machine', () => {
  const allowed: Array<[PaymentStatus, PaymentStatus]> = [
    [PaymentStatus.PENDING, PaymentStatus.PENDING],
    [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED],
    [PaymentStatus.PENDING, PaymentStatus.CAPTURED],
    [PaymentStatus.PENDING, PaymentStatus.FAILED],
    [PaymentStatus.AUTHORIZED, PaymentStatus.AUTHORIZED],
    [PaymentStatus.AUTHORIZED, PaymentStatus.PENDING],
    [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED],
    [PaymentStatus.AUTHORIZED, PaymentStatus.FAILED],
    [PaymentStatus.FAILED, PaymentStatus.FAILED],
    [PaymentStatus.FAILED, PaymentStatus.CAPTURED],
    [PaymentStatus.CAPTURED, PaymentStatus.CAPTURED],
  ];

  for (const [from, to] of allowed) {
    it(`allows ${from} -> ${to}`, () => {
      assert.equal(canTransitionPayment(from, to), true);
    });
  }

  it('rejects every undocumented transition', () => {
    const allowedKeys = new Set(allowed.map(([from, to]) => `${from}:${to}`));
    for (const from of Object.values(PaymentStatus)) {
      for (const to of Object.values(PaymentStatus)) {
        assert.equal(canTransitionPayment(from, to), allowedKeys.has(`${from}:${to}`));
      }
    }
  });

  it('keeps captured observations idempotent', () => {
    const current = {
      ...base(PaymentStatus.CAPTURED),
      capturedAt: new Date('2026-08-26T10:00:00.000Z'),
      capturedProviderPaymentId: 'pay_original',
      providerStatus: 'captured',
    };
    const result = transitionPaymentState(current, PaymentStatus.CAPTURED, {
      providerPaymentId: 'pay_duplicate',
    });
    assert.equal(result.changed, false);
    assert.deepEqual(result.state, current);
  });

  it('applies PENDING -> AUTHORIZED evidence', () => {
    const observedAt = new Date('2026-08-26T08:00:00.000Z');
    const result = transitionPaymentState(base(PaymentStatus.PENDING), PaymentStatus.AUTHORIZED, {
      observedAt,
      providerStatus: 'authorized',
    });
    assert.equal(result.changed, true);
    assert.equal(result.state.status, PaymentStatus.AUTHORIZED);
    assert.equal(result.state.authorizedAt, observedAt);
    assert.equal(result.state.providerStatus, 'authorized');
  });

  it('applies AUTHORIZED -> PENDING while retaining authorization history', () => {
    const authorizedAt = new Date('2026-08-26T08:00:00.000Z');
    const current = {
      ...base(PaymentStatus.AUTHORIZED),
      authorizedAt,
      providerStatus: 'authorized',
    };
    const result = transitionPaymentState(current, PaymentStatus.PENDING, {
      providerStatus: 'order_replaced',
    });
    assert.equal(result.changed, true);
    assert.equal(result.state.status, PaymentStatus.PENDING);
    assert.equal(result.state.authorizedAt, authorizedAt);
    assert.equal(result.state.providerStatus, 'order_replaced');
  });

  for (const source of [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED]) {
    it(`applies ${source} -> FAILED evidence`, () => {
      const observedAt = new Date('2026-08-26T09:00:00.000Z');
      const current = {
        ...base(source),
        authorizedAt:
          source === PaymentStatus.AUTHORIZED
            ? new Date('2026-08-26T08:00:00.000Z')
            : null,
      };
      const result = transitionPaymentState(current, PaymentStatus.FAILED, {
        observedAt,
        providerStatus: 'failed',
        failureCode: 'DECLINED',
        safeFailureMessage: 'Payment was declined',
      });
      assert.equal(result.changed, true);
      assert.equal(result.state.status, PaymentStatus.FAILED);
      assert.equal(result.state.failedAt, observedAt);
      assert.equal(result.state.failureCode, 'DECLINED');
      assert.equal(result.state.safeFailureMessage, 'Payment was declined');
      assert.equal(result.state.providerStatus, 'failed');
      assert.equal(result.state.authorizedAt, current.authorizedAt);
    });
  }

  for (const status of [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED]) {
    it(`keeps ${status} observations idempotent`, () => {
      const current = {
        ...base(status),
        providerStatus: 'original',
        authorizedAt:
          status === PaymentStatus.AUTHORIZED
            ? new Date('2026-08-26T08:00:00.000Z')
            : null,
        failedAt:
          status === PaymentStatus.FAILED ? new Date('2026-08-26T09:00:00.000Z') : null,
        failureCode: status === PaymentStatus.FAILED ? 'ORIGINAL' : null,
        safeFailureMessage: status === PaymentStatus.FAILED ? 'Original failure' : null,
      };
      const result = transitionPaymentState(current, status, {
        observedAt: new Date('2026-08-26T10:00:00.000Z'),
        providerStatus: 'duplicate',
        failureCode: 'REPLACEMENT',
        safeFailureMessage: 'Replacement failure',
      });
      assert.equal(result.changed, false);
      assert.deepEqual(result.state, current);
    });
  }

  it('never permits captured payment regression', () => {
    for (const target of [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED]) {
      assert.throws(() => transitionPaymentState(base(PaymentStatus.CAPTURED), target), /cannot transition/i);
    }
  });

  it('preserves failure evidence when late capture recovers a payment', () => {
    const failedAt = new Date('2026-08-26T09:00:00.000Z');
    const current = {
      ...base(PaymentStatus.FAILED),
      failedAt,
      failureCode: 'TERMINALIZED',
      safeFailureMessage: 'Payment intent was closed after reconciliation',
      providerStatus: 'failed',
    };
    const capturedAt = new Date('2026-08-26T10:00:00.000Z');
    const result = transitionPaymentState(current, PaymentStatus.CAPTURED, {
      observedAt: capturedAt,
      providerStatus: 'captured',
      providerPaymentId: 'pay_recovered',
    });
    assert.equal(result.recoveredAfterFailure, true);
    assert.equal(result.state.failedAt, failedAt);
    assert.equal(result.state.failureCode, 'TERMINALIZED');
    assert.equal(result.state.safeFailureMessage, current.safeFailureMessage);
    assert.equal(result.state.capturedAt, capturedAt);
    assert.equal(result.state.capturedProviderPaymentId, 'pay_recovered');
    assert.equal(result.state.providerStatus, 'captured');
  });

  it('requires a provider payment ID for capture', () => {
    assert.throws(
      () => transitionPaymentState(base(PaymentStatus.PENDING), PaymentStatus.CAPTURED),
      /provider payment ID/i,
    );
  });
});
