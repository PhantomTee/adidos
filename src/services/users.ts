import { getSupabase } from '../db/supabase';
import { User } from '../types';
import { normalizePhone } from '../utils/validation';
import { logger } from '../utils/logger';

export async function getOrCreateUser(rawPhone: string): Promise<User> {
  const phone = normalizePhone(rawPhone);
  const db = getSupabase();

  const { data: existing } = await db
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();

  if (existing) return existing as User;

  const { data, error } = await db
    .from('users')
    .insert({ phone })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  logger.info('New user created', { phone });
  return data as User;
}

export async function getUserByPhone(rawPhone: string): Promise<User | null> {
  const phone = normalizePhone(rawPhone);
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();
  return (data as User) ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  return (data as User) ?? null;
}

export async function getUserByAlias(alias: string): Promise<User | null> {
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .eq('alias', alias.toLowerCase())
    .single();
  return (data as User) ?? null;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const { data, error } = await getSupabase()
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update user: ${error.message}`);
  return data as User;
}
