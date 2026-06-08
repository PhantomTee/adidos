export type UserRole = 'customer' | 'merchant';
export type InvoiceStatus = 'pending' | 'paid' | 'rejected' | 'expired' | 'cancelled';
export type PendingActionType = 'PAY_INVOICE' | 'CONFIRM_PAYMENT';
export type PendingActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';
export type PaymentMode = 'circle' | 'ethers';

export interface User {
  id: string;
  phone: string;
  alias: string | null;
  wallet_address: string | null;
  circle_wallet_id: string | null;
  daily_limit_usdc: number;
  role: UserRole;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface Merchant {
  id: string;
  user_id: string;
  business_name: string;
  merchant_alias: string;
  category: string;
  location: string | null;
  wallet_address: string;
  circle_wallet_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  merchant_id: string;
  customer_user_id: string | null;
  customer_alias: string | null;
  amount_usdc: number;
  memo: string | null;
  status: InvoiceStatus;
  tx_hash: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  invoice_id: string | null;
  sender_user_id: string | null;
  receiver_user_id: string | null;
  merchant_id: string | null;
  sender_wallet: string;
  receiver_wallet: string;
  amount_usdc: number;
  memo: string | null;
  tx_hash: string;
  status: string;
  chain: string;
  created_at: string;
}

export interface PendingAction {
  id: string;
  user_id: string;
  action_type: PendingActionType;
  payload: Record<string, unknown>;
  status: PendingActionStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface WalletEvent {
  id: string;
  user_id: string;
  event_type: string;
  wallet_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type IntentType =
  | 'START'
  | 'HELP'
  | 'CREATE_WALLET'
  | 'CHECK_BALANCE'
  | 'MY_WALLET'
  | 'SET_ALIAS'
  | 'GET_PROFILE'
  | 'REGISTER_MERCHANT'
  | 'GET_MERCHANT_PROFILE'
  | 'CREATE_INVOICE'
  | 'PAY_MERCHANT_DIRECT'
  | 'PAY_INVOICE'
  | 'CONFIRM_PAYMENT'
  | 'CANCEL_PENDING'
  | 'SALES_SUMMARY'
  | 'TRANSACTION_HISTORY'
  | 'FIND_MERCHANTS'
  | 'UNKNOWN';

export interface ParsedIntent {
  intent: IntentType;
  confidence: number;
  amount?: number;
  currency?: string;
  customerAlias?: string;
  merchantAlias?: string;
  memo?: string;
  businessName?: string;
  category?: string;
  location?: string;
  alias?: string;
  period?: 'today' | 'this_week' | 'this_month' | 'all';
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface BalanceResult {
  success: boolean;
  balanceUsdc?: number;
  error?: string;
}

export interface WalletCreateResult {
  success: boolean;
  walletAddress?: string;
  circleWalletId?: string;
  error?: string;
}

export interface OutboundMessage {
  to: string;
  body: string;
}
