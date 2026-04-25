-- seed.sql
-- Run once in Supabase Studio → SQL Editor (or via psql).
-- Creates the household and allowlists both users.
-- Profiles are created automatically on first magic-link sign-in.

-- 1. Household
insert into public.households (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Demo')
on conflict (id) do nothing;

-- 2. Allowlist
insert into public.allowed_emails (email, household_id, role)
values
  ('admin@example.com',  '00000000-0000-0000-0000-000000000001', 'admin'),
  ('cook@example.com',  '00000000-0000-0000-0000-000000000001', 'cook')
on conflict (email) do nothing;
