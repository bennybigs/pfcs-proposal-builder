-- PFCS CRM schema. Safe to re-run (idempotent: IF NOT EXISTS + drop-then-create
-- policies). Paste into the Supabase SQL Editor, or run via the management API.
--
-- Access model: authentication happens via Supabase magic links, but the REAL
-- gate is the team_members table — every policy requires the signed-in email
-- to be listed there. A stranger who triggers a magic link gets an auth user
-- and can read/write NOTHING.

-- ── enums ───────────────────────────────────────────────────────────
do $$ begin
  create type contact_source as enum ('referral', 'website', 'facebook', 'show', 'cold', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_stage as enum ('inquiry', 'site_visit_scheduled', 'proposal_sent', 'negotiating', 'won', 'lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_segment as enum ('barndominium', 'ag_shop', 'storage_garage', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_type as enum ('call', 'text', 'email', 'meeting', 'site_visit', 'note', 'proposal_event');
exception when duplicate_object then null; end $$;

-- ── team gate ───────────────────────────────────────────────────────
create table if not exists public.team_members (
  email        text primary key,
  display_name text not null default '',
  added_at     timestamptz not null default now()
);

-- security definer so RLS checks don't recurse into team_members' own RLS
create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = auth.email());
$$;

-- ── tables ──────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null default '',
  phone        text not null default '',
  address      text not null default '',
  company_name text not null default '',
  source       contact_source not null default 'other',
  tags         text[] not null default '{}',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  owner        uuid references auth.users (id) on delete set null
);

create table if not exists public.deals (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.contacts (id) on delete cascade,
  title            text not null,
  stage            deal_stage not null default 'inquiry',
  stage_entered_at timestamptz not null default now(),
  segment          deal_segment not null default 'other',
  value            numeric not null default 0,          -- whole dollars
  expected_close   date,
  probability      int not null default 10,
  lost_reason      text,
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  deal_id     uuid references public.deals (id) on delete cascade,
  type        activity_type not null default 'note',
  body        text not null default '',
  happened_at timestamptz not null default now(),
  logged_by   text not null default ''                  -- email of the teammate
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references public.contacts (id) on delete cascade,
  deal_id     uuid references public.deals (id) on delete cascade,
  title       text not null,
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  assigned_to text not null default '',                 -- email of the teammate
  created_at  timestamptz not null default now(),
  constraint task_has_parent check (contact_id is not null or deal_id is not null)
);

create table if not exists public.proposal_links (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  proposal_id text not null,                            -- the builder's local uuid
  title       text not null default '',
  total       numeric not null default 0,
  share_url   text,                                     -- lets ANY teammate open it
  linked_at   timestamptz not null default now(),
  linked_by   text not null default '',
  unique (deal_id, proposal_id)
);

-- daily keepalive target (see /api/keepalive.ts + vercel.json cron)
create table if not exists public.heartbeat (
  id         int primary key default 1,
  beat_at    timestamptz not null default now()
);
insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

-- ── indexes ─────────────────────────────────────────────────────────
create index if not exists contacts_name_idx      on public.contacts (lower(name));
create index if not exists deals_contact_idx      on public.deals (contact_id);
create index if not exists deals_stage_idx        on public.deals (stage);
create index if not exists activities_contact_idx on public.activities (contact_id, happened_at desc);
create index if not exists activities_deal_idx    on public.activities (deal_id, happened_at desc);
create index if not exists tasks_contact_idx      on public.tasks (contact_id);
create index if not exists tasks_deal_idx         on public.tasks (deal_id);
create index if not exists tasks_due_idx          on public.tasks (done, due_date);
create index if not exists proposal_links_deal_idx on public.proposal_links (deal_id);

-- ── updated_at trigger ──────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();

-- ── RLS: every table, all four verbs, gated on team membership ──────
alter table public.team_members   enable row level security;
alter table public.contacts       enable row level security;
alter table public.deals          enable row level security;
alter table public.activities     enable row level security;
alter table public.tasks          enable row level security;
alter table public.proposal_links enable row level security;
alter table public.heartbeat      enable row level security;

-- team_members: readable AND manageable by the team from the app's Team
-- page. The one guard rail: you can never delete YOURSELF — so the list can
-- never be emptied and nobody can lock the whole team out.
drop policy if exists "team read" on public.team_members;
create policy "team read" on public.team_members
  for select using (public.is_team_member());

drop policy if exists "team add" on public.team_members;
create policy "team add" on public.team_members
  for insert with check (public.is_team_member());

drop policy if exists "team rename" on public.team_members;
create policy "team rename" on public.team_members
  for update using (public.is_team_member()) with check (public.is_team_member());

drop policy if exists "team remove others" on public.team_members;
create policy "team remove others" on public.team_members
  for delete using (public.is_team_member() and email <> auth.email());

do $$
declare t text;
begin
  foreach t in array array['contacts', 'deals', 'activities', 'tasks', 'proposal_links'] loop
    execute format('drop policy if exists "team select" on public.%I', t);
    execute format('create policy "team select" on public.%I for select using (public.is_team_member())', t);
    execute format('drop policy if exists "team insert" on public.%I', t);
    execute format('create policy "team insert" on public.%I for insert with check (public.is_team_member())', t);
    execute format('drop policy if exists "team update" on public.%I', t);
    execute format('create policy "team update" on public.%I for update using (public.is_team_member()) with check (public.is_team_member())', t);
    execute format('drop policy if exists "team delete" on public.%I', t);
    execute format('create policy "team delete" on public.%I for delete using (public.is_team_member())', t);
  end loop;
end $$;

-- heartbeat: no client policies at all — only the service-role keepalive
-- touches it (service role bypasses RLS).
