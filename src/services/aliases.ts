import { getSupabase } from '../db/supabase';
import { User } from '../types';
import { normalizeAlias, isValidAlias } from '../utils/validation';
import { AliasAlreadyTakenError } from '../utils/errors';
import { updateUser, getUserByAlias } from './users';

export async function setUserAlias(userId: string, rawAlias: string): Promise<User> {
  const alias = normalizeAlias(rawAlias);

  if (!isValidAlias(alias)) {
    throw new Error(`Invalid alias "@${alias}". Use 2–32 lowercase letters, numbers, or underscores.`);
  }

  const existing = await getUserByAlias(alias);
  if (existing && existing.id !== userId) {
    throw new AliasAlreadyTakenError(alias);
  }

  return updateUser(userId, { alias });
}

export async function resolveAlias(raw: string): Promise<User | null> {
  const alias = normalizeAlias(raw);
  return getUserByAlias(alias);
}

/** Resolve a user or merchant by alias — returns the user record */
export async function resolveToUser(raw: string): Promise<User | null> {
  const alias = normalizeAlias(raw);

  // Check user alias first
  const user = await getUserByAlias(alias);
  if (user) return user;

  // Fall back to merchant alias -> get their user
  const { data: merchant } = await getSupabase()
    .from('merchants')
    .select('user_id')
    .eq('merchant_alias', alias)
    .single();
  if (!merchant) return null;

  const { data: mUser } = await getSupabase()
    .from('users')
    .select('*')
    .eq('id', merchant.user_id)
    .single();
  return (mUser as User) ?? null;
}
