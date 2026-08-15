-- =========================================================
-- MESSENGER PREMIUM + TIME CAPSULE
-- =========================================================
-- Run this migration in Supabase SQL Editor.
-- It is intentionally additive: existing tables and messages are preserved.

create table if not exists public.user_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'past_due', 'cancelled')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_capsule_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  unlock_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists time_capsule_receiver_unlock_idx
  on public.time_capsule_messages(receiver_id, unlock_at);

create index if not exists time_capsule_sender_idx
  on public.time_capsule_messages(sender_id, created_at desc);

alter table public.user_subscriptions enable row level security;
alter table public.time_capsule_messages enable row level security;

-- Users may read only their own subscription.
drop policy if exists "users can read own subscription" on public.user_subscriptions;
create policy "users can read own subscription"
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

-- Time-capsule messages are visible only to sender or receiver.
drop policy if exists "capsules are visible to participants" on public.time_capsule_messages;
create policy "capsules are visible to participants"
  on public.time_capsule_messages
  for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Authenticated users may create a capsule only as themselves.
drop policy if exists "users can create own capsules" on public.time_capsule_messages;
create policy "users can create own capsules"
  on public.time_capsule_messages
  for insert
  with check (auth.uid() = sender_id);

-- The application/backend can later mark a capsule as delivered.
drop policy if exists "participants can mark capsule delivered" on public.time_capsule_messages;
create policy "participants can mark capsule delivered"
  on public.time_capsule_messages
  for update
  using (auth.uid() = sender_id or auth.uid() = receiver_id)
  with check (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Default subscription row for every new profile can be created by the app.
-- Premium must never be granted by the client. Stripe/webhook/server-side code
-- should update plan/status after payment confirmation.

comment on table public.time_capsule_messages is
  'Unique Messenger feature: messages that unlock for the recipient at a chosen future time.';

comment on table public.user_subscriptions is
  'Server-controlled subscription state. Client must never be trusted to grant premium.';
