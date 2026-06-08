import { ethers } from 'ethers';

// Arc USDC ERC-20 uses 6 decimals
export const USDC_DECIMALS = 6;

// Arc native gas token (also USDC) uses 18 decimals
export const USDC_NATIVE_DECIMALS = 18;

/** Convert a human-readable USDC amount (e.g. 1.5) to the ERC-20 smallest unit (1500000) */
export function usdcToUnits(amount: number): bigint {
  return ethers.parseUnits(amount.toFixed(6), USDC_DECIMALS);
}

/** Convert ERC-20 smallest units back to human-readable USDC */
export function unitsToUsdc(units: bigint): number {
  return parseFloat(ethers.formatUnits(units, USDC_DECIMALS));
}

/** Format a USDC amount for display */
export function formatUsdc(amount: number): string {
  return `${amount.toFixed(2)} USDC`;
}

/** Clamp and round a USDC amount to 6 decimal places */
export function normalizeUsdc(amount: number): number {
  if (amount < 0) throw new Error('Amount cannot be negative');
  return Math.round(amount * 1_000_000) / 1_000_000;
}

/** Convert Circle API amount string (e.g. "1.000000") to number */
export function circleAmountToUsdc(circleAmount: string): number {
  return parseFloat(circleAmount);
}

/** Convert number to Circle API amount string */
export function usdcToCircleAmount(amount: number): string {
  return amount.toFixed(6);
}
