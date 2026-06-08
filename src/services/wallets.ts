import { User, WalletCreateResult, BalanceResult } from '../types';
import { updateUser } from './users';
import { getSupabase } from '../db/supabase';
import { createCircleWallet, checkCircleBalance, isCircleConfigured } from './circle';
import { checkArcBalance, isArcConfigured } from './arc';
import { logger } from '../utils/logger';

type PaymentMode = 'circle' | 'ethers';

function paymentMode(): PaymentMode {
  const mode = process.env.PAYMENT_EXECUTION_MODE ?? 'circle';
  return mode === 'ethers' ? 'ethers' : 'circle';
}

/** Create or return the wallet for a user */
export async function ensureWallet(user: User): Promise<WalletCreateResult> {
  // Already has a wallet
  if (user.wallet_address) {
    return { success: true, walletAddress: user.wallet_address, circleWalletId: user.circle_wallet_id ?? undefined };
  }

  const mode = paymentMode();

  if (mode === 'circle') {
    if (!isCircleConfigured()) {
      return { success: false, error: 'Circle payment is not configured. Check CIRCLE_* env vars.' };
    }
    const result = await createCircleWallet(user.id);
    if (!result.success || !result.walletAddress) return result;

    await updateUser(user.id, {
      wallet_address: result.walletAddress,
      circle_wallet_id: result.circleWalletId,
    });

    // Audit log
    await getSupabase().from('wallet_events').insert({
      user_id: user.id,
      event_type: 'CIRCLE_WALLET_CREATED',
      wallet_address: result.walletAddress,
      metadata: { circleWalletId: result.circleWalletId },
    });

    logger.info('Wallet assigned to user', { userId: user.id, address: result.walletAddress });
    return result;
  }

  // ethers mode — server wallet acts as proxy; record the server wallet address
  const serverKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!serverKey || !isArcConfigured()) {
    return { success: false, error: 'Arc/ethers payment is not configured. Check ARC_* and SERVER_WALLET_PRIVATE_KEY.' };
  }

  // For ethers mode in hackathon: each user gets the server wallet address
  // (simplified — production would use per-user keys or Circle)
  const { ethers } = await import('ethers');
  const wallet = new ethers.Wallet(serverKey);
  const walletAddress = wallet.address;

  await updateUser(user.id, { wallet_address: walletAddress });
  await getSupabase().from('wallet_events').insert({
    user_id: user.id,
    event_type: 'ETHERS_WALLET_ASSIGNED',
    wallet_address: walletAddress,
    metadata: { mode: 'server_proxy' },
  });

  return { success: true, walletAddress };
}

/** Check USDC balance for a user */
export async function checkUserBalance(user: User): Promise<BalanceResult> {
  const mode = paymentMode();

  if (mode === 'circle') {
    if (!user.circle_wallet_id) {
      return { success: false, error: 'No Circle wallet found. Create a wallet first.' };
    }
    return checkCircleBalance(user.circle_wallet_id);
  }

  if (!user.wallet_address) {
    return { success: false, error: 'No wallet found. Create a wallet first.' };
  }
  return checkArcBalance(user.wallet_address);
}
