-- 001_extensions.sql
-- gen_random_uuid() is built-in on Postgres 14+ (Supabase uses 15+), so no
-- uuid-ossp needed. Enable pgcrypto explicitly just in case the project was
-- created without it, and moddatetime for any future updated_at triggers.

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists moddatetime with schema extensions;
