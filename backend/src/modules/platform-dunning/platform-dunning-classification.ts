import { PaymentPurpose, PaymentStatus, SubscriptionRenewalStatus, SubscriptionStatus } from '@prisma/client';
import { DunningClassificationResult, DunningIntegrityError, DunningLineage } from './platform-dunning.types';

export function classifyDunning(input: DunningLineage, evaluationTime: Date): DunningClassificationResult {
  validateDunningLineage(input);
  const { renewal, payment, subscription } = input;
  if (renewal.status === SubscriptionRenewalStatus.BLOCKED ||
      subscription.status === SubscriptionStatus.CANCELLED || subscription.status === SubscriptionStatus.SUPERSEDED) return result('STOPPED');
  if (renewal.status === SubscriptionRenewalStatus.APPLIED) {
    if (payment.status !== PaymentStatus.CAPTURED) throw new DunningIntegrityError('APPLIED_PAYMENT_NOT_CAPTURED');
    return result('RESOLVED');
  }
  if (payment.status === PaymentStatus.CAPTURED) return result('RECOVERY_PENDING');
  if (renewal.cycleStart.getTime() > evaluationTime.getTime()) return result('NOT_DUE');
  if (payment.status === PaymentStatus.PENDING) return result('OPEN', 'PAYMENT_PENDING');
  if (payment.status === PaymentStatus.AUTHORIZED) return result('OPEN', 'PAYMENT_AUTHORIZED');
  if (payment.status === PaymentStatus.FAILED) return result('OPEN', 'PAYMENT_FAILED');
  throw new DunningIntegrityError('UNSUPPORTED_PAYMENT_STATUS');
}

export function validateDunningLineage({ renewal, payment, subscription }: DunningLineage): void {
  if (renewal.paymentId !== payment.id) throw new DunningIntegrityError('PAYMENT_ID_MISMATCH');
  if (renewal.companyId !== payment.companyId) throw new DunningIntegrityError('PAYMENT_COMPANY_MISMATCH');
  if (renewal.subscriptionId !== payment.subscriptionId) throw new DunningIntegrityError('PAYMENT_SUBSCRIPTION_MISMATCH');
  if (renewal.subscriptionId !== subscription.id || renewal.companyId !== subscription.companyId) throw new DunningIntegrityError('SUBSCRIPTION_OWNERSHIP_MISMATCH');
  if (payment.purpose !== PaymentPurpose.SUBSCRIPTION_RENEWAL) throw new DunningIntegrityError('PAYMENT_PURPOSE_MISMATCH');
  if (subscription.status === SubscriptionStatus.PENDING) throw new DunningIntegrityError('PENDING_SUBSCRIPTION_LINEAGE');
}

function result(classification: DunningClassificationResult['classification'], reason: DunningClassificationResult['reason'] = null): DunningClassificationResult {
  return { active: classification === 'OPEN', classification, reason };
}
