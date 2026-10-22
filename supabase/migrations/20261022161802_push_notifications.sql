create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table public.push_subscriptions (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 subscription jsonb not null check (octet_length(subscription::text)<=10000),
 timezone text not null,
 lead_minutes integer not null default 5 check (lead_minutes in (0,5,10,15,30)),
 enabled boolean not null default true,
 last_test_at timestamptz,
 updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy "Own device subscriptions" on public.push_subscriptions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table public.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references public.push_subscriptions(id) on delete cascade,
 item_id text not null,
 scheduled_at timestamptz not null,
 leased_until timestamptz not null,
 sent_at timestamptz,
 unique(device_id,item_id,scheduled_at)
);
create index push_deliveries_schedule_idx on public.push_deliveries(scheduled_at);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public,anon,authenticated;
grant all on public.push_deliveries to service_role;
create policy "Server delivery only" on public.push_deliveries for all to service_role using (true) with check (true);

-- Only the server may decrypt the delivery keys; browsers receive the public key alone.
create function public.lbl_push_config() returns jsonb language sql security definer set search_path='' as $$
 select decrypted_secret::jsonb from vault.decrypted_secrets where name='lbl_push_config';
$$;
revoke all on function public.lbl_push_config() from public,anon,authenticated;
grant execute on function public.lbl_push_config() to service_role;

-- Skip malformed historical entries instead of stopping delivery for other accounts.
create function public.lbl_push_due_at(day text,minute text,zone text) returns timestamptz language plpgsql security invoker set search_path='' as $$
begin
 if day !~ '^\d{4}-\d{2}-\d{2}$' or minute !~ '^\d+$' or minute::int<0 or minute::int>=1440 then return null;end if;
 return (day::date+make_interval(mins=>minute::int)) at time zone zone;
exception when others then return null;
end;
$$;
revoke all on function public.lbl_push_due_at(text,text,text) from public,anon,authenticated;
grant execute on function public.lbl_push_due_at(text,text,text) to service_role;

create function public.lbl_claim_push_reminders() returns setof jsonb language sql security invoker set search_path='' as $$
 with cleared as (delete from public.push_deliveries where scheduled_at<now()-interval '7 days'),
 entries as (
  select s.id device_id,s.subscription,s.lead_minutes,'task:'||(t->>'id') item_id,t->>'title' title,
   public.lbl_push_due_at(t->>'date',t->>'at',s.timezone) scheduled_at
  from public.push_subscriptions s join public.planners p using(user_id)
  cross join lateral jsonb_array_elements(p.state->'tasks') t
  where s.enabled and coalesce(t->>'done','false')<>'true' and t->>'at' is not null
  union all
  select s.id,s.subscription,s.lead_minutes,'event:'||(e->>'id'),e->>'title',
   public.lbl_push_due_at(e->>'date',e->>'start',s.timezone)
  from public.push_subscriptions s join public.planners p using(user_id)
  cross join lateral jsonb_array_elements(p.state->'events') e where s.enabled
 ), due as (
  select * from entries where item_id is not null and scheduled_at-make_interval(mins=>lead_minutes)<=now()
   and scheduled_at-make_interval(mins=>lead_minutes)>now()-interval '5 minutes'
  order by scheduled_at limit 50
 ), claimed as (
  insert into public.push_deliveries(device_id,item_id,scheduled_at,leased_until)
  select device_id,item_id,scheduled_at,now()+interval '2 minutes' from due
  on conflict(device_id,item_id,scheduled_at) do update set leased_until=excluded.leased_until
   where public.push_deliveries.sent_at is null and public.push_deliveries.leased_until<now()
  returning id,device_id,item_id,scheduled_at
 )
 select jsonb_build_object('delivery_id',c.id,'device_id',c.device_id,'item_id',c.item_id,'scheduled_at',c.scheduled_at,'title',d.title,'lead_minutes',d.lead_minutes,'subscription',d.subscription)
 from claimed c join due d using(device_id,item_id,scheduled_at);
$$;
revoke all on function public.lbl_claim_push_reminders() from public,anon,authenticated;
grant execute on function public.lbl_claim_push_reminders() to service_role;

-- Vault values are resolved at execution time, never embedded in a job command.
select cron.schedule('lbl-push-reminders','* * * * *',$cron$
 select net.http_post(
  url:='https://eldhmjdzubvzicaurobe.supabase.co/functions/v1/notifications',
  headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret::jsonb->>'cronSecret' from vault.decrypted_secrets where name='lbl_push_config')),
  body:='{}'::jsonb,timeout_milliseconds:=10000
 ) where exists(select 1 from public.push_subscriptions where enabled);
$cron$);
