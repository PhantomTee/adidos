/**
 * Message router: receives a WhatsApp message and produces a response.
 * All payment execution goes through here. No payment happens without explicit user confirmation.
 */
import { parseIntent } from '../ai/intentParser';
import { getOrCreateUser, updateUser } from '../services/users';
import { setUserAlias, resolveAlias } from '../services/aliases';
import { ensureWallet, checkUserBalance } from '../services/wallets';
import { registerMerchant, getMerchantByAlias, getMerchantByUserId, getMerchantById, findMerchantsByCategory, findMerchantsByLocation, getMerchantUser } from '../services/merchants';
import {
  createInvoice,
  getInvoiceById,
  getPendingInvoicesForCustomer,
  getMerchantInvoices,
  markInvoicePaid,
  assertInvoicePayable,
} from '../services/invoices';
import {
  createPendingAction,
  getLatestPendingAction,
  confirmPendingAction,
  cancelPendingAction,
} from '../services/pendingActions';
import { recordTransaction, hasTransactedWithMerchant, findRecentDuplicate } from '../services/transactions';
import { checkDailyLimit } from '../services/limits';
import { isCircleConfigured, sendCircleUsdc } from '../services/circle';
import { isArcConfigured, sendArcUsdc } from '../services/arc';
import { getUserTransactions } from '../services/transactions';
import * as T from './templates';
import { normalizeAlias, normalizePhone, isValidUsdcAmount } from '../utils/validation';
import { extractErrorMessage } from '../utils/errors';
import { periodLabel, periodStart } from '../utils/dates';
import { logger } from '../utils/logger';
import { OutboundMessage, User, Merchant } from '../types';

