create table if not exists public.planners (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 1500000),
 revision integer not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.planners enable row level security;
revoke all on public.planners from anon, authenticated;
grant select, insert on public.planners to authenticated;
grant update (state, revision, updated_at) on public.planners to authenticated;
create policy "Read own planner" on public.planners for select to authenticated using ((select auth.uid()) = user_id);

create policy "Insert own planner" on public.planners for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own planner" on public.planners for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Atomic compare-and-swap under the caller's RLS policies. No elevated privileges.
create or replace function public.save_planner(p_state jsonb,p_revision integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare caller uuid := auth.uid(); changed integer;
begin
 if caller is null then raise exception 'Authentication required'; end if;
 if p_revision is null or p_revision < 0 or p_state is null or jsonb_typeof(p_state) <> 'object'
  or jsonb_typeof(p_state->'tasks') is distinct from 'array'
  or jsonb_typeof(p_state->'events') is distinct from 'array'
  or jsonb_typeof(p_state->'dump') is distinct from 'string'
  or octet_length(p_state::text) > 1500000 then raise exception 'Invalid planner'; end if;
 if jsonb_array_length(p_state->'tasks') > 3000 or jsonb_array_length(p_state->'events') > 3000 then raise exception 'Too many entries'; end if;
 if p_revision=0 then
  insert into public.planners(user_id,state,revision,updated_at) values(caller,p_state,1,now()) on conflict(user_id) do nothing;
 else
  update public.planners set state=p_state,revision=revision+1,updated_at=now() where user_id=caller and revision=p_revision;
 end if;
 get diagnostics changed = row_count;
 return changed = 1;
end;
$$;
revoke all on function public.save_planner(jsonb,integer) from public, anon;
grant execute on function public.save_planner(jsonb,integer) to authenticated;
