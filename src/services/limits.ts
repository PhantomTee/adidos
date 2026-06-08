import { getSupabase } from '../db/supabase';
import { User } from '../types';
import { startOfToday } from '../utils/dates';
import { DailyLimitExceededError } from '../utils/errors';

export async function checkDailyLimit(user: User, amountUsdc: number): Promise<void> {
  const todayStart = startOfToday();

  const { data } = await getSupabase()
    .from('transactions')
    .select('amount_usdc')
    .eq('sender_user_id', user.id)
    .gte('created_at', todayStart);

  const spentToday = (data ?? []).reduce(
    (sum: number, tx: { amount_usdc: number }) => sum + Number(tx.amount_usdc),
    0,
  );

  if (spentToday + amountUsdc > user.daily_limit_usdc) {
    throw new DailyLimitExceededError(user.daily_limit_usdc);
  }
}

export async function setDailyLimit(userId: string, limitUsdc: number): Promise<void> {
  if (limitUsdc <= 0 || limitUsdc > 10_000) {
    throw new Error('Daily limit must be between 0.01 and 10,000 USDC');
  }
  const { error } = await getSupabase()
    .from('users')
    .update({ daily_limit_usdc: limitUsdc, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(`Failed to update limit: ${error.message}`);
}

export async function getDailySpent(userId: string): Promise<number> {
  const todayStart = startOfToday();
  const { data } = await getSupabase()
    .from('transactions')
    .select('amount_usdc')
    .eq('sender_user_id', userId)
    .gte('created_at', todayStart);

  return (data ?? []).reduce(
    (sum: number, tx: { amount_usdc: number }) => sum + Number(tx.amount_usdc),
    0,
  );
}
