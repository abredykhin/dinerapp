-- 004_rls.sql
-- Row-Level Security policies for all v1 tables.
-- Convention: service-role key (used by Edge Functions) bypasses RLS entirely.
-- The anon role is not used — every request requires an authenticated session.

-- ─────────────────────────────────────────────────────────────────
-- Helper: returns the current user's household_id.
-- security definer + stable allows Postgres to cache it per statement,
-- avoiding a subquery re-execution for every row.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id
  from   public.profiles
  where  id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────────
-- households
-- ─────────────────────────────────────────────────────────────────
alter table public.households enable row level security;

create policy "households: members can read their own"
  on public.households
  for select
  using (id = public.my_household_id());

-- Inserts are done via service role (onboarding flow); no anon/auth insert policy needed.

-- ─────────────────────────────────────────────────────────────────
-- profiles
-- Bootstrap note: a user may not have a profile row yet immediately after
-- sign-in. The "or id = auth.uid()" clause on SELECT lets them read their
-- own (empty) state without requiring my_household_id() to return a value.
-- Profile creation is performed server-side (service role) after sign-in.
-- ─────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "profiles: read same household or own row"
  on public.profiles
  for select
  using (
    household_id = public.my_household_id()
    or id = auth.uid()
  );

create policy "profiles: users can update their own row"
  on public.profiles
  for update
  using (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- allowed_emails
-- Only the service role needs this table (Auth hook). No policies for
-- authenticated users — they should never read or write it directly.
-- ─────────────────────────────────────────────────────────────────
alter table public.allowed_emails enable row level security;
-- (no policies — service role bypasses RLS)

-- ─────────────────────────────────────────────────────────────────
-- ingredients  (shared vocabulary; read by all authenticated users)
-- ─────────────────────────────────────────────────────────────────
alter table public.ingredients enable row level security;

create policy "ingredients: any authenticated user can read"
  on public.ingredients
  for select
  to authenticated
  using (true);

create policy "ingredients: only admins can write"
  on public.ingredients
  for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- recipes
-- ─────────────────────────────────────────────────────────────────
alter table public.recipes enable row level security;

create policy "recipes: household members can read"
  on public.recipes
  for select
  using (household_id = public.my_household_id());

create policy "recipes: household members can insert"
  on public.recipes
  for insert
  with check (household_id = public.my_household_id());

create policy "recipes: household members can update"
  on public.recipes
  for update
  using (household_id = public.my_household_id());

create policy "recipes: household members can delete"
  on public.recipes
  for delete
  using (household_id = public.my_household_id());

-- ─────────────────────────────────────────────────────────────────
-- recipe_core_ingredients
-- Access is derived from the parent recipe's household.
-- ─────────────────────────────────────────────────────────────────
alter table public.recipe_core_ingredients enable row level security;

create policy "recipe_core_ingredients: household members can read"
  on public.recipe_core_ingredients
  for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.household_id = public.my_household_id()
    )
  );

create policy "recipe_core_ingredients: household members can insert"
  on public.recipe_core_ingredients
  for insert
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.household_id = public.my_household_id()
    )
  );

create policy "recipe_core_ingredients: household members can delete"
  on public.recipe_core_ingredients
  for delete
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.household_id = public.my_household_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- last_selection
-- ─────────────────────────────────────────────────────────────────
alter table public.last_selection enable row level security;

create policy "last_selection: household members full access"
  on public.last_selection
  for all
  using     (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- ─────────────────────────────────────────────────────────────────
-- ai_generations
-- Writes always come from Edge Functions (service role). Reads are allowed
-- to household members so the dashboard can show spend.
-- ─────────────────────────────────────────────────────────────────
alter table public.ai_generations enable row level security;

create policy "ai_generations: household members can read"
  on public.ai_generations
  for select
  using (household_id = public.my_household_id());

-- Inserts are done by Edge Functions via service role; no client insert policy needed.

-- ─────────────────────────────────────────────────────────────────
-- recipe_drafts
-- ─────────────────────────────────────────────────────────────────
alter table public.recipe_drafts enable row level security;

create policy "recipe_drafts: household members full access"
  on public.recipe_drafts
  for all
  using     (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- ─────────────────────────────────────────────────────────────────
-- decisions
-- ─────────────────────────────────────────────────────────────────
alter table public.decisions enable row level security;

create policy "decisions: household members can read"
  on public.decisions
  for select
  using (household_id = public.my_household_id());

create policy "decisions: household members can insert"
  on public.decisions
  for insert
  with check (household_id = public.my_household_id());
