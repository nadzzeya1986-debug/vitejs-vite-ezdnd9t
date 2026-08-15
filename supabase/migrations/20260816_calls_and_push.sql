-- Pulse pre-release: realtime calls + push subscriptions
create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','declined','ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('offer','answer','ice-candidate','hangup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists call_sessions_callee_idx on public.call_sessions(callee_id, created_at desc);
create index if not exists call_sessions_caller_idx on public.call_sessions(caller_id, created_at desc);
create index if not exists call_signals_receiver_idx on public.call_signals(receiver_id, created_at desc);
create index if not exists call_signals_call_idx on public.call_signals(call_id, created_at);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.call_sessions enable row level security;
alter table public.call_signals enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "participants can read calls" on public.call_sessions;
create policy "participants can read calls" on public.call_sessions for select using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "users can create calls as themselves" on public.call_sessions;
create policy "users can create calls as themselves" on public.call_sessions for insert with check (auth.uid() = caller_id);

drop policy if exists "participants can update calls" on public.call_sessions;
create policy "participants can update calls" on public.call_sessions for update using (auth.uid() = caller_id or auth.uid() = callee_id) with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "participants can read call signals" on public.call_signals;
create policy "participants can read call signals" on public.call_signals for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "users can send call signals" on public.call_signals;
create policy "users can send call signals" on public.call_signals for insert with check (auth.uid() = sender_id);

drop policy if exists "users can read own push subscriptions" on public.push_subscriptions;
create policy "users can read own push subscriptions" on public.push_subscriptions for select using (auth.uid() = user_id);

drop policy if exists "users can create own push subscriptions" on public.push_subscriptions;
create policy "users can create own push subscriptions" on public.push_subscriptions for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own push subscriptions" on public.push_subscriptions;
create policy "users can update own push subscriptions" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own push subscriptions" on public.push_subscriptions;
create policy "users can delete own push subscriptions" on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Realtime is required for incoming calls and WebRTC signaling.
alter publication supabase_realtime add table public.call_sessions;
alter publication supabase_realtime add table public.call_signals;
