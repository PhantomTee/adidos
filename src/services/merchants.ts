import { getSupabase } from '../db/supabase';
import { Merchant, User } from '../types';
import { normalizeAlias, isValidAlias } from '../utils/validation';
import { MerchantAliasAlreadyTakenError } from '../utils/errors';
import { updateUser, getUserById } from './users';
import { ensureWallet } from './wallets';
import { logger } from '../utils/logger';

export interface RegisterMerchantInput {
  user: User;
  businessName: string;
  merchantAlias: string;
  category: string;
  location?: string;
}

export async function registerMerchant(input: RegisterMerchantInput): Promise<Merchant> {
  const { user, businessName, category, location } = input;
  const merchantAlias = normalizeAlias(input.merchantAlias);

  if (!isValidAlias(merchantAlias)) {
    throw new Error(`Invalid merchant alias "@${merchantAlias}". Use 2–32 lowercase letters, numbers, or underscores.`);
  }

  if (!businessName.trim()) throw new Error('Business name is required');
  if (!category.trim()) throw new Error('Category is required');

  // Check alias uniqueness
  const existing = await getMerchantByAlias(merchantAlias);
  if (existing && existing.user_id !== user.id) {
    throw new MerchantAliasAlreadyTakenError(merchantAlias);
  }
  if (existing && existing.user_id === user.id) {
    return existing; // idempotent re-registration
  }

  // Ensure merchant has a wallet
  let walletAddress = user.wallet_address;
  if (!walletAddress) {
    const walletResult = await ensureWallet(user);
    if (!walletResult.success || !walletResult.walletAddress) {
      throw new Error(walletResult.error ?? 'Could not create wallet for merchant');
    }
    walletAddress = walletResult.walletAddress;
  }

  const db = getSupabase();
  const { data, error } = await db
    .from('merchants')
    .insert({
      user_id: user.id,
      business_name: businessName.trim(),
      merchant_alias: merchantAlias,
      category: category.trim().toLowerCase(),
      location: location?.trim() ?? null,
      wallet_address: walletAddress,
      circle_wallet_id: user.circle_wallet_id,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to register merchant: ${error.message}`);

  // Mark user as merchant
  await updateUser(user.id, { role: 'merchant' });
  logger.info('Merchant registered', { merchantAlias, userId: user.id });
  return data as Merchant;
}

export async function getMerchantByAlias(alias: string): Promise<Merchant | null> {
  const { data } = await getSupabase()
    .from('merchants')
    .select('*')
    .eq('merchant_alias', normalizeAlias(alias))
    .eq('active', true)
    .single();
  return (data as Merchant) ?? null;
}

export async function getMerchantByUserId(userId: string): Promise<Merchant | null> {
  const { data } = await getSupabase()
    .from('merchants')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .single();
  return (data as Merchant) ?? null;
}

export async function getMerchantById(id: string): Promise<Merchant | null> {
  const { data } = await getSupabase()
    .from('merchants')
    .select('*')
    .eq('id', id)
    .single();
  return (data as Merchant) ?? null;
}

export async function findMerchantsByCategory(category: string): Promise<Merchant[]> {
  const { data } = await getSupabase()
    .from('merchants')
    .select('*')
    .ilike('category', `%${category}%`)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(10);
  return (data as Merchant[]) ?? [];
}

export async function getMerchantUser(merchant: Merchant): Promise<User | null> {
  return getUserById(merchant.user_id);
}
