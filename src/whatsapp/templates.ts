import { truncateWallet } from '../utils/validation';

export function welcomeMessage(alias?: string | null): string {
  const greeting = alias ? `Welcome back, @${alias}!` : 'Welcome to ProxyPay Merchant!';
  return `${greeting}

I help informal businesses accept USDC payments through WhatsApp.

Send *help* to see all commands.`;
}

export function helpMessage(): string {
  return `*ProxyPay Merchant — Commands*

*Getting started:*
• start — Register / welcome
• create wallet — Get your USDC wallet
• my wallet — See wallet address
• balance — Check USDC balance
• set alias <name> — Set your @alias
• my profile — View your profile

*Merchant commands:*
• register merchant <name> as @alias, category <type>
• my merchant — Merchant profile
• invoice @customer <amount> for <memo>
• charge @customer <amount> for <memo>
• sales today / this week
• pending invoices

*Customer commands:*
• PAY — Approve the latest invoice
• YES — Confirm a payment
• NO — Reject/cancel
• pay @merchant <amount> for <memo>
• transactions — Payment history

*Merchant discovery:*
• find <category> merchants
• find merchants in <location>

_Payments settle on Arc Testnet in real USDC._`;
}

export function walletCreatedMessage(address: string): string {
  return `*Wallet created!*

Address: \`${address}\`

Fund this wallet with testnet USDC from https://faucet.circle.com
Then you can send and receive payments.`;
}

export function walletInfoMessage(address: string, balanceUsdc?: number): string {
  const bal = balanceUsdc !== undefined ? `\nBalance: ${balanceUsdc.toFixed(2)} USDC` : '';
  return `*Your Arc Wallet*

Address: \`${address}\`${bal}

Arc Explorer: ${process.env.ARC_EXPLORER_BASE_URL ?? 'https://testnet.arcscan.app'}/address/${address}`;
}

export function aliasSetMessage(alias: string): string {
  return `Alias set: *@${alias}*

Others can now send payments to you using this alias.`;
}

export function profileMessage(
  alias: string | null,
  phone: string,
  walletAddress: string | null,
  role: string,
): string {
  const aliasLine = alias ? `Alias: @${alias}` : 'Alias: not set (send: set alias <name>)';
  const walletLine = walletAddress ? `Wallet: ${truncateWallet(walletAddress)}` : 'Wallet: not created yet';
  return `*Your Profile*

${aliasLine}
Phone: ${phone}
${walletLine}
Role: ${role}`;
}

export function merchantRegisteredMessage(
  businessName: string,
  alias: string,
  category: string,
  walletAddress: string,
): string {
  return `*Merchant registered!*

Business: ${businessName}
Alias: @${alias}
Category: ${category}
Wallet: \`${walletAddress}\`

You can now create invoices with:
_invoice @customer <amount> for <memo>_`;
}

export function merchantProfileMessage(
  businessName: string,
  alias: string,
  category: string,
  walletAddress: string,
  location?: string | null,
): string {
  const loc = location ? `\nLocation: ${location}` : '';
  return `*Merchant Profile*

Business: ${businessName}
Alias: @${alias}
Category: ${category}${loc}
Wallet: \`${walletAddress}\``;
}

export function invoiceCreatedMessage(customerAlias: string, amountUsdc: number, memo?: string | null): string {
  return `Invoice created and sent to @${customerAlias}.

Amount: ${amountUsdc.toFixed(2)} USDC
Memo: ${memo ?? 'Payment'}`;
}

export function invoiceNotificationToCustomer(
  merchantAlias: string,
  businessName: string,
  amountUsdc: number,
  memo?: string | null,
): string {
  return `*Invoice from @${merchantAlias}*

Business: ${businessName}
Amount: ${amountUsdc.toFixed(2)} USDC
Memo: ${memo ?? 'Payment'}

Reply *PAY* to approve or *NO* to reject.`;
}

export function paymentConfirmationRequest(
  merchantAlias: string,
  businessName: string,
  walletAddress: string,
  amountUsdc: number,
  memo?: string | null,
): string {
  return `*Confirm payment:*

To: @${merchantAlias}
Business: ${businessName}
Wallet: \`${truncateWallet(walletAddress)}\`
Amount: ${amountUsdc.toFixed(2)} USDC
Memo: ${memo ?? 'Payment'}

Reply *YES* to send or *NO* to cancel.`;
}

