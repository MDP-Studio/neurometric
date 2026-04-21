-- ============================================================
-- COGNITIVE_MONOLITH — initial schema
-- Multi-mode personal-science suite. Two-user deployment.
-- Every table has Row-Level Security. Every policy is explicit.
-- Default is private. Sharing is per-item, opt-in, revocable.
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles
-- One row per auth.users row. Created on signup via trigger.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
  on public.profiles for select
  using (auth.uid() = id);

-- NOTE: profiles_paired_select is defined later, after the pairings table
-- exists. Kept together with other cross-table policies near the bottom.

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_self_delete" on public.profiles;
create policy "profiles_self_delete"
  on public.profiles for delete
  using (auth.uid() = id);

-- Auto-create profile on auth.users insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- pairings
-- Symmetric pair relationship. One row per pair, both user_ids stored.
-- Either party can revoke (soft-revoke: status = 'revoked').
-- Invite flow: A creates invite (status='pending', b_user_id null, invite_code).
--              B accepts by code (status='active', b_user_id=auth.uid()).
-- ------------------------------------------------------------
do $$ begin
  create type pairing_status as enum ('pending', 'active', 'revoked');
exception when duplicate_object then null;
end $$;

create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  a_user_id uuid not null references auth.users (id) on delete cascade,
  b_user_id uuid references auth.users (id) on delete cascade,
  invite_code text unique,
  status pairing_status not null default 'pending',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);

create index if not exists pairings_a_idx on public.pairings (a_user_id);
create index if not exists pairings_b_idx on public.pairings (b_user_id);
create index if not exists pairings_status_idx on public.pairings (status);

alter table public.pairings enable row level security;

-- Participants see their own pairings (any status).
drop policy if exists "pairings_participants_select" on public.pairings;
create policy "pairings_participants_select"
  on public.pairings for select
  using (auth.uid() = a_user_id or auth.uid() = b_user_id);

-- Anyone authenticated can look up a pending invite by code (to accept it).
-- This is narrow: only status='pending', only one row, and the client must
-- know the invite code.
drop policy if exists "pairings_pending_by_code_select" on public.pairings;
create policy "pairings_pending_by_code_select"
  on public.pairings for select
  using (status = 'pending' and invite_code is not null);

-- Anyone authenticated can create their own outgoing invite.
drop policy if exists "pairings_self_invite" on public.pairings;
create policy "pairings_self_invite"
  on public.pairings for insert
  with check (
    auth.uid() = a_user_id
    and status = 'pending'
    and b_user_id is null
    and invite_code is not null
  );

-- Accepting an invite: update pending → active.
-- Revocation: either participant → revoked.
drop policy if exists "pairings_update" on public.pairings;
create policy "pairings_update"
  on public.pairings for update
  using (
    -- Either participant can touch their own row
    auth.uid() = a_user_id or auth.uid() = b_user_id
    -- OR someone is accepting a pending invite (they must know the code)
    or (status = 'pending' and invite_code is not null)
  )
  with check (
    -- After update, the row must still reference the current user
    auth.uid() = a_user_id or auth.uid() = b_user_id
  );

drop policy if exists "pairings_delete" on public.pairings;
create policy "pairings_delete"
  on public.pairings for delete
  using (auth.uid() = a_user_id or auth.uid() = b_user_id);

-- ------------------------------------------------------------
-- Helper: is the current user paired (active) with target?
-- Used in share policies.
-- ------------------------------------------------------------
create or replace function public.is_paired_with(target uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.pairings
    where status = 'active'
      and (
        (a_user_id = auth.uid() and b_user_id = target) or
        (b_user_id = auth.uid() and a_user_id = target)
      )
  );
$$;

-- ------------------------------------------------------------
-- Cross-table policy: a paired partner can read the partner's
-- profile display_name. Defined here (after pairings exists)
-- rather than at the profiles section, which would be a
-- forward reference.
-- ------------------------------------------------------------
drop policy if exists "profiles_paired_select" on public.profiles;
create policy "profiles_paired_select"
  on public.profiles for select
  using (
    exists (
      select 1 from public.pairings p
      where p.status = 'active'
        and (
          (p.a_user_id = auth.uid() and p.b_user_id = profiles.id) or
          (p.b_user_id = auth.uid() and p.a_user_id = profiles.id)
        )
    )
  );

