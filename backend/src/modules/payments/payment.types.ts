import type {
  PaymentAttemptOperation,
  PaymentAttemptStatus,
  PaymentProviderEventStatus,
  PaymentProviderMode,
  PaymentProviderOrderStatus,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
} from '@prisma/client';

export interface MoneySnapshot {
  amountMinor: bigint;
  currency: string;
}

export interface SerializedMoneySnapshot {
  amountMinor: string;
  currency: string;
}

export interface PaymentStateSnapshot {
  status: PaymentStatus;
  providerStatus: string | null;
  authorizedAt: Date | null;
  capturedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  safeFailureMessage: string | null;
  capturedProviderPaymentId: string | null;
}

export type PaymentDomainEnums = {
  purpose: PaymentPurpose;
  status: PaymentStatus;
  provider: PaymentProviderType;
  providerMode: PaymentProviderMode;
  orderStatus: PaymentProviderOrderStatus;
  attemptOperation: PaymentAttemptOperation;
  attemptStatus: PaymentAttemptStatus;
  eventStatus: PaymentProviderEventStatus;
};