export function paymentSuccessToCustomer(
  merchantAlias: string,
  amountUsdc: number,
  memo: string | null | undefined,
  txHash: string,
): string {
  const explorerBase = process.env.ARC_EXPLORER_BASE_URL ?? 'https://testnet.arcscan.app';
  return `*Paid.*

${amountUsdc.toFixed(2)} USDC → @${merchantAlias}
Memo: ${memo ?? 'Payment'}
Tx: \`${txHash}\`
${explorerBase}/tx/${txHash}`;
}

export function paymentReceivedToMerchant(
  customerAlias: string,
  amountUsdc: number,
  memo: string | null | undefined,
  txHash: string,
): string {
  const explorerBase = process.env.ARC_EXPLORER_BASE_URL ?? 'https://testnet.arcscan.app';
  return `*Payment received.*

${amountUsdc.toFixed(2)} USDC from @${customerAlias ?? 'customer'}
Memo: ${memo ?? 'Payment'}
Tx: \`${txHash}\`
${explorerBase}/tx/${txHash}`;
}

export function paymentFailureMessage(reason: string): string {
  return `*Payment failed.*

Reason: ${reason}

The invoice is still unpaid. Send *PAY* to try again.`;
}

export function salesSummaryMessage(
  period: string,
  totalUsdc: number,
  count: number,
  recent: Array<{ customerAlias: string | null; amountUsdc: number; memo: string | null }>,
): string {
  const lines = [`*Sales ${period}*`, '', `Total received: ${totalUsdc.toFixed(2)} USDC`, `Paid invoices: ${count}`];

  if (recent.length > 0) {
    lines.push('', 'Recent:');
    recent.slice(0, 5).forEach((tx, i) => {
      lines.push(`${i + 1}. @${tx.customerAlias ?? 'unknown'} — ${tx.amountUsdc.toFixed(2)} USDC — ${tx.memo ?? 'Payment'}`);
    });
  }

  return lines.join('\n');
}

export function transactionHistoryMessage(
  txs: Array<{
    amount_usdc: number;
    memo: string | null;
    tx_hash: string;
    created_at: string;
    sender_wallet: string;
    receiver_wallet: string;
  }>,
): string {
  if (txs.length === 0) return 'No transactions found.';

  const lines = ['*Transaction History*', ''];
  txs.slice(0, 10).forEach((tx, i) => {
    const date = new Date(tx.created_at).toLocaleDateString();
    lines.push(`${i + 1}. ${Number(tx.amount_usdc).toFixed(2)} USDC — ${tx.memo ?? 'Payment'} — ${date}`);
    lines.push(`   Tx: ${tx.tx_hash.slice(0, 16)}...`);
  });
  return lines.join('\n');
}

export function pendingInvoicesMessage(
  invoices: Array<{ amount_usdc: number; memo: string | null; created_at: string; customer_alias: string | null }>,
): string {
  if (invoices.length === 0) return 'No pending invoices.';

  const lines = ['*Pending Invoices*', ''];
  invoices.slice(0, 10).forEach((inv, i) => {
    const date = new Date(inv.created_at).toLocaleDateString();
    lines.push(`${i + 1}. @${inv.customer_alias ?? 'unknown'} — ${Number(inv.amount_usdc).toFixed(2)} USDC — ${inv.memo ?? 'Payment'} — ${date}`);
  });
  return lines.join('\n');
}

export function merchantsFoundMessage(
  merchants: Array<{ business_name: string; merchant_alias: string; category: string; location: string | null }>,
  query: string,
): string {
  if (merchants.length === 0) return `No merchants found for "${query}".`;

  const lines = [`*Merchants — ${query}*`, ''];
  merchants.forEach((m, i) => {
    const loc = m.location ? ` — ${m.location}` : '';
    lines.push(`${i + 1}. ${m.business_name} (@${m.merchant_alias})${loc}`);
    lines.push(`   Category: ${m.category}`);
  });
  return lines.join('\n');
}

export function noWalletMessage(): string {
  return `You don't have a wallet yet. Send *create wallet* to get started.`;
}

export function notRegisteredMessage(): string {
  return `Send *start* to register and get started.`;
}

export function unknownMessage(): string {
  return `I didn't understand that. Send *help* for a list of commands.`;
}

export function lowConfidenceMessage(intent: string): string {
  return `I'm not sure what you mean. Did you want to: ${intent}?

Send *help* for all commands.`;
}