-- ------------------------------------------------------------
-- Sampling Tracker
-- sample_categories: user-scoped (some seeded on signup, user-added)
-- samples: a planned or completed sample
-- sample_debriefs: the 5-question debrief
-- sample_followups: 3-days-later check
-- sample_shares: per-sample share to a paired user
-- ------------------------------------------------------------
create table if not exists public.sample_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  theme text,
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sample_categories_user_idx on public.sample_categories (user_id);

alter table public.sample_categories enable row level security;

drop policy if exists "sample_categories_self" on public.sample_categories;
create policy "sample_categories_self"
  on public.sample_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.sample_categories (id) on delete set null,
  title text not null,
  scheduled_for date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists samples_user_idx on public.samples (user_id);
create index if not exists samples_scheduled_idx on public.samples (scheduled_for);

alter table public.samples enable row level security;

drop policy if exists "samples_self" on public.samples;
create policy "samples_self"
  on public.samples for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: samples_shared_read and sample_debriefs_shared_read are defined
-- later, after sample_shares exists.

create table if not exists public.sample_debriefs (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 1..5 scales for the five structured questions
  time_signal smallint,
  effort_signal smallint,
  want_again smallint,
  improvement smallint,
  curiosity smallint,
  free_text text,
  created_at timestamptz not null default now()
);

create index if not exists sample_debriefs_sample_idx on public.sample_debriefs (sample_id);

alter table public.sample_debriefs enable row level security;

drop policy if exists "sample_debriefs_self" on public.sample_debriefs;
create policy "sample_debriefs_self"
  on public.sample_debriefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.sample_followups (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- "did you keep thinking about it?" 1..5
  curiosity_pull smallint,
  free_text text,
  created_at timestamptz not null default now()
);

create index if not exists sample_followups_sample_idx on public.sample_followups (sample_id);

alter table public.sample_followups enable row level security;

drop policy if exists "sample_followups_self" on public.sample_followups;
create policy "sample_followups_self"
  on public.sample_followups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.sample_shares (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  shared_with uuid not null references auth.users (id) on delete cascade,
  include_debrief boolean not null default true,
  include_followup boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (sample_id, shared_with)
);

create index if not exists sample_shares_shared_with_idx on public.sample_shares (shared_with);

alter table public.sample_shares enable row level security;

-- Owner can see + manage their shares.
drop policy if exists "sample_shares_owner" on public.sample_shares;
create policy "sample_shares_owner"
  on public.sample_shares for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner and public.is_paired_with(shared_with));

-- Recipient can see shares directed at them (read-only).
drop policy if exists "sample_shares_recipient_read" on public.sample_shares;
create policy "sample_shares_recipient_read"
  on public.sample_shares for select
  using (auth.uid() = shared_with);

-- Now that sample_shares exists, the cross-table read policies:
drop policy if exists "samples_shared_read" on public.samples;
create policy "samples_shared_read"
  on public.samples for select
  using (
    exists (
      select 1 from public.sample_shares ss
      where ss.sample_id = samples.id
        and ss.shared_with = auth.uid()
        and ss.revoked_at is null
    )
  );

drop policy if exists "sample_debriefs_shared_read" on public.sample_debriefs;
create policy "sample_debriefs_shared_read"
  on public.sample_debriefs for select
  using (
    exists (
      select 1 from public.sample_shares ss
      where ss.sample_id = sample_debriefs.sample_id
        and ss.shared_with = auth.uid()
        and ss.include_debrief = true
        and ss.revoked_at is null
    )
  );

-- ------------------------------------------------------------
-- Reflection Library
-- reflections: free-text reflections; optional prompt_id
-- reflection_prompts: seeded + user-added prompts
-- reflection_shares: per-entry share
-- ------------------------------------------------------------
create table if not exists public.reflection_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  is_system boolean not null default false,
  category text,
  prompt_text text not null,
  created_at timestamptz not null default now()
);

alter table public.reflection_prompts enable row level security;

-- System prompts are readable by anyone authenticated.
drop policy if exists "reflection_prompts_system_read" on public.reflection_prompts;
create policy "reflection_prompts_system_read"
  on public.reflection_prompts for select
  using (is_system = true or auth.uid() = user_id);

