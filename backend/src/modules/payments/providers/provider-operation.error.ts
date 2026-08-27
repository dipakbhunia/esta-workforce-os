export type ProviderOperationOutcome = 'DEFINITE_FAILURE' | 'AMBIGUOUS';

export class ProviderOperationError extends Error {
  constructor(
    readonly outcome: ProviderOperationOutcome,
    readonly safeCode: string,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = 'ProviderOperationError';
  }
}
