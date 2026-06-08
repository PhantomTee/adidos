import { getSupabase } from '../db/supabase';
import { Transaction } from '../types';

export interface RecordTransactionInput {
  invoiceId?: string;
  senderUserId?: string;
  receiverUserId?: string;
  merchantId?: string;
  senderWallet: string;
  receiverWallet: string;
  amountUsdc: number;
  memo?: string;
  txHash: string;
  status: string;
}

export async function recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .insert({
      invoice_id: input.invoiceId ?? null,
      sender_user_id: input.senderUserId ?? null,
      receiver_user_id: input.receiverUserId ?? null,
      merchant_id: input.merchantId ?? null,
      sender_wallet: input.senderWallet,
      receiver_wallet: input.receiverWallet,
      amount_usdc: input.amountUsdc,
      memo: input.memo ?? null,
      tx_hash: input.txHash,
      status: input.status,
      chain: 'ARC_TESTNET',
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to record transaction: ${error.message}`);
  return data as Transaction;
}

export async function getUserTransactions(userId: string, limit = 20): Promise<Transaction[]> {
  const { data } = await getSupabase()
    .from('transactions')
    .select('*')
    .or(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as Transaction[]) ?? [];
}

export async function getTransactionByHash(txHash: string): Promise<Transaction | null> {
  const { data } = await getSupabase()
    .from('transactions')
    .select('*')
    .eq('tx_hash', txHash)
    .single();
  return (data as Transaction) ?? null;
}