/** Process an inbound WhatsApp message and return the reply + any side-channel messages */
export async function routeMessage(
  rawPhone: string,
  body: string,
): Promise<{ reply: string; extra: OutboundMessage[] }> {
  const phone = normalizePhone(rawPhone);
  const text = body.trim();

  try {
    const user = await getOrCreateUser(phone);
    const intent = await parseIntent(text);

    logger.info('Routing intent', { phone: phone.slice(-4), intent: intent.intent, confidence: intent.confidence });

    // Low confidence fallback
    if (intent.confidence < 0.4 && intent.intent === 'UNKNOWN') {
      return reply(T.unknownMessage());
    }

    switch (intent.intent) {
      case 'START':
        return reply(T.welcomeMessage(user.alias));

      case 'HELP':
        return reply(T.helpMessage());

      case 'GET_PROFILE':
        return reply(T.profileMessage(user.alias, user.phone, user.wallet_address, user.role));

      case 'SET_ALIAS': {
        const rawAlias = intent.alias;
        if (!rawAlias) return reply('What alias would you like? e.g. *set alias yourname*');
        const updated = await setUserAlias(user.id, rawAlias);
        return reply(T.aliasSetMessage(updated.alias!));
      }

      case 'CREATE_WALLET': {
        const result = await ensureWallet(user);
        if (!result.success) return reply(`Could not create wallet: ${result.error}`);
        return reply(T.walletCreatedMessage(result.walletAddress!));
      }

      case 'MY_WALLET': {
        if (!user.wallet_address) return reply(T.noWalletMessage());
        const balResult = await checkUserBalance(user);
        return reply(T.walletInfoMessage(user.wallet_address, balResult.success ? balResult.balanceUsdc : undefined));
      }

      case 'CHECK_BALANCE': {
        if (!user.wallet_address) return reply(T.noWalletMessage());
        const balResult = await checkUserBalance(user);
        if (!balResult.success) return reply(`Balance check failed: ${balResult.error}`);
        return reply(`Balance: *${balResult.balanceUsdc?.toFixed(2)} USDC*`);
      }

      case 'REGISTER_MERCHANT': {
        const { businessName, merchantAlias, category, location } = intent;
        if (!businessName) return reply('Please include your business name. e.g. *register merchant Sam Repair as @samrepair, category phone repair*');
        if (!merchantAlias) return reply('Please include a merchant alias. e.g. *register merchant Sam Repair as @samrepair, category phone repair*');
        if (!category) return reply('Please include a category. e.g. *category phone repair*');

        // Ensure user has a wallet before registering
        if (!user.wallet_address) {
          const walletResult = await ensureWallet(user);
          if (!walletResult.success) return reply(`Could not create wallet: ${walletResult.error}`);
        }

        const freshUser = await getOrCreateUser(phone);
        const merchant = await registerMerchant({
          user: freshUser,
          businessName,
          merchantAlias,
          category,
          location,
        });
        return reply(T.merchantRegisteredMessage(merchant.business_name, merchant.merchant_alias, merchant.category, merchant.wallet_address));
      }

      case 'CREATE_INVOICE': {
        return handleCreateInvoice(user, intent.customerAlias, intent.amount, intent.memo);
      }

      case 'PAY_MERCHANT_DIRECT': {
        // Customer initiates payment to a merchant directly
        const { merchantAlias, amount, memo } = intent;
        if (!merchantAlias) return reply('Which merchant? e.g. *pay @samrepair 1 dollar for delivery*');
        if (!amount) return reply('How much? e.g. *pay @samrepair 1 dollar for delivery*');

        const merchant = await getMerchantByAlias(merchantAlias);
        if (!merchant) return reply(`Merchant @${merchantAlias} not found.`);

        return handleInitiatePayment(user, merchant, amount, memo ?? 'Direct payment');
      }

      case 'PAY_INVOICE': {
        // Customer responds to an invoice with PAY
        const invoices = await getPendingInvoicesForCustomer(user.id);
        if (invoices.length === 0) return reply('You have no pending invoices.');

        const invoice = invoices[0];
        const invoiceMerchant = await getMerchantById(invoice.merchant_id);
        if (!invoiceMerchant) return reply('Could not find merchant for this invoice.');

        return handleInitiatePayment(user, invoiceMerchant, Number(invoice.amount_usdc), invoice.memo ?? undefined, invoice.id);
      }

      case 'CONFIRM_PAYMENT': {
        return handleConfirmPayment(user, phone);
      }

      case 'CANCEL_PENDING': {
        const action = await getLatestPendingAction(user.id);
        if (!action) return reply('Nothing to cancel.');
        await cancelPendingAction(action.id);
        // Leave the invoice as 'pending' so the merchant can resend or the customer can re-initiate.
        // Only reject if the customer explicitly rejects via NO on an invoice notification
        // (handled separately in PAY_INVOICE context). Cancelling the approval step alone
        // should not permanently close the invoice.
        return reply('Cancelled. The invoice is still open if you want to pay later.');
      }

      case 'SALES_SUMMARY': {
        return handleSalesSummary(user, intent.period ?? 'today');
      }

      case 'TRANSACTION_HISTORY': {
        const txs = await getUserTransactions(user.id, 10);
        return reply(T.transactionHistoryMessage(txs));
      }

      case 'FIND_MERCHANTS': {
        const { category, location } = intent;
        if (!category && !location) return reply('What kind of merchants are you looking for? e.g. *find food merchants* or *find merchants in Lagos*');
        let merchants: Awaited<ReturnType<typeof findMerchantsByCategory>>;
        let query: string;
        if (location && !category) {
          merchants = await findMerchantsByLocation(location);
          query = location;
        } else {
          merchants = await findMerchantsByCategory(category!);
          query = category!;
        }
        return reply(T.merchantsFoundMessage(merchants, query));
      }

      case 'GET_MERCHANT_PROFILE': {
        const merchant = await getMerchantByUserId(user.id);
        if (!merchant) return reply('You are not registered as a merchant. Send *register merchant* to get started.');
        return reply(T.merchantProfileMessage(merchant.business_name, merchant.merchant_alias, merchant.category, merchant.wallet_address, merchant.location));
      }

      case 'PENDING_INVOICES': {
        const merchant = await getMerchantByUserId(user.id);
        if (!merchant) return reply('You are not registered as a merchant.');
        const pendingInvs = await getMerchantInvoices(merchant.id, 'pending');
        return reply(T.pendingInvoicesMessage(
          pendingInvs.map(i => ({ amount_usdc: Number(i.amount_usdc), memo: i.memo, created_at: i.created_at, customer_alias: i.customer_alias }))
        ));
      }

      case 'SET_DAILY_LIMIT': {
        const { amount } = intent;
        if (!amount) return reply('How much? e.g. *set limit 50*');
        if (amount < 1 || amount > 500) return reply('Daily limit must be between 1 and 500 USDC.');
        await updateUser(user.id, { daily_limit_usdc: amount });
        return reply(`Daily limit set to *${amount.toFixed(2)} USDC*.`);
      }

      default: {
        return reply(T.unknownMessage());
      }
    }
  } catch (err) {
    const msg = extractErrorMessage(err);
    logger.error('Message routing error', { phone: rawPhone.slice(-4), error: msg });
    return reply(`Something went wrong: ${msg}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function handleCreateInvoice(
  user: User,
  customerAlias: string | undefined,
  amount: number | undefined,
  memo: string | undefined,
): Promise<{ reply: string; extra: OutboundMessage[] }> {
  const merchant = await getMerchantByUserId(user.id);
  if (!merchant) return reply('You are not registered as a merchant. Send *register merchant* first.');
  if (!customerAlias) return reply('Who is this invoice for? e.g. *invoice @thalhat 1 dollar for phone repair*');
  if (!amount) return reply('How much? e.g. *invoice @thalhat 1 dollar for phone repair*');
  if (!isValidUsdcAmount(amount)) return reply(`Invalid amount: ${amount}. Must be between 0.000001 and 10,000 USDC.`);

  const customer = await resolveAlias(customerAlias);
  if (!customer) return reply(`Customer @${customerAlias} is not registered. They need to send *start* to ProxyPay first.`);

  const invoice = await createInvoice({
    merchantId: merchant.id,
    customerUserId: customer.id,
    customerAlias: normalizeAlias(customerAlias),
    amountUsdc: amount,
    memo: memo ?? 'Payment',
  });

  const merchantReply = T.invoiceCreatedMessage(customerAlias, amount, memo);
  const customerNotification = T.invoiceNotificationToCustomer(merchant.merchant_alias, merchant.business_name, amount, memo);

  return {
    reply: merchantReply,
    extra: [{ to: customer.phone, body: customerNotification }],
  };
}

async function handleInitiatePayment(
  user: User,
  merchant: Merchant,
  amountUsdc: number,
  memo: string | undefined,
  invoiceId?: string,
): Promise<{ reply: string; extra: OutboundMessage[] }> {
  if (!user.wallet_address) {
    return reply(T.noWalletMessage());
  }

  if (!isValidUsdcAmount(amountUsdc)) {
    return reply(`Invalid amount: ${amountUsdc}. Must be between 0.000001 and 10,000 USDC.`);
  }

  if (!isPaymentConfigured()) {
    return reply('Payments are not configured yet. I cannot process this payment.');
  }

  // Gather safety warnings (run in parallel — non-blocking)
  const [firstTime, duplicate] = await Promise.all([
    hasTransactedWithMerchant(user.id, merchant.id),
    findRecentDuplicate(user.id, merchant.id, amountUsdc, 5),
  ]);

  const warnings: string[] = [];
  if (!firstTime) {
    warnings.push(`*First time paying @${merchant.merchant_alias}* — you have no prior transactions with this merchant. Confirm the alias is correct.`);
  }
  if (duplicate) {
    const mins = Math.round((Date.now() - new Date(duplicate.created_at).getTime()) / 60000);
    warnings.push(`*Possible duplicate* — you already sent ${amountUsdc.toFixed(2)} USDC to @${merchant.merchant_alias} ${mins} minute${mins === 1 ? '' : 's'} ago.`);
  }

  // Create pending action for final confirmation
  const payload: Record<string, unknown> = {
    merchantId: merchant.id,
    merchantAlias: merchant.merchant_alias,
    merchantWallet: merchant.wallet_address,
    amountUsdc,
    memo: memo ?? 'Payment',
    customerUserId: user.id,
    customerWallet: user.wallet_address,
  };
  if (invoiceId) payload.invoiceId = invoiceId;

  await createPendingAction(user.id, 'PAY_INVOICE', payload);

  return reply(T.paymentConfirmationRequest(
    merchant.merchant_alias,
    merchant.business_name,
    merchant.wallet_address,
    amountUsdc,
    memo,
    warnings,
  ));
}

async function handleConfirmPayment(
  user: User,
  phone: string,
): Promise<{ reply: string; extra: OutboundMessage[] }> {
  const action = await getLatestPendingAction(user.id, 'PAY_INVOICE');
  if (!action) return reply('No pending payment to confirm. The request may have expired (10-minute limit).');

  const payload = action.payload as {
    merchantId: string;
    merchantAlias: string;
    merchantWallet: string;
    amountUsdc: number;
    memo: string;
    customerUserId: string;
    customerWallet: string;
    invoiceId?: string;
  };

  // Safety checks before payment
  if (!isPaymentConfigured()) {
    await cancelPendingAction(action.id);
    return reply('Payments are not configured yet. I cannot mark this invoice as paid.');
  }

  // Check daily limit
  try {
    await checkDailyLimit(user, payload.amountUsdc);
  } catch (err) {
    await cancelPendingAction(action.id);
    return reply(extractErrorMessage(err));
  }

  // Check balance
  const balResult = await checkUserBalance(user);
  if (!balResult.success) {
    await cancelPendingAction(action.id);
    return reply(`Balance check failed: ${balResult.error}. Payment not sent.`);
  }
  if ((balResult.balanceUsdc ?? 0) < payload.amountUsdc) {
    await cancelPendingAction(action.id);
    return reply(T.paymentFailureMessage(`Insufficient balance. You have ${balResult.balanceUsdc?.toFixed(2)} USDC but need ${payload.amountUsdc.toFixed(2)} USDC`));
  }

  // Confirm the action (marks it confirmed so it can't be re-executed)
  await confirmPendingAction(action.id);

  // Idempotency key tied to the pending action ID
  const idempotencyKey = `pay-${action.id}`;

  // Check for duplicate by idempotency — if invoice already paid, don't re-execute
  if (payload.invoiceId) {
    const inv = await getInvoiceById(payload.invoiceId);
    if (!inv) {
      return reply('Invoice not found. It may have been cancelled.');
    }
    if (inv.status === 'paid') {
      return reply(`This invoice was already paid. Tx: ${inv.tx_hash}`);
    }
    try {
      await assertInvoicePayable(inv);
    } catch (err) {
      return reply(extractErrorMessage(err));
    }
  }

  // Execute the real payment
  const paymentResult = await executePayment(
    user,
    payload.merchantWallet,
    payload.amountUsdc,
    idempotencyKey,
  );

  if (!paymentResult.success || !paymentResult.txHash) {
    // Invoice stays unpaid
    if (payload.invoiceId) {
      // Don't reject — leave as pending so user can retry
    }
    return reply(T.paymentFailureMessage(paymentResult.error ?? 'Unknown payment error'));
  }

  // Payment succeeded — record it
  const txHash = paymentResult.txHash;

  if (payload.invoiceId) {
    await markInvoicePaid(payload.invoiceId, txHash);
  }

  const merchant = await getMerchantByAlias(payload.merchantAlias);
  const merchantUser = merchant ? await getMerchantUser(merchant) : null;

  await recordTransaction({
    invoiceId: payload.invoiceId,
    senderUserId: user.id,
    receiverUserId: merchantUser?.id,
    merchantId: payload.merchantId,
    senderWallet: user.wallet_address ?? payload.customerWallet,
    receiverWallet: payload.merchantWallet,
    amountUsdc: payload.amountUsdc,
    memo: payload.memo,
    txHash,
    status: 'confirmed',
  });

  const customerReceipt = T.paymentSuccessToCustomer(payload.merchantAlias, payload.amountUsdc, payload.memo, txHash);
  const merchantReceipt = T.paymentReceivedToMerchant(user.alias ?? user.phone.slice(-4), payload.amountUsdc, payload.memo, txHash);

  const extra: OutboundMessage[] = [];
  if (merchantUser) {
    extra.push({ to: merchantUser.phone, body: merchantReceipt });
  }

  return { reply: customerReceipt, extra };
}

async function handleSalesSummary(
  user: User,
  period: string,
): Promise<{ reply: string; extra: OutboundMessage[] }> {
  const merchant = await getMerchantByUserId(user.id);
  if (!merchant) return reply('You are not registered as a merchant.');

  const since = periodStart(period) ?? undefined;
  const invoices = await getMerchantInvoices(merchant.id, 'paid', since);

  const total = invoices.reduce((sum, inv) => sum + Number(inv.amount_usdc), 0);
  const recent = invoices.slice(0, 5).map((inv) => ({
    customerAlias: inv.customer_alias,
    amountUsdc: Number(inv.amount_usdc),
    memo: inv.memo,
  }));

  return reply(T.salesSummaryMessage(periodLabel(period), total, invoices.length, recent));
}

async function executePayment(
  user: User,
  merchantWallet: string,
  amountUsdc: number,
  idempotencyKey: string,
) {
  const mode = process.env.PAYMENT_EXECUTION_MODE ?? 'circle';

  if (mode === 'circle') {
    if (!user.circle_wallet_id) {
      return { success: false, error: 'Customer does not have a Circle wallet' };
    }
    return sendCircleUsdc(user.circle_wallet_id, merchantWallet, amountUsdc, idempotencyKey);
  }

  // ethers mode
  return sendArcUsdc(merchantWallet, amountUsdc, idempotencyKey);
}

function isPaymentConfigured(): boolean {
  const mode = process.env.PAYMENT_EXECUTION_MODE ?? 'circle';
  if (mode === 'circle') return isCircleConfigured();
  if (mode === 'ethers') return isArcConfigured();
  return false;
}

function reply(text: string): { reply: string; extra: OutboundMessage[] } {
  return { reply: text, extra: [] };
}
