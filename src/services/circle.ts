/**
 * Circle Developer-Controlled Wallets service.
 * Used when PAYMENT_EXECUTION_MODE=circle.
 *
 * Arc Testnet blockchain identifier in Circle SDK: "ARC-TESTNET"
 * Amount field in transfer API is "amount" (array), not "amounts".
 * Balance API is getWalletTokenBalance (singular).
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { v4 as uuidv4 } from 'uuid';
import { PaymentResult, BalanceResult, WalletCreateResult } from '../types';
import { logger } from '../utils/logger';

type CircleClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

let _circleClient: CircleClient | null = null;

function getCircleClient(): CircleClient {
  if (_circleClient) return _circleClient;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set for circle payment mode');
  }
  _circleClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _circleClient;
}

/** Check if Circle payment execution is configured */
export function isCircleConfigured(): boolean {
  return !!(
    process.env.CIRCLE_API_KEY &&
    process.env.CIRCLE_ENTITY_SECRET &&
    process.env.CIRCLE_WALLET_SET_ID &&
    process.env.CIRCLE_ARC_USDC_TOKEN_ID
  );
}

/**
 * Create a new Circle developer-controlled wallet for a user on Arc Testnet.
 */
export async function createCircleWallet(userId: string): Promise<WalletCreateResult> {
  try {
    const client = getCircleClient();
    const walletSetId = process.env.CIRCLE_WALLET_SET_ID!;
    const idempotencyKey = `wallet-${userId}-${uuidv4()}`;

    // Use "as any" for the blockchain string — Circle SDK Blockchain enum may lag behind
    // supported chains. ARC-TESTNET is a valid blockchain in Circle's API.
    const resp = await client.createWallets({
      walletSetId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blockchains: ['ARC-TESTNET'] as any,
      accountType: 'EOA',
      count: 1,
      idempotencyKey,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallets = (resp as any).data?.wallets ?? (resp as any).data ?? [];
    const wallet = Array.isArray(wallets) ? wallets[0] : wallets;

    if (!wallet) return { success: false, error: 'Circle returned no wallets' };

    const address: string | undefined = wallet.address;
    const circleWalletId: string | undefined = wallet.id;

    if (!address || !circleWalletId) {
      return { success: false, error: 'Circle wallet missing address or ID' };
    }

    logger.info('Circle wallet created', { userId, address, circleWalletId });
    return { success: true, walletAddress: address, circleWalletId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Circle wallet creation failed', { userId, error: msg });
    return { success: false, error: msg };
  }
}

/** Check USDC balance for a Circle wallet on Arc Testnet */
export async function checkCircleBalance(circleWalletId: string): Promise<BalanceResult> {
  try {
    const client = getCircleClient();
    const tokenId = process.env.CIRCLE_ARC_USDC_TOKEN_ID!;

    // Circle SDK uses { id } not { walletId } for getWalletTokenBalance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (client as any).getWalletTokenBalance({ id: circleWalletId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const balances: any[] = resp?.data?.tokenBalances ?? resp?.data ?? [];

    const usdcBalance = Array.isArray(balances)
      ? balances.find((b) => b?.token?.id === tokenId || b?.tokenId === tokenId)
      : null;
    const balanceUsdc = usdcBalance ? parseFloat(usdcBalance.amount ?? '0') : 0;

    logger.info('Circle balance checked', { circleWalletId, balanceUsdc });
    return { success: true, balanceUsdc };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Circle balance check failed', { circleWalletId, error: msg });
    return { success: false, error: msg };
  }
}

/**
 * Execute a USDC transfer via Circle developer-controlled wallets.
 * Polls for confirmation and returns the real on-chain tx hash.
 * Invoice is NOT marked paid until a real txHash is returned.
 */
export async function sendCircleUsdc(
  fromCircleWalletId: string,
  toAddress: string,
  amountUsdc: number,
  idempotencyKey: string,
): Promise<PaymentResult> {
  try {
    const client = getCircleClient();
    const tokenId = process.env.CIRCLE_ARC_USDC_TOKEN_ID!;

    logger.info('Initiating Circle USDC transfer', {
      fromCircleWalletId,
      toAddress,
      amountUsdc,
      idempotencyKey,
    });

    const createResp = await client.createTransaction({
      walletId: fromCircleWalletId,
      tokenId,
      destinationAddress: toAddress,
      // Circle API uses "amount" (array) not "amounts"
      amount: [amountUsdc.toFixed(6)],
      idempotencyKey,
      fee: {
        type: 'level',
        config: { feeLevel: 'MEDIUM' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txId: string | undefined = (createResp as any).data?.id;
    if (!txId) {
      return { success: false, error: 'Circle did not return a transaction ID' };
    }

    logger.info('Circle tx submitted', { circleTransactionId: txId });

    // Poll for confirmation (up to 90 seconds)
    const txHash = await pollCircleTxHash(client, txId, 90_000);
    if (!txHash) {
      return {
        success: false,
        error: 'Circle transaction did not confirm within timeout. Check Circle dashboard for status.',
      };
    }

    logger.info('Circle tx confirmed', { circleTransactionId: txId, txHash });
    return { success: true, txHash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Circle USDC transfer failed', { error: msg });
    return { success: false, error: msg };
  }
}

async function pollCircleTxHash(
  client: CircleClient,
  txId: string,
  timeoutMs: number,
): Promise<string | null> {
  const start = Date.now();
  const interval = 3_000;

  while (Date.now() - start < timeoutMs) {
    await sleep(interval);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await (client as any).getTransaction({ id: txId });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx: any = resp?.data;
      if (!tx) continue;

      const state: string = tx.state ?? '';
      logger.debug('Circle tx poll', { txId, state });

      if (state === 'CONFIRMED' || state === 'COMPLETE') {
        const txHash: string = tx.txHash ?? tx.transactionHash ?? '';
        if (txHash) return txHash;
        // CONFIRMED but no txHash yet — keep polling (transient state)
        logger.debug('Circle tx confirmed but txHash not yet populated', { txId });
        continue;
      }
      if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
        logger.error('Circle tx failed', { txId, state, errorReason: tx.errorReason });
        return null;
      }
    } catch (err) {
      logger.warn('Circle tx poll error', { txId, error: String(err) });
    }
  }

  logger.error('Circle tx poll timed out', { txId });
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