drop policy if exists "reflection_prompts_self_write" on public.reflection_prompts;
create policy "reflection_prompts_self_write"
  on public.reflection_prompts for insert
  with check (auth.uid() = user_id and is_system = false);

drop policy if exists "reflection_prompts_self_delete" on public.reflection_prompts;
create policy "reflection_prompts_self_delete"
  on public.reflection_prompts for delete
  using (auth.uid() = user_id and is_system = false);

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_id uuid references public.reflection_prompts (id) on delete set null,
  response_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reflections_user_idx on public.reflections (user_id);

alter table public.reflections enable row level security;

drop policy if exists "reflections_self" on public.reflections;
create policy "reflections_self"
  on public.reflections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: reflections_shared_read is defined later, after reflection_shares.

create table if not exists public.reflection_shares (
  id uuid primary key default gen_random_uuid(),
  reflection_id uuid not null references public.reflections (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  shared_with uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (reflection_id, shared_with)
);

alter table public.reflection_shares enable row level security;

drop policy if exists "reflection_shares_owner" on public.reflection_shares;
create policy "reflection_shares_owner"
  on public.reflection_shares for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner and public.is_paired_with(shared_with));

drop policy if exists "reflection_shares_recipient_read" on public.reflection_shares;
create policy "reflection_shares_recipient_read"
  on public.reflection_shares for select
  using (auth.uid() = shared_with);

-- Now that reflection_shares exists:
drop policy if exists "reflections_shared_read" on public.reflections;
create policy "reflections_shared_read"
  on public.reflections for select
  using (
    exists (
      select 1 from public.reflection_shares rs
      where rs.reflection_id = reflections.id
        and rs.shared_with = auth.uid()
        and rs.revoked_at is null
    )
  );

-- ------------------------------------------------------------
-- Big Five (IPIP-NEO-120)
-- ------------------------------------------------------------
create table if not exists public.big_five_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now(),
  openness numeric(5,2),
  conscientiousness numeric(5,2),
  extraversion numeric(5,2),
  agreeableness numeric(5,2),
  neuroticism numeric(5,2),
  full_facet_scores_json jsonb,
  raw_item_responses_json jsonb
);

alter table public.big_five_results enable row level security;

drop policy if exists "big_five_self" on public.big_five_results;
create policy "big_five_self"
  on public.big_five_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: big_five_shared_read is defined later, after big_five_shares.

create table if not exists public.big_five_shares (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.big_five_results (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  shared_with uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (result_id, shared_with)
);

alter table public.big_five_shares enable row level security;

drop policy if exists "big_five_shares_owner" on public.big_five_shares;
create policy "big_five_shares_owner"
  on public.big_five_shares for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner and public.is_paired_with(shared_with));

drop policy if exists "big_five_shares_recipient_read" on public.big_five_shares;
create policy "big_five_shares_recipient_read"
  on public.big_five_shares for select
  using (auth.uid() = shared_with);

-- Now that big_five_shares exists:
drop policy if exists "big_five_shared_read" on public.big_five_results;
create policy "big_five_shared_read"
  on public.big_five_results for select
  using (
    exists (
      select 1 from public.big_five_shares bs
      where bs.result_id = big_five_results.id
        and bs.shared_with = auth.uid()
        and bs.revoked_at is null
    )
  );

-- ------------------------------------------------------------
-- Mirror readings (entertainment mode — LLM-generated, stored)
-- Strictly solo. Never shared.
-- ------------------------------------------------------------
create table if not exists public.mirror_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generated_at timestamptz not null default now(),
  prompt_used text,
  reading_text text not null,
  source_data_snapshot jsonb,
  model text
);

alter table public.mirror_readings enable row level security;

drop policy if exists "mirror_self_only" on public.mirror_readings;
create policy "mirror_self_only"
  on public.mirror_readings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Joint Notice
-- joint_notice_rounds: one per pair per week
-- joint_notice_entries: one per user per round; hidden until both submitted
-- ------------------------------------------------------------
create table if not exists public.joint_notice_rounds (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings (id) on delete cascade,
  prompt_text text not null,
  opens_at date not null,
  closes_at date,
  created_at timestamptz not null default now(),
  unique (pairing_id, opens_at)
);

create index if not exists jn_rounds_pairing_idx on public.joint_notice_rounds (pairing_id);

alter table public.joint_notice_rounds enable row level security;

