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
  is_admin     boolean not null default false,          -- admins manage this list
  added_at     timestamptz not null default now()
);
alter table public.team_members add column if not exists is_admin boolean not null default false;

-- Admins gate team management; every-member access still gates the data.
create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = auth.email() and is_admin);
$$;

-- The team can never lose its last admin (no self-inflicted lockouts).
create or replace function public.guard_last_admin() returns trigger
language plpgsql as $$
begin
  if old.is_admin and (tg_op = 'DELETE' or new.is_admin = false) then
    if (select count(*) from public.team_members where is_admin) <= 1 then
      raise exception 'At least one admin is required — promote someone else first';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists team_last_admin_guard on public.team_members;
create trigger team_last_admin_guard before update or delete on public.team_members
  for each row execute function public.guard_last_admin();

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
  archived     boolean not null default false,          -- hidden, not gone
  source_detail text,                                    -- campaign-level attribution ("Home Show 2026")
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

-- ── deal stage history ──────────────────────────────────────────────
-- Every stage change, recorded by a TRIGGER (not app code) so the inbound
-- endpoint and any future integration are covered automatically. Reports
-- read won-dates and stages-over-time from here.
create table if not exists public.deal_stage_history (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals (id) on delete cascade,
  from_stage deal_stage,                                -- null = deal created
  to_stage   deal_stage not null,
  changed_at timestamptz not null default now(),
  changed_by text                                       -- auth email; null for service/API writes
);

create index if not exists dsh_deal_idx  on public.deal_stage_history (deal_id, changed_at);
create index if not exists dsh_stage_idx on public.deal_stage_history (to_stage, changed_at);

create or replace function public.record_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, auth.email());
  elsif old.stage is distinct from new.stage then
    insert into public.deal_stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, auth.email());
  end if;
  return new;
end $$;

drop trigger if exists deals_stage_history on public.deals;
create trigger deals_stage_history after insert or update of stage on public.deals
  for each row execute function public.record_stage_change();

-- Backfill: one creation row per deal that has no history yet. Idempotent.
insert into public.deal_stage_history (deal_id, from_stage, to_stage, changed_at)
select d.id, null, d.stage, d.stage_entered_at
from public.deals d
where not exists (select 1 from public.deal_stage_history h where h.deal_id = d.id);

alter table public.deal_stage_history enable row level security;
-- read-only for the team; ONLY the trigger writes (definer rights) — no
-- client write policies at all.
drop policy if exists "team select" on public.deal_stage_history;
create policy "team select" on public.deal_stage_history
  for select using (public.is_team_member());

-- migration for databases created before the archived column existed
alter table public.contacts add column if not exists archived boolean not null default false;
alter table public.contacts add column if not exists source_detail text;

-- ── reporting views ─────────────────────────────────────────────────
-- security_invoker: the caller's RLS applies (team members only see rows).
-- won_at/lost_at come from stage history (survives later stage churn better
-- than stage_entered_at, and the backfill made them equal on day one).
create or replace view public.report_deals with (security_invoker = on) as
select d.id, d.title, d.stage, d.segment, d.value, d.created_at,
       d.stage_entered_at, d.lost_reason, d.contact_id,
       c.name as contact_name, c.source, c.source_detail, c.archived,
       (select max(h.changed_at) from public.deal_stage_history h
          where h.deal_id = d.id and h.to_stage = 'won')  as won_at,
       (select max(h.changed_at) from public.deal_stage_history h
          where h.deal_id = d.id and h.to_stage = 'lost') as lost_at
from public.deals d
join public.contacts c on c.id = d.contact_id;

create or replace view public.report_stage_entries with (security_invoker = on) as
select h.deal_id, h.from_stage, h.to_stage, h.changed_at,
       d.segment, c.source, c.source_detail, c.archived
from public.deal_stage_history h
join public.deals d on d.id = h.deal_id
join public.contacts c on c.id = d.contact_id;

grant select on public.report_deals, public.report_stage_entries to authenticated;

-- ── inbound lead log ────────────────────────────────────────────────
-- Every call to /api/inbound-lead, success or failure, with the raw payload.
-- Cheap insurance when an integrator says "we sent 40, you show 30".
-- Written only by the service role; admins can read it.
create table if not exists public.inbound_lead_log (
  id          uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  key_label   text not null default '',
  status      int not null,
  created_contact boolean,
  contact_id  uuid,
  deal_id     uuid,
  error       text,
  payload     jsonb
);
create index if not exists ill_received_idx on public.inbound_lead_log (received_at desc);
create index if not exists ill_key_idx on public.inbound_lead_log (key_label, received_at desc);

alter table public.inbound_lead_log enable row level security;
drop policy if exists "admin read" on public.inbound_lead_log;
create policy "admin read" on public.inbound_lead_log
  for select using (public.is_team_admin());

-- ── cloud proposals + shared builder state ──────────────────────────
-- The proposal builder's documents, one jsonb row per proposal, so every
-- team member sees the same set from any device. Last-write-wins by the
-- proposal's own updatedAt (fine for a 2–3 person team).
create table if not exists public.proposals (
  id         text primary key,                          -- the builder's uuid
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

-- Card library + company settings (one shared copy instead of per-browser).
create table if not exists public.builder_shared (
  key        text primary key,                          -- 'library'
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table public.proposals      enable row level security;
alter table public.builder_shared enable row level security;

do $$
declare t text;
begin
  foreach t in array array['proposals', 'builder_shared'] loop
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

-- team_members: every member can READ the list; only ADMINS manage it
-- (add, rename, promote/demote, remove). Guard rails: you can't delete your
-- own row, and the last-admin trigger blocks losing the final admin.
drop policy if exists "team read" on public.team_members;
create policy "team read" on public.team_members
  for select using (public.is_team_member());

drop policy if exists "team add" on public.team_members;
create policy "team add" on public.team_members
  for insert with check (public.is_team_admin());

drop policy if exists "team rename" on public.team_members;
create policy "team rename" on public.team_members
  for update using (public.is_team_admin()) with check (public.is_team_admin());

drop policy if exists "team remove others" on public.team_members;
create policy "team remove others" on public.team_members
  for delete using (public.is_team_admin() and email <> auth.email());

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
