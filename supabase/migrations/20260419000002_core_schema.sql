-- 002_core_schema.sql
-- All v1 tables. meal_requests is intentionally omitted (Phase 2).
-- decisions.meal_request_id is kept as a plain uuid column (no FK) so the
-- column exists for the Phase 2 migration to add the constraint.

-- ─────────────────────────────────────────────────────────────────
-- households
-- ─────────────────────────────────────────────────────────────────
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- profiles  (one per auth.users row)
-- ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id),
  display_name text not null,
  role         text not null check (role in ('cook', 'son', 'admin')),
  locale       text not null default 'en' check (locale in ('en', 'ru', 'uk')),
  created_at   timestamptz not null default now()
);

create index profiles_household_id_idx on public.profiles (household_id);

-- ─────────────────────────────────────────────────────────────────
-- allowed_emails  (invite-only allowlist checked by Auth hook)
-- ─────────────────────────────────────────────────────────────────
create table public.allowed_emails (
  email        text primary key,
  household_id uuid not null references public.households (id),
  role         text not null,
  invited_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- ingredients  (controlled core vocabulary — no staples)
-- ─────────────────────────────────────────────────────────────────
create table public.ingredients (
  id       bigserial primary key,
  slug     text unique not null,          -- machine-readable key e.g. 'chicken'
  category text,                          -- 'meat','fish','poultry','vegetable', etc.
  name_en  text not null,
  name_ru  text,
  name_uk  text,
  aliases  text[] not null default '{}'   -- all spellings AI might return
);

create index ingredients_slug_idx    on public.ingredients (slug);
create index ingredients_aliases_idx on public.ingredients using gin (aliases);

-- ─────────────────────────────────────────────────────────────────
-- recipes
-- ─────────────────────────────────────────────────────────────────
create table public.recipes (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id),
  title                text not null,
  summary              text,
  source_type          text not null check (source_type in ('ai', 'scraped')),
  source_url           text,                 -- populated for 'scraped' recipes
  hero_image_path      text,                 -- Supabase Storage path
  full_ingredients     jsonb not null,       -- [{text:"2 tbsp olive oil"}, ...]
  instructions         jsonb not null,       -- [{step:1, text:"..."}]
  locale               text not null default 'en' check (locale in ('en', 'ru', 'uk')),
  translation_group_id uuid,                 -- groups EN/RU/UK variants of same dish
  revision_count       int  not null default 0,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  edited_by            uuid references public.profiles (id),
  edited_at            timestamptz,
  last_suggested_at    timestamptz,          -- bumped when meal picker shows this
  last_cooked_at       timestamptz,          -- bumped via trigger on decisions insert
  deleted_at           timestamptz           -- soft delete
);

create index recipes_household_id_idx      on public.recipes (household_id);
create index recipes_last_cooked_at_idx    on public.recipes (last_cooked_at);
create index recipes_last_suggested_at_idx on public.recipes (last_suggested_at);
create index recipes_deleted_at_idx        on public.recipes (deleted_at) where deleted_at is null;

-- ─────────────────────────────────────────────────────────────────
-- recipe_core_ingredients  (many-to-many: recipe ↔ ingredient)
-- ─────────────────────────────────────────────────────────────────
create table public.recipe_core_ingredients (
  recipe_id     uuid   not null references public.recipes (id) on delete cascade,
  ingredient_id bigint not null references public.ingredients (id),
  primary key (recipe_id, ingredient_id)
);

create index recipe_core_ingredients_ingredient_idx
  on public.recipe_core_ingredients (ingredient_id);

-- ─────────────────────────────────────────────────────────────────
-- last_selection  (remembers the most recent chip selection per household)
-- ─────────────────────────────────────────────────────────────────
create table public.last_selection (
  household_id   uuid primary key references public.households (id),
  ingredient_ids bigint[] not null default '{}',
  updated_by     uuid references public.profiles (id),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- ai_generations  (cost + audit log — no quota enforcement in v1)
-- ─────────────────────────────────────────────────────────────────
create table public.ai_generations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles (id),
  household_id     uuid references public.households (id),
  kind             text not null check (kind in (
                     'author', 'disambiguate', 'regenerate',
                     'suggest-from-chips', 'image', 'scrape-fallback'
                   )),
  input            jsonb not null,
  output_recipe_id uuid references public.recipes (id),
  model            text not null,    -- 'gemini-3.1-flash-lite-preview' | 'gemini-3.1-flash-image-preview'
  tokens_in        int,
  tokens_out       int,
  cost_usd         numeric(10, 4),
  created_at       timestamptz not null default now()
);

create index ai_generations_household_id_idx on public.ai_generations (household_id);
create index ai_generations_created_at_idx   on public.ai_generations (created_at);

-- ─────────────────────────────────────────────────────────────────
-- recipe_drafts  (disambiguation candidates, max 3 per prompt)
-- ─────────────────────────────────────────────────────────────────
create table public.recipe_drafts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles (id),
  household_id    uuid references public.households (id),
  original_prompt text not null,
  candidates      jsonb not null,  -- max 3: [{title, summary, core_ingredient_slugs}]
  chosen_index    int,             -- set when user picks
  promoted_recipe uuid references public.recipes (id),
  created_at      timestamptz not null default now()
);

create index recipe_drafts_household_id_idx on public.recipe_drafts (household_id);

-- ─────────────────────────────────────────────────────────────────
-- decisions  (household cooking history)
-- meal_request_id has no FK constraint in v1 — Phase 2 migration adds it
-- once meal_requests table exists.
-- ─────────────────────────────────────────────────────────────────
create table public.decisions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id),
  user_id         uuid not null references public.profiles (id),
  recipe_id       uuid not null references public.recipes (id),
  via             text not null default 'direct'
                    check (via in ('direct', 'member-agreed', 'member-counter')),
  meal_request_id uuid,            -- no FK yet; Phase 2 adds the constraint
  created_at      timestamptz not null default now()
);

create index decisions_household_id_idx on public.decisions (household_id);
create index decisions_recipe_id_idx    on public.decisions (recipe_id);
create index decisions_created_at_idx   on public.decisions (created_at);
