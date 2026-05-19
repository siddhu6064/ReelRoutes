export function isRetryableTransactionSaveError(error: unknown): boolean;
export function getTransactionSaveErrorMessage(error: unknown, isEdit?: boolean): string;
export function canSubmitTransaction(input: {
  isSubmitting: boolean;
  amount: string;
  hasActiveProfile: boolean;
}): boolean;
