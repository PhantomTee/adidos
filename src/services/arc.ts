/**
 * Arc Testnet payment execution via ethers.js.
 * Used when PAYMENT_EXECUTION_MODE=ethers.
 *
 * Arc uses USDC as its native gas token (18 decimals for gas).
 * The USDC ERC-20 contract at ARC_USDC_CONTRACT_ADDRESS uses 6 decimals.
 * We call transfer() on the ERC-20 interface, so we use 6 decimals for amounts.
 */
import { ethers } from 'ethers';
import { usdcToUnits, unitsToUsdc } from '../utils/money';
import { PaymentResult, BalanceResult } from '../types';
import { logger } from '../utils/logger';

// Minimal ERC-20 ABI for balance and transfer
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.ARC_RPC_URL;
  const chainId = process.env.ARC_CHAIN_ID;
  if (!rpcUrl) throw new Error('ARC_RPC_URL is not set');
  return new ethers.JsonRpcProvider(rpcUrl, chainId ? parseInt(chainId, 10) : undefined);
}

function getUsdcContract(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  const address = process.env.ARC_USDC_CONTRACT_ADDRESS;
  if (!address) throw new Error('ARC_USDC_CONTRACT_ADDRESS is not set');
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

/** Check the USDC ERC-20 balance for a wallet address on Arc Testnet */
export async function checkArcBalance(walletAddress: string): Promise<BalanceResult> {
  try {
    const provider = getProvider();
    const usdc = getUsdcContract(provider);
    const raw: bigint = await usdc.balanceOf(walletAddress);
    const balanceUsdc = unitsToUsdc(raw);
    logger.info('Arc balance checked', { walletAddress, balanceUsdc });
    return { success: true, balanceUsdc };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Arc balance check failed', { walletAddress, error: msg });
    return { success: false, error: msg };
  }
}

/**
 * Send USDC on Arc Testnet using the server wallet.
 * HACKATHON MODE: the server wallet pays on behalf of the user.
 * Production should use Circle developer-controlled wallets (see circle.ts).
 */
export async function sendArcUsdc(
  toAddress: string,
  amountUsdc: number,
  idempotencyKey: string,
): Promise<PaymentResult> {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    return {
      success: false,
      error: 'SERVER_WALLET_PRIVATE_KEY is not set. Payments are not configured.',
    };
  }

  try {
    const provider = getProvider();
    const signer = new ethers.Wallet(privateKey, provider);
    const usdc = getUsdcContract(signer);

    // Check server wallet has enough balance
    const rawBalance: bigint = await usdc.balanceOf(signer.address);
    const balance = unitsToUsdc(rawBalance);
    if (balance < amountUsdc) {
      return {
        success: false,
        error: `Server wallet balance (${balance.toFixed(2)} USDC) is insufficient for ${amountUsdc.toFixed(2)} USDC`,
      };
    }

    const units = usdcToUnits(amountUsdc);
    logger.info('Submitting Arc USDC transfer', {
      from: signer.address,
      to: toAddress,
      amountUsdc,
      idempotencyKey,
    });

    const tx = await usdc.transfer(toAddress, units);
    logger.info('Arc tx submitted', { txHash: tx.hash });

    // Wait for one confirmation to validate the tx was mined
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) {
      return { success: false, error: 'Transaction was reverted on-chain' };
    }

    logger.info('Arc tx confirmed', { txHash: receipt.hash });
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Arc USDC transfer failed', { error: msg });
    return { success: false, error: msg };
  }
}

/** Check if Arc/ethers payment execution is configured */
export function isArcConfigured(): boolean {
  return !!(process.env.ARC_RPC_URL && process.env.ARC_USDC_CONTRACT_ADDRESS && process.env.SERVER_WALLET_PRIVATE_KEY);
}
