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

/** Returns true if the sender has ever successfully paid this merchant before */
export async function hasTransactedWithMerchant(senderUserId: string, merchantId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('transactions')
    .select('id')
    .eq('sender_user_id', senderUserId)
    .eq('merchant_id', merchantId)
    .eq('status', 'confirmed')
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/** Returns a recent confirmed transaction if the same amount was sent to the same merchant within windowMinutes */
export async function findRecentDuplicate(
  senderUserId: string,
  merchantId: string,
  amountUsdc: number,
  windowMinutes = 5,
): Promise<Transaction | null> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { data } = await getSupabase()
    .from('transactions')
    .select('*')
    .eq('sender_user_id', senderUserId)
    .eq('merchant_id', merchantId)
    .eq('status', 'confirmed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!Array.isArray(data) || data.length === 0) return null;
  const tx = data[0] as Transaction;
  // Fuzzy match — same amount within 0.000001 USDC tolerance
  if (Math.abs(Number(tx.amount_usdc) - amountUsdc) < 0.000001) return tx;
  return null;
}
