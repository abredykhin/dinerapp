-- 003_triggers.sql
-- Trigger: after a decisions row is inserted, stamp recipes.last_cooked_at
-- so the meal-picker LRU query has a fast denormalized sort key.

create or replace function public.fn_decisions_stamp_last_cooked_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recipes
  set last_cooked_at = NEW.created_at
  where id = NEW.recipe_id;
  return NEW;
end;
$$;

create trigger trg_decisions_stamp_last_cooked_at
  after insert on public.decisions
  for each row
  execute function public.fn_decisions_stamp_last_cooked_at();
