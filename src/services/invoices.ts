import { getSupabase } from '../db/supabase';
import { Invoice, InvoiceStatus } from '../types';
import { addHours } from '../utils/dates';
import { logger } from '../utils/logger';

export interface CreateInvoiceInput {
  merchantId: string;
  customerUserId?: string;
  customerAlias?: string;
  amountUsdc: number;
  memo?: string;
  expiresInHours?: number;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const { merchantId, customerUserId, customerAlias, amountUsdc, memo, expiresInHours = 24 } = input;
  const db = getSupabase();

  const { data, error } = await db
    .from('invoices')
    .insert({
      merchant_id: merchantId,
      customer_user_id: customerUserId ?? null,
      customer_alias: customerAlias ?? null,
      amount_usdc: amountUsdc,
      memo: memo ?? null,
      status: 'pending',
      expires_at: addHours(expiresInHours),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create invoice: ${error.message}`);
  logger.info('Invoice created', { id: data.id, merchantId, amountUsdc });
  return data as Invoice;
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const { data } = await getSupabase()
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();
  return (data as Invoice) ?? null;
}

export async function getPendingInvoicesForCustomer(customerUserId: string): Promise<Invoice[]> {
  const { data } = await getSupabase()
    .from('invoices')
    .select('*')
    .eq('customer_user_id', customerUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as Invoice[]) ?? [];
}

export async function getMerchantInvoices(
  merchantId: string,
  status?: InvoiceStatus,
  since?: string,
): Promise<Invoice[]> {
  let query = getSupabase()
    .from('invoices')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (since) query = query.gte('created_at', since);

  const { data } = await query.limit(50);
  return (data as Invoice[]) ?? [];
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  extra?: Partial<Invoice>,
): Promise<Invoice> {
  const updates: Partial<Invoice> & { updated_at: string } = {
    status,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  const { data, error } = await getSupabase()
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update invoice: ${error.message}`);
  return data as Invoice;
}

export async function markInvoicePaid(id: string, txHash: string): Promise<Invoice> {
  return updateInvoiceStatus(id, 'paid', {
    tx_hash: txHash,
    paid_at: new Date().toISOString(),
  });
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  return updateInvoiceStatus(id, 'cancelled');
}

export async function rejectInvoice(id: string): Promise<Invoice> {
  return updateInvoiceStatus(id, 'rejected');
}

/** Check if an invoice is still actionable (pending and not expired) */
export async function assertInvoicePayable(invoice: Invoice): Promise<void> {
  if (invoice.status !== 'pending') {
    throw new Error(`Invoice is already ${invoice.status}`);
  }
  if (invoice.expires_at && new Date(invoice.expires_at) < new Date()) {
    await updateInvoiceStatus(invoice.id, 'expired');
    throw new Error('Invoice has expired');
  }
}