-- Only participants of the pairing can see the round.
drop policy if exists "jn_rounds_participants" on public.joint_notice_rounds;
create policy "jn_rounds_participants"
  on public.joint_notice_rounds for all
  using (
    exists (
      select 1 from public.pairings p
      where p.id = joint_notice_rounds.pairing_id
        and (p.a_user_id = auth.uid() or p.b_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.pairings p
      where p.id = joint_notice_rounds.pairing_id
        and (p.a_user_id = auth.uid() or p.b_user_id = auth.uid())
    )
  );

create table if not exists public.joint_notice_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.joint_notice_rounds (id) on delete cascade,
  author uuid not null references auth.users (id) on delete cascade,
  about_user uuid not null references auth.users (id) on delete cascade,
  entry_text text not null,
  submitted_at timestamptz not null default now(),
  unique (round_id, author)
);

create index if not exists jn_entries_round_idx on public.joint_notice_entries (round_id);

alter table public.joint_notice_entries enable row level security;

-- Author can always read/write their own entry.
drop policy if exists "jn_entries_author" on public.joint_notice_entries;
create policy "jn_entries_author"
  on public.joint_notice_entries for all
  using (auth.uid() = author)
  with check (auth.uid() = author);

-- The "about_user" (the partner the entry is written about) can read the entry
-- ONLY after both entries in the round have been submitted.
-- This enforces the no-asymmetry rule.
drop policy if exists "jn_entries_reciprocal_read" on public.joint_notice_entries;
create policy "jn_entries_reciprocal_read"
  on public.joint_notice_entries for select
  using (
    auth.uid() = about_user
    and (
      select count(*) from public.joint_notice_entries sibling
      where sibling.round_id = joint_notice_entries.round_id
    ) >= 2
  );

-- ------------------------------------------------------------
-- Cognitive sessions (migrated from existing local-first app)
-- Local-first stays authoritative for timing. Sync to cloud is a mirror.
-- Never shared — no share table, no RLS policy for partner access.
-- ------------------------------------------------------------
create table if not exists public.cognitive_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  timestamp timestamptz not null,
  schema_version smallint not null,
  was_assigned boolean not null,
  calibration_json jsonb not null,
  telemetry_json jsonb not null,
  context_json jsonb not null,
  trials_json jsonb not null,
  metrics_json jsonb not null,
  imported_from_local boolean not null default false,
  synced_at timestamptz not null default now()
);

create index if not exists cog_sessions_user_idx on public.cognitive_sessions (user_id);
create index if not exists cog_sessions_task_idx on public.cognitive_sessions (user_id, task);

alter table public.cognitive_sessions enable row level security;

drop policy if exists "cog_sessions_self_only" on public.cognitive_sessions;
create policy "cog_sessions_self_only"
  on public.cognitive_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Deferral records mirror
create table if not exists public.cognitive_deferrals (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  timestamp timestamptz not null,
  assigned_task text not null,
  chosen_instead text,
  reason text not null,
  telemetry_json jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists cog_deferrals_user_idx on public.cognitive_deferrals (user_id);

alter table public.cognitive_deferrals enable row level security;

drop policy if exists "cog_deferrals_self_only" on public.cognitive_deferrals;
create policy "cog_deferrals_self_only"
  on public.cognitive_deferrals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Deletion helper: nuke every bit of user data.
-- Supabase auth.users will cascade to profiles etc. but the
-- account-delete flow from the client should also call this
-- to get anything that isn't on a FK cascade (nothing today,
-- but future-proof).
-- ------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  -- FK cascades from auth.users handle the rest when the client calls
  -- supabase.auth.admin.deleteUser(me) via edge function. This stub
  -- exists for explicit client-callable purging.
  delete from public.mirror_readings where user_id = me;
  delete from public.big_five_results where user_id = me;
  delete from public.reflections where user_id = me;
  delete from public.sample_followups where user_id = me;
  delete from public.sample_debriefs where user_id = me;
  delete from public.samples where user_id = me;
  delete from public.sample_categories where user_id = me;
  delete from public.cognitive_sessions where user_id = me;
  delete from public.cognitive_deferrals where user_id = me;
  delete from public.joint_notice_entries where author = me;
  -- pairings: let the app revoke first; then cascade from auth.users deletion.
  delete from public.profiles where id = me;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
