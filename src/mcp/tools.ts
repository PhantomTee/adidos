import { z } from 'zod';
import { getOrCreateUser, getUserByAlias } from '../services/users';
import { setUserAlias, resolveAlias } from '../services/aliases';
import { ensureWallet, checkUserBalance } from '../services/wallets';
import {
  registerMerchant,
  getMerchantByAlias,
  getMerchantByUserId,
  findMerchantsByCategory,
} from '../services/merchants';
import {
  createInvoice,
  getInvoiceById,
  getMerchantInvoices,
  cancelInvoice,
} from '../services/invoices';
import { getUserTransactions } from '../services/transactions';
import {
  createPendingAction,
  confirmPendingAction,
} from '../services/pendingActions';
import { setDailyLimit } from '../services/limits';
import { sendCircleUsdc } from '../services/circle';
import { sendArcUsdc } from '../services/arc';
import { normalizeAlias } from '../utils/validation';
import { periodStart } from '../utils/dates';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  // args are pre-validated by the schema before execute is called
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any) => Promise<unknown>;
}

export const mcpTools: McpTool[] = [
  {
    name: 'create_or_get_user',
    description: 'Create or fetch a user by phone number',
    inputSchema: z.object({ phone: z.string() }),
    execute: ({ phone }: { phone: string }) => getOrCreateUser(phone),
  },
  {
    name: 'set_user_alias',
    description: 'Set or update the alias for a user',
    inputSchema: z.object({ userId: z.string(), alias: z.string() }),
    execute: ({ userId, alias }: { userId: string; alias: string }) => setUserAlias(userId, alias),
  },
  {
    name: 'get_user_profile',
    description: 'Get user profile by phone or alias',
    inputSchema: z.object({ phone: z.string().optional(), alias: z.string().optional() }),
    execute: ({ phone, alias }: { phone?: string; alias?: string }) => {
      if (phone) return getOrCreateUser(phone);
      if (alias) return getUserByAlias(alias);
      throw new Error('phone or alias required');
    },
  },
  {
    name: 'create_or_link_wallet',
    description: 'Create or return the wallet for a user',
    inputSchema: z.object({ phone: z.string() }),
    execute: async ({ phone }: { phone: string }) => {
      const user = await getOrCreateUser(phone);
      return ensureWallet(user);
    },
  },
  {
    name: 'check_usdc_balance',
    description: 'Check USDC balance for a user',
    inputSchema: z.object({ phone: z.string() }),
    execute: async ({ phone }: { phone: string }) => {
      const user = await getOrCreateUser(phone);
      return checkUserBalance(user);
    },
  },
  {
    name: 'register_merchant',
    description: 'Register a merchant for a user',
    inputSchema: z.object({
      phone: z.string(),
      businessName: z.string(),
      merchantAlias: z.string(),
      category: z.string(),
      location: z.string().optional(),
    }),
    execute: async ({
      phone,
      businessName,
      merchantAlias,
      category,
      location,
    }: {
      phone: string;
      businessName: string;
      merchantAlias: string;
      category: string;
      location?: string;
    }) => {
      const user = await getOrCreateUser(phone);
      return registerMerchant({ user, businessName, merchantAlias, category, location });
    },
  },
  {
    name: 'get_merchant_profile',
    description: 'Get merchant profile by alias or phone',
    inputSchema: z.object({
      merchantAlias: z.string().optional(),
      phone: z.string().optional(),
    }),
    execute: async ({ merchantAlias, phone }: { merchantAlias?: string; phone?: string }) => {
      if (merchantAlias) return getMerchantByAlias(normalizeAlias(merchantAlias));
      if (phone) {
        const user = await getOrCreateUser(phone);
        return getMerchantByUserId(user.id);
      }
      throw new Error('merchantAlias or phone required');
    },
  },
  {
    name: 'find_merchant_by_alias',
    description: 'Find a registered merchant by their alias',
    inputSchema: z.object({ alias: z.string() }),
    execute: ({ alias }: { alias: string }) => getMerchantByAlias(normalizeAlias(alias)),
  },
  {
    name: 'create_invoice',
    description: 'Create an invoice from a merchant to a customer',
    inputSchema: z.object({
      merchantPhone: z.string(),
      customerAlias: z.string(),
      amountUsdc: z.number(),
      memo: z.string().optional(),
    }),
    execute: async ({
      merchantPhone,
      customerAlias,
      amountUsdc,
      memo,
    }: {
      merchantPhone: string;
      customerAlias: string;
      amountUsdc: number;
      memo?: string;
    }) => {
      const merchantUser = await getOrCreateUser(merchantPhone);
      const merchant = await getMerchantByUserId(merchantUser.id);
      if (!merchant) throw new Error('Not registered as merchant');
      const customer = await resolveAlias(customerAlias);
      if (!customer) throw new Error(`Customer @${customerAlias} not found`);
      return createInvoice({
        merchantId: merchant.id,
        customerUserId: customer.id,
        customerAlias: normalizeAlias(customerAlias),
        amountUsdc,
        memo,
      });
    },
  },
  {
    name: 'approve_invoice_payment',
    description: 'Create a pending payment action for an invoice',
    inputSchema: z.object({ userId: z.string(), invoiceId: z.string() }),
    execute: async ({ userId, invoiceId }: { userId: string; invoiceId: string }) => {
      const invoice = await getInvoiceById(invoiceId);
      if (!invoice) throw new Error('Invoice not found');
      return createPendingAction(userId, 'PAY_INVOICE', { invoiceId });
    },
  },
  {
    name: 'create_pending_action',
    description: 'Create a pending action for a user',
    inputSchema: z.object({
      userId: z.string(),
      actionType: z.enum(['PAY_INVOICE', 'CONFIRM_PAYMENT']),
      payload: z.record(z.unknown()),
    }),
    execute: ({
      userId,
      actionType,
      payload,
    }: {
      userId: string;
      actionType: 'PAY_INVOICE' | 'CONFIRM_PAYMENT';
      payload: Record<string, unknown>;
    }) => createPendingAction(userId, actionType, payload),
  },
  {
    name: 'confirm_pending_action',
    description: 'Confirm a pending action by ID',
    inputSchema: z.object({ actionId: z.string() }),
    execute: ({ actionId }: { actionId: string }) => confirmPendingAction(actionId),
  },
  {
    name: 'send_usdc_payment',
    description: 'Execute a real USDC payment on Arc Testnet. Requires prior pending action confirmation.',
    inputSchema: z.object({
      fromCircleWalletId: z.string().optional(),
      toAddress: z.string(),
      amountUsdc: z.number(),
      idempotencyKey: z.string(),
    }),
    execute: ({
      fromCircleWalletId,
      toAddress,
      amountUsdc,
      idempotencyKey,
    }: {
      fromCircleWalletId?: string;
      toAddress: string;
      amountUsdc: number;
      idempotencyKey: string;
    }) => {
      const mode = process.env.PAYMENT_EXECUTION_MODE ?? 'circle';
      if (mode === 'circle') {
        if (!fromCircleWalletId) throw new Error('fromCircleWalletId required for circle mode');
        return sendCircleUsdc(fromCircleWalletId, toAddress, amountUsdc, idempotencyKey);
      }
      return sendArcUsdc(toAddress, amountUsdc, idempotencyKey);
    },
  },
  {
    name: 'get_transaction_status',
    description: 'Get the status of an invoice by ID',
    inputSchema: z.object({ invoiceId: z.string() }),
    execute: ({ invoiceId }: { invoiceId: string }) => getInvoiceById(invoiceId),
  },
  {
    name: 'list_merchant_sales',
    description: 'List paid invoices for a merchant',
    inputSchema: z.object({
      merchantAlias: z.string(),
      period: z.enum(['today', 'this_week', 'this_month', 'all']).optional(),
    }),
    execute: async ({ merchantAlias, period }: { merchantAlias: string; period?: string }) => {
      const merchant = await getMerchantByAlias(normalizeAlias(merchantAlias));
      if (!merchant) throw new Error('Merchant not found');
      const since = period ? periodStart(period) ?? undefined : undefined;
      return getMerchantInvoices(merchant.id, 'paid', since);
    },
  },
  {
    name: 'list_user_transactions',
    description: 'List transactions for a user',
    inputSchema: z.object({ phone: z.string(), limit: z.number().optional() }),
    execute: async ({ phone, limit }: { phone: string; limit?: number }) => {
      const user = await getOrCreateUser(phone);
      return getUserTransactions(user.id, limit ?? 20);
    },
  },
  {
    name: 'cancel_invoice',
    description: 'Cancel a pending invoice',
    inputSchema: z.object({ invoiceId: z.string() }),
    execute: ({ invoiceId }: { invoiceId: string }) => cancelInvoice(invoiceId),
  },
  {
    name: 'resolve_alias',
    description: 'Resolve a user alias to a user record',
    inputSchema: z.object({ alias: z.string() }),
    execute: ({ alias }: { alias: string }) => resolveAlias(alias),
  },
  {
    name: 'set_daily_limit',
    description: 'Set the daily spending limit for a user',
    inputSchema: z.object({ userId: z.string(), limitUsdc: z.number() }),
    execute: ({ userId, limitUsdc }: { userId: string; limitUsdc: number }) =>
      setDailyLimit(userId, limitUsdc),
  },
];
