-- ProxyPay Merchant — Supabase Schema
-- Run this in your Supabase SQL editor

create extension if not exists "pgcrypto";

-- Users: any WhatsApp participant (customer or merchant)
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  phone           text unique not null,
  alias           text unique,
  wallet_address  text,
  circle_wallet_id text,
  daily_limit_usdc numeric(18,6) default 25,
  role            text default 'customer' check (role in ('customer', 'merchant')),
  language        text default 'en',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Merchants: extended profile for users who registered as merchants
create table if not exists merchants (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  business_name   text not null,
  merchant_alias  text unique not null,
  category        text not null,
  location        text,
  wallet_address  text not null,
  circle_wallet_id text,
  active          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Invoices: payment requests from merchant to customer
create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid references merchants(id) on delete cascade,
  customer_user_id uuid references users(id) on delete set null,
  customer_alias   text,
  amount_usdc      numeric(18,6) not null,
  memo             text,
  status           text default 'pending' check (status in ('pending', 'paid', 'rejected', 'expired', 'cancelled')),
  tx_hash          text,
  expires_at       timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Transactions: on-chain payment records with real tx hash
create table if not exists transactions (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid references invoices(id) on delete set null,
  sender_user_id   uuid references users(id) on delete set null,
  receiver_user_id uuid references users(id) on delete set null,
  merchant_id      uuid references merchants(id) on delete set null,
  sender_wallet    text not null,
  receiver_wallet  text not null,
  amount_usdc      numeric(18,6) not null,
  memo             text,
  tx_hash          text not null,
  status           text not null,
  chain            text default 'ARC_TESTNET',
  created_at       timestamptz default now()
);

-- Pending actions: awaiting user confirmation (expire after 10 minutes)
create table if not exists pending_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  action_type text not null check (action_type in ('PAY_INVOICE', 'CONFIRM_PAYMENT')),
  payload     jsonb not null,
  status      text default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at  timestamptz not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Wallet events: audit log for wallet lifecycle
create table if not exists wallet_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references users(id) on delete cascade,
  event_type     text not null,
  wallet_address text,
  metadata       jsonb,
  created_at     timestamptz default now()
);

-- Indexes for common query patterns
create index if not exists idx_users_phone on users(phone);
create index if not exists idx_users_alias on users(alias);
create index if not exists idx_merchants_alias on merchants(merchant_alias);
create index if not exists idx_merchants_category on merchants(category);
create index if not exists idx_invoices_customer on invoices(customer_user_id);
create index if not exists idx_invoices_merchant on invoices(merchant_id);
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_transactions_invoice on transactions(invoice_id);
create index if not exists idx_transactions_sender on transactions(sender_user_id);
create index if not exists idx_pending_user on pending_actions(user_id, status);

-- Row Level Security (enable but allow service role full access)
alter table users enable row level security;
alter table merchants enable row level security;
alter table invoices enable row level security;
alter table transactions enable row level security;
alter table pending_actions enable row level security;
alter table wallet_events enable row level security;

-- Allow service role to bypass RLS
create policy "Service role full access" on users for all using (true);
create policy "Service role full access" on merchants for all using (true);
create policy "Service role full access" on invoices for all using (true);
create policy "Service role full access" on transactions for all using (true);
create policy "Service role full access" on pending_actions for all using (true);
create policy "Service role full access" on wallet_events for all using (true);
