import { getSupabase } from '../db/supabase';
import { PendingAction, PendingActionType } from '../types';
import { addMinutes, isExpired } from '../utils/dates';
import { PendingActionExpiredError } from '../utils/errors';
import { logger } from '../utils/logger';

const EXPIRY_MINUTES = 10;

export async function createPendingAction(
  userId: string,
  actionType: PendingActionType,
  payload: Record<string, unknown>,
): Promise<PendingAction> {
  // Cancel any existing pending actions of the same type for this user
  await getSupabase()
    .from('pending_actions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .eq('status', 'pending');

  const { data, error } = await getSupabase()
    .from('pending_actions')
    .insert({
      user_id: userId,
      action_type: actionType,
      payload,
      status: 'pending',
      expires_at: addMinutes(EXPIRY_MINUTES),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create pending action: ${error.message}`);
  logger.info('Pending action created', { userId, actionType, id: data.id });
  return data as PendingAction;
}

export async function getLatestPendingAction(
  userId: string,
  actionType?: PendingActionType,
): Promise<PendingAction | null> {
  let query = getSupabase()
    .from('pending_actions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);

  if (actionType) query = query.eq('action_type', actionType);

  const { data } = await query.single();
  if (!data) return null;

  const action = data as PendingAction;

  // Auto-expire if past expiry
  if (isExpired(action.expires_at)) {
    await expirePendingAction(action.id);
    return null;
  }

  return action;
}

export async function confirmPendingAction(id: string): Promise<PendingAction> {
  const { data: action } = await getSupabase()
    .from('pending_actions')
    .select('*')
    .eq('id', id)
    .single();

  if (!action) throw new Error('Pending action not found');
  const typed = action as PendingAction;

  if (typed.status !== 'pending') throw new Error(`Action is already ${typed.status}`);
  if (isExpired(typed.expires_at)) {
    await expirePendingAction(id);
    throw new PendingActionExpiredError();
  }

  const { data, error } = await getSupabase()
    .from('pending_actions')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to confirm action: ${error.message}`);
  return data as PendingAction;
}

export async function cancelPendingAction(id: string): Promise<void> {
  await getSupabase()
    .from('pending_actions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
}

async function expirePendingAction(id: string): Promise<void> {
  await getSupabase()
    .from('pending_actions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function cancelAllPendingForUser(userId: string): Promise<void> {
  await getSupabase()
    .from('pending_actions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending');
}
