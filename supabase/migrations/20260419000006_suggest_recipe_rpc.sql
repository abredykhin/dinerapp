-- 006_suggest_recipe_rpc.sql
-- Function to suggest a single recipe based on LRU-weighted randomness

create or replace function public.suggest_recipe(
  selected_ingredient_ids bigint[],
  already_seen_recipe_ids uuid[] default '{}'::uuid[]
)
returns setof public.recipes
language plpgsql
security invoker
as $$
declare
  hid uuid;
begin
  -- Obtain the household_id using the RLS helper
  hid := public.my_household_id();

  return query
  select r.*
  from public.recipes r
  join public.recipe_core_ingredients rci on rci.recipe_id = r.id
  where r.household_id = hid
    and r.deleted_at is null
    and not (r.id = any(already_seen_recipe_ids))
  group by r.id
  having bool_and(rci.ingredient_id = any(selected_ingredient_ids))
  order by
    (
      extract(epoch from (now() - greatest(
        coalesce(r.last_cooked_at,    'epoch'::timestamptz),
        coalesce(r.last_suggested_at, 'epoch'::timestamptz)
      ))) / 86400.0 + 1
    ) * random()
    desc
  limit 1;
end;
$$;
