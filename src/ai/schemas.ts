import { z } from 'zod';

export const IntentSchema = z.object({
  intent: z.enum([
    'START',
    'HELP',
    'CREATE_WALLET',
    'CHECK_BALANCE',
    'MY_WALLET',
    'SET_ALIAS',
    'GET_PROFILE',
    'REGISTER_MERCHANT',
    'GET_MERCHANT_PROFILE',
    'CREATE_INVOICE',
    'PAY_MERCHANT_DIRECT',
    'PAY_INVOICE',
    'CONFIRM_PAYMENT',
    'CANCEL_PENDING',
    'SALES_SUMMARY',
    'TRANSACTION_HISTORY',
    'FIND_MERCHANTS',
    'PENDING_INVOICES',
    'SET_DAILY_LIMIT',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  amount: z.number().optional(),
  currency: z.string().optional(),
  customerAlias: z.string().optional(),
  merchantAlias: z.string().optional(),
  memo: z.string().optional(),
  businessName: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  alias: z.string().optional(),
  period: z.enum(['today', 'this_week', 'this_month', 'all']).optional(),
});

export type IntentResult = z.infer<typeof IntentSchema>;
