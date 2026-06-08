export class AppError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class PaymentError extends AppError {
  constructor(message: string) {
    super(message, 'PAYMENT_ERROR');
    this.name = 'PaymentError';
  }
}

export class InsufficientBalanceError extends PaymentError {
  constructor(available: number, required: number) {
    super(`Insufficient balance. Available: ${available.toFixed(2)} USDC, Required: ${required.toFixed(2)} USDC`);
    this.name = 'InsufficientBalanceError';
  }
}

export class DailyLimitExceededError extends PaymentError {
  constructor(limit: number) {
    super(`Daily spending limit of ${limit.toFixed(2)} USDC would be exceeded`);
    this.name = 'DailyLimitExceededError';
  }
}

export class WalletNotFoundError extends AppError {
  constructor() {
    super('Wallet not found. Please create a wallet first.', 'WALLET_NOT_FOUND');
    this.name = 'WalletNotFoundError';
  }
}

export class InvoiceNotFoundError extends AppError {
  constructor() {
    super('Invoice not found or already processed.', 'INVOICE_NOT_FOUND');
    this.name = 'InvoiceNotFoundError';
  }
}

export class PaymentNotConfiguredError extends AppError {
  constructor() {
    super('Payments are not configured yet. I cannot mark this invoice as paid.', 'PAYMENT_NOT_CONFIGURED');
    this.name = 'PaymentNotConfiguredError';
  }
}

export class AliasAlreadyTakenError extends AppError {
  constructor(alias: string) {
    super(`The alias @${alias} is already taken.`, 'ALIAS_TAKEN');
    this.name = 'AliasAlreadyTakenError';
  }
}

export class MerchantAliasAlreadyTakenError extends AppError {
  constructor(alias: string) {
    super(`The merchant alias @${alias} is already taken.`, 'MERCHANT_ALIAS_TAKEN');
    this.name = 'MerchantAliasAlreadyTakenError';
  }
}

export class PendingActionExpiredError extends AppError {
  constructor() {
    super('Your approval request has expired (10-minute limit). Please try again.', 'PENDING_ACTION_EXPIRED');
    this.name = 'PendingActionExpiredError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
