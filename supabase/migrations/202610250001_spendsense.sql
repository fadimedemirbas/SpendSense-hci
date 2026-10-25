-- Prepared for review only. Do not apply to the shared project without approval.
-- New prefixed objects intentionally fail on name collisions instead of altering existing tables.
begin;
do $$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'SpendSense requires PostgreSQL 15 or newer' using errcode = '0A000';
  end if;
end $$;
-- Validators return false (never SQL NULL) for missing or incorrectly typed JSON.
create function public.spendsense_json_number(v jsonb, low numeric, high numeric, whole boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then
    coalesce((v #>> '{}')::numeric between low and high
      and (not whole or trunc((v #>> '{}')::numeric) = (v #>> '{}')::numeric), false)
    else false end;
$$;
create function public.spendsense_json_uuid(v jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;
create function public.spendsense_json_date(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare raw text;
begin
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  raw := v #>> '{}';
  if raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  -- Integer components + make_date are immutable; no DateStyle-sensitive input
  -- cast or to_char/date-to-timestamp conversion is involved.
  perform make_date(substring(raw from 1 for 4)::integer,
    substring(raw from 6 for 2)::integer, substring(raw from 9 for 2)::integer);
  return true;
exception when others then return false;
end;
$$;
create function public.spendsense_json_timestamp(v jsonb)
returns boolean language plpgsql stable set search_path = ''
set datestyle = 'ISO, YMD' set timezone = 'UTC' as $$
declare raw text;
begin
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  raw := v #>> '{}';
  -- Require an explicit UTC/offset zone, valid calendar date and ordinary clock
  -- time. Reject relative dates, implicit zones, 24:00 and leap-second rollover.
  if raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$'
    or not public.spendsense_json_date(to_jsonb(substring(raw from 1 for 10))) then return false; end if;
  return isfinite(raw::timestamptz);
exception when others then return false;
end;
$$;
create function public.spendsense_json_text(v jsonb, max_length integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and length(btrim(v #>> '{}')) between 1 and max_length, false);
$$;
create function public.spendsense_valid_goal(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(jsonb_typeof(v) = 'object' and v ?& array['id','name','target','saved','status']
    and public.spendsense_json_uuid(v->'id') and public.spendsense_json_text(v->'name',500)
    and public.spendsense_json_number(v->'target',0.01,999999999999.99)
    and round((v->>'target')::numeric,2) = (v->>'target')::numeric
    and public.spendsense_json_number(v->'saved',0,999999999999.99)
    and round((v->>'saved')::numeric,2) = (v->>'saved')::numeric
    and v->>'status' in ('Active','Completed','Archived')
    and (not v ? 'date' or v->'date' = 'null'::jsonb or public.spendsense_json_date(v->'date')), false);
exception when others then return false;
end;
$$;
create function public.spendsense_valid_purchase(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(v) is distinct from 'object'
    or not v ?& array['name','price','cat','reasons','feeling','own','wait'] then return false; end if;
  if jsonb_typeof(v->'reasons') is distinct from 'array' then return false; end if;
  return coalesce(public.spendsense_json_text(v->'name',500) and public.spendsense_json_text(v->'cat',80)
    and public.spendsense_json_number(v->'price',0.01,999999999999.99)
    and round((v->>'price')::numeric,2) = (v->>'price')::numeric
    and jsonb_array_length(v->'reasons') between 1 and 3
    and not exists (select 1 from jsonb_array_elements(v->'reasons') r
      where jsonb_typeof(r) <> 'string' or r #>> '{}' not in ('need','wanted','sale','easier','social','reward','attention','other'))
    and (select count(*) = count(distinct r) from jsonb_array_elements(v->'reasons') r)
    and v->>'feeling' in ('Calm','Excited','Stressed','Bored','Tired','Neutral')
    and jsonb_typeof(v->'own') = 'boolean'
    and (not v ? 'usable' or jsonb_typeof(v->'usable') = 'boolean')
    and (v->>'own' = 'false' or jsonb_typeof(v->'usable') = 'boolean')
    and v->>'wait' in ('24h','3d','1w'), false);
exception when others then return false;
end;
$$;
create function public.spendsense_valid_analysis(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if jsonb_typeof(v) is distinct from 'object' or not v ?& array[
    'budget','need','goalImpact','impulse','fit','income','pctIncome','pctGoal','delayDays'
  ] then return false; end if;
  foreach k in array array['budget','need','goalImpact','impulse'] loop
    if not public.spendsense_json_number(v->k,0,25,true) then return false; end if;
  end loop;
  return coalesce(public.spendsense_json_number(v->'fit',0,100,true)
    and (v->>'fit')::numeric = (v->>'budget')::numeric + (v->>'need')::numeric + 50 - (v->>'goalImpact')::numeric - (v->>'impulse')::numeric
    and public.spendsense_json_number(v->'income',0.01,999999999999.99)
    and public.spendsense_json_number(v->'pctIncome',0,9007199254740991,true)
    and (v->'pctGoal' = 'null'::jsonb or public.spendsense_json_number(v->'pctGoal',0,9007199254740991,true))
    and (v->'delayDays' = 'null'::jsonb or public.spendsense_json_number(v->'delayDays',0,9007199254740991,true))
    and (not v ? 'goal' or v->'goal' = 'null'::jsonb or public.spendsense_valid_goal(v->'goal')), false);
exception when others then return false;
end;
$$;
create function public.spendsense_valid_behavior(answers jsonb, scores jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if jsonb_typeof(answers) is distinct from 'array' or jsonb_typeof(scores) is distinct from 'object' then return false; end if;
  if jsonb_array_length(answers) = 0 then return scores = '{}'::jsonb; end if;
  if jsonb_array_length(answers) <> 4 or not answers <@ '[0,1,2]'::jsonb
    or (select count(*) from jsonb_object_keys(scores)) <> 5 then return false; end if;
  foreach k in array array['Impulsive Decision Maker','Planned Spender','Bargain Hunter','Reward-Driven Spender','Social Spender'] loop
    if not public.spendsense_json_number(scores->k,0,100) then return false; end if;
  end loop;
  return true;
end;
$$;
create function public.spendsense_valid_workspace(v jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare k text; item jsonb; p jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' or v->'schemaVersion' is distinct from '1'::jsonb
    or not public.spendsense_json_uuid(v->'ownerId') or jsonb_typeof(v->'deletions') is distinct from 'object' then return false; end if;
  p := v->'profile';
  if jsonb_typeof(p) is distinct from 'object' or not p ?& array['income','savings','onboarded','currency','habits']
    or not public.spendsense_json_number(p->'income',0,4,true) or not public.spendsense_json_number(p->'savings',0,4,true)
    or jsonb_typeof(p->'onboarded') is distinct from 'boolean' or p->>'currency' not in ('symbol','code')
    or not public.spendsense_valid_behavior(p->'habits',v->'behaviorScores')
    or (p->>'onboarded' = 'true' and jsonb_array_length(p->'habits') <> 4) then return false; end if;
  foreach k in array array['entries','goals','analyses','decisions','waiting','reflections'] loop
    if jsonb_typeof(v->'deletions'->k) is distinct from 'array' then return false; end if;
    for item in select value from jsonb_array_elements(v->'deletions'->k) loop
      if not public.spendsense_json_uuid(item) then return false; end if;
    end loop;
    if (select count(*) <> count(distinct (x #>> '{}')::uuid) from jsonb_array_elements(v->'deletions'->k) x) then return false; end if;
    if k = 'reflections' then continue; end if;
    if jsonb_typeof(v->k) is distinct from 'array' then return false; end if;
    for item in select value from jsonb_array_elements(v->k) loop
      if jsonb_typeof(item) is distinct from 'object' or not public.spendsense_json_uuid(item->'id') then return false; end if;
      if k = 'entries' and not coalesce(item->>'type' in ('income','expense')
        and public.spendsense_json_number(item->'amount',0.01,999999999999.99)
        and round((item->>'amount')::numeric,2) = (item->>'amount')::numeric
        and public.spendsense_json_text(item->'cat',80) and public.spendsense_json_text(item->'name',500)
        and public.spendsense_json_date(item->'date'), false) then return false; end if;
      if k = 'goals' and not public.spendsense_valid_goal(item) then return false; end if;
      if k = 'analyses' then
        if not public.spendsense_valid_purchase(item->'purchase') or not public.spendsense_valid_analysis(item->'result')
          or not public.spendsense_json_timestamp(item->'createdAt')
          or (item ? 'goalId' and item->'goalId' <> 'null'::jsonb and not public.spendsense_json_uuid(item->'goalId'))
          or (item->>'goalId' is not null and item#>>'{result,goal,id}' is distinct from item->>'goalId') then return false; end if;
      end if;
      if k in ('decisions','waiting') then
        if not public.spendsense_valid_purchase(item) or not public.spendsense_json_uuid(item->'analysisId')
          or not public.spendsense_json_number(item->'fit',0,100,true) then return false; end if;
        if k = 'decisions' and not coalesce(item->>'decision' in ('Buy','Wait','Skip') and public.spendsense_json_date(item->'date')
          and (not item ? 'reflection' or public.spendsense_json_number(item->'reflection',1,5,true)), false) then return false; end if;
        if k = 'waiting' and not (public.spendsense_json_date(item->'added') and public.spendsense_json_date(item->'review')
          and (item->>'review') >= (item->>'added')) then return false; end if;
      end if;
    end loop;
    if (select count(*) <> count(distinct (x->>'id')::uuid) from jsonb_array_elements(v->k) x)
      or exists (select 1 from jsonb_array_elements(v->k) x, jsonb_array_elements(v->'deletions'->k) d where (x->>'id')::uuid = (d #>> '{}')::uuid) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table public.spendsense_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  income_range smallint not null check (income_range between 0 and 4),
  savings_range smallint not null check (savings_range between 0 and 4),
  onboarded boolean not null default false,
  currency text not null default 'symbol' check (currency in ('symbol', 'code')),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.spendsense_money_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
  category text not null check (length(btrim(category)) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 500),
  entry_date date not null check (isfinite(entry_date)),
  created_at timestamptz not null default now()
);
create table public.spendsense_savings_goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 500),
  target numeric(14,2) not null check (target > 0 and target <> 'NaN'::numeric),
  saved numeric(14,2) not null check (saved >= 0 and saved <> 'NaN'::numeric),
  target_date date check (target_date is null or isfinite(target_date)),
  status text not null check (status in ('Active','Completed','Archived')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.spendsense_spending_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) in (0,4) and answers <@ '[0,1,2]'::jsonb),
  scores jsonb not null check (public.spendsense_valid_behavior(answers, scores)),
  scoring_version text not null default 'figma-make-v1' check (scoring_version = 'figma-make-v1'),
  updated_at timestamptz not null default now()
);
-- Snapshots preserve the Figma Make purchase model and its calculation context.
create table public.spendsense_purchase_analyses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase jsonb not null check (public.spendsense_valid_purchase(purchase)),
  result jsonb not null check (public.spendsense_valid_analysis(result)),
  goal_id uuid,
  created_at timestamptz not null default now() check (isfinite(created_at)),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.spendsense_savings_goals(id, user_id) on delete set null (goal_id),
  check (goal_id is null or coalesce((result#>>'{goal,id}')::uuid = goal_id,false))
);
create table public.spendsense_purchase_decisions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid not null,
  purchase jsonb not null check (public.spendsense_valid_purchase(purchase)),
  decision text not null check (decision in ('Buy','Wait','Skip')),
  decision_date date not null check (isfinite(decision_date)),
  fit smallint not null check (fit between 0 and 100),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (analysis_id, user_id) references public.spendsense_purchase_analyses(id, user_id)
);
create table public.spendsense_purchase_reflections (
  decision_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  foreign key (decision_id, user_id) references public.spendsense_purchase_decisions(id, user_id) on delete cascade
);
create table public.spendsense_waiting_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid not null,
  purchase jsonb not null check (public.spendsense_valid_purchase(purchase)),
  added_date date not null check (isfinite(added_date)),
  review_date date not null check (isfinite(review_date) and review_date >= added_date),
  fit smallint not null check (fit between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (analysis_id, user_id) references public.spendsense_purchase_analyses(id, user_id)
);

-- Every data table is protected, including snapshots and join/child tables.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'spendsense_user_profiles','spendsense_money_entries','spendsense_savings_goals',
    'spendsense_spending_profiles','spendsense_purchase_analyses',
    'spendsense_purchase_decisions','spendsense_purchase_reflections','spendsense_waiting_items'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy owner_only on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
    execute format('create index on public.%I (user_id)', table_name);
  end loop;
end $$;

-- Revisions also advance for direct Data API writes, not just RPC saves.
create function public.spendsense_profile_revision()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.revision := 0;
  else new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger spendsense_profile_revision before insert or update on public.spendsense_user_profiles
  for each row execute function public.spendsense_profile_revision();
create function public.spendsense_touch_workspace()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then return null; end if;
  update public.spendsense_user_profiles set updated_at = now()
    where user_id = case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if not found and tg_op <> 'DELETE' then
    raise exception 'Create a user profile before financial records' using errcode = '23503';
  end if;
  return null;
end;
$$;
do $$
declare table_name text;
begin
  foreach table_name in array array['spendsense_money_entries','spendsense_savings_goals',
    'spendsense_spending_profiles','spendsense_purchase_analyses','spendsense_purchase_decisions',
    'spendsense_purchase_reflections','spendsense_waiting_items'] loop
    execute format('create trigger spendsense_touch_workspace after insert or update or delete on public.%I for each row execute function public.spendsense_touch_workspace()', table_name);
  end loop;
end $$;
-- Profile deletion is an Auth administration operation, not a frontend reset.
revoke delete on public.spendsense_user_profiles from authenticated;

create function public.spendsense_load_workspace(expected_user_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
set datestyle = 'ISO, YMD' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'revision', p.revision,
    'workspace', jsonb_build_object(
      'profile', jsonb_build_object('email', auth.jwt()->>'email', 'income', p.income_range,
        'savings', p.savings_range, 'onboarded', p.onboarded, 'currency', p.currency,
        'habits', coalesce((select answers from public.spendsense_spending_profiles where user_id = auth.uid()), '[]'::jsonb)),
      'entries', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'type', entry_type,
        'amount', amount, 'cat', category, 'name', name, 'date', entry_date) order by entry_date desc, created_at desc)
        from public.spendsense_money_entries where user_id = auth.uid()), '[]'::jsonb),
      'goals', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', id,
        'name', name, 'target', target, 'saved', saved, 'date', target_date, 'status', status)) order by created_at desc)
        from public.spendsense_savings_goals where user_id = auth.uid()), '[]'::jsonb),
      -- Do not recursively strip nulls from result: pctGoal/delayDays are
      -- deliberately null in the current React analysis when no goal applies.
      'analyses', coalesce((select jsonb_agg((jsonb_build_object('id', id,
        'purchase', purchase, 'result', result, 'createdAt', created_at)
        || case when goal_id is null then '{}'::jsonb else jsonb_build_object('goalId',goal_id) end) order by created_at)
        from public.spendsense_purchase_analyses where user_id = auth.uid()), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(d.purchase || jsonb_strip_nulls(jsonb_build_object('id', d.id,
        'analysisId', d.analysis_id, 'decision', d.decision, 'date', d.decision_date, 'fit', d.fit, 'reflection', r.rating)) order by d.created_at desc)
        from public.spendsense_purchase_decisions d left join public.spendsense_purchase_reflections r
          on r.decision_id = d.id and r.user_id = d.user_id where d.user_id = auth.uid()), '[]'::jsonb),
      'waiting', coalesce((select jsonb_agg(purchase || jsonb_build_object('id', id, 'analysisId', analysis_id,
        'added', added_date, 'review', review_date, 'fit', fit) order by created_at desc)
        from public.spendsense_waiting_items where user_id = auth.uid()), '[]'::jsonb)
    )
  ) from public.spendsense_user_profiles p where p.user_id = auth.uid() and p.user_id = expected_user_id;
$$;

-- One transaction for a UI action (including decision + waiting list + Undo).
-- Revision locking prevents a stale browser tab overwriting a newer workspace.
create function public.spendsense_save_workspace(payload jsonb, expected_revision bigint)
returns bigint language plpgsql volatile security invoker set search_path = ''
set datestyle = 'ISO, YMD' set timezone = 'UTC' as $$
declare
  owner_id uuid := auth.uid();
  stored_revision bigint;
  item jsonb;
  key text;
  table_name text;
  id_column text;
  missing boolean;
  affected integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if payload->>'ownerId' is distinct from owner_id::text then
    raise exception 'Session changed; reload before saving' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 or expected_revision > 9007199254740991 or not public.spendsense_valid_workspace(payload) then
    raise exception 'Invalid or incomplete workspace' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.spendsense_user_profiles(user_id, income_range, savings_range)
      values (owner_id, (payload#>>'{profile,income}')::smallint, (payload#>>'{profile,savings}')::smallint)
      on conflict (user_id) do nothing;
  end if;
  select revision into stored_revision from public.spendsense_user_profiles where user_id = owner_id for update;
  if stored_revision is null or stored_revision <> expected_revision then
    raise exception 'Workspace changed; reload before saving' using errcode = '40001';
  end if;
  -- A missing record is never an instruction to delete it. Every removal needs
  -- an explicit owned ID; a truncated snapshot aborts before any mutation.
  foreach key in array array['entries','goals','analyses','decisions','waiting','reflections'] loop
    table_name := case key when 'entries' then 'spendsense_money_entries'
      when 'goals' then 'spendsense_savings_goals' when 'analyses' then 'spendsense_purchase_analyses'
      when 'decisions' then 'spendsense_purchase_decisions' when 'waiting' then 'spendsense_waiting_items'
      else 'spendsense_purchase_reflections' end;
    id_column := case when key = 'reflections' then 'decision_id' else 'id' end;
    if key <> 'reflections' then
      execute format('select exists (select 1 from public.%I t where user_id = $1 and not exists
        (select 1 from jsonb_array_elements($2->%L) x where (x->>''id'')::uuid = t.%I)
        and not exists (select 1 from jsonb_array_elements($2->''deletions''->%L) x where (x #>> ''{}'')::uuid = t.%I))',
        table_name, key, id_column, key, id_column) into missing using owner_id, payload;
    else
      select exists (select 1 from public.spendsense_purchase_reflections t where user_id = owner_id
        and not exists (select 1 from jsonb_array_elements(payload->'decisions') x where (x->>'id')::uuid = t.decision_id and x ? 'reflection')
        and not exists (select 1 from jsonb_array_elements(payload->'deletions'->'reflections') x where (x #>> '{}')::uuid = t.decision_id)
        and not exists (select 1 from jsonb_array_elements(payload->'deletions'->'decisions') x where (x #>> '{}')::uuid = t.decision_id)) into missing;
    end if;
    if missing then raise exception 'Snapshot omits saved records without explicit deletions' using errcode = '22023'; end if;
    execute format('select exists (select 1 from jsonb_array_elements($2->''deletions''->%L) x
      where not exists (select 1 from public.%I t where user_id = $1 and t.%I = (x #>> ''{}'')::uuid))',
      key, table_name, id_column) into missing using owner_id, payload;
    if missing then raise exception 'Deletion IDs must belong to the current user' using errcode = '42501'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(payload->'decisions') d, jsonb_array_elements(payload->'deletions'->'reflections') r
    where (d->>'id')::uuid = (r #>> '{}')::uuid and d ? 'reflection') then
    raise exception 'Reflection is both saved and deleted' using errcode = '22023';
  end if;
  update public.spendsense_user_profiles set income_range = (payload#>>'{profile,income}')::smallint,
    savings_range = (payload#>>'{profile,savings}')::smallint, onboarded = (payload#>>'{profile,onboarded}')::boolean,
    currency = payload#>>'{profile,currency}' where user_id = owner_id;
  insert into public.spendsense_spending_profiles(user_id, answers, scores)
    values (owner_id, payload#>'{profile,habits}', coalesce(payload->'behaviorScores','{}'::jsonb))
    on conflict (user_id) do update set answers = excluded.answers, scores = excluded.scores, updated_at = now()
      where spendsense_spending_profiles.user_id = owner_id;

  delete from public.spendsense_purchase_reflections where user_id = owner_id and decision_id in
    (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'reflections') x);
  delete from public.spendsense_waiting_items where user_id = owner_id and id in
    (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'waiting') x);
  delete from public.spendsense_purchase_decisions where user_id = owner_id and id in
    (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'decisions') x);
  delete from public.spendsense_purchase_analyses where user_id = owner_id and id in
    (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'analyses') x);
  delete from public.spendsense_savings_goals where user_id = owner_id and id in
    (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'goals') x);
  delete from public.spendsense_money_entries where user_id = owner_id and id in
    (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'entries') x);

  for item in select value from jsonb_array_elements(payload->'entries') loop
    insert into public.spendsense_money_entries(id, user_id, entry_type, amount, category, name, entry_date)
      values ((item->>'id')::uuid, owner_id, item->>'type', (item->>'amount')::numeric, item->>'cat', item->>'name', (item->>'date')::date)
      on conflict (id) do update set entry_type = excluded.entry_type, amount = excluded.amount,
        category = excluded.category, name = excluded.name, entry_date = excluded.entry_date
        where spendsense_money_entries.user_id = owner_id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'goals') loop
    insert into public.spendsense_savings_goals(id, user_id, name, target, saved, target_date, status)
      values ((item->>'id')::uuid, owner_id, item->>'name', (item->>'target')::numeric,
        (item->>'saved')::numeric, (item->>'date')::date, item->>'status')
      on conflict (id) do update set name = excluded.name, target = excluded.target, saved = excluded.saved,
        target_date = excluded.target_date, status = excluded.status
        where spendsense_savings_goals.user_id = owner_id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'analyses') loop
    insert into public.spendsense_purchase_analyses(id, user_id, purchase, result, goal_id, created_at)
      values ((item->>'id')::uuid, owner_id, item->'purchase', item->'result', (item->>'goalId')::uuid, (item->>'createdAt')::timestamptz)
      on conflict (id) do update set purchase = excluded.purchase, result = excluded.result, goal_id = excluded.goal_id
        where spendsense_purchase_analyses.user_id = owner_id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'decisions') loop
    insert into public.spendsense_purchase_decisions(id, user_id, analysis_id, purchase, decision, decision_date, fit)
      values ((item->>'id')::uuid, owner_id, (item->>'analysisId')::uuid,
        item - array['id','analysisId','decision','date','fit','reflection'], item->>'decision', (item->>'date')::date, (item->>'fit')::smallint)
      on conflict (id) do update set analysis_id = excluded.analysis_id, purchase = excluded.purchase,
        decision = excluded.decision, decision_date = excluded.decision_date, fit = excluded.fit
        where spendsense_purchase_decisions.user_id = owner_id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
    if item->>'reflection' is not null then
      insert into public.spendsense_purchase_reflections(decision_id, user_id, rating)
        values ((item->>'id')::uuid, owner_id, (item->>'reflection')::smallint)
        on conflict (decision_id) do update set rating = excluded.rating, updated_at = now()
          where spendsense_purchase_reflections.user_id = owner_id;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'waiting') loop
    insert into public.spendsense_waiting_items(id, user_id, analysis_id, purchase, added_date, review_date, fit)
      values ((item->>'id')::uuid, owner_id, (item->>'analysisId')::uuid,
        item - array['id','analysisId','added','review','fit'], (item->>'added')::date, (item->>'review')::date, (item->>'fit')::smallint)
      on conflict (id) do update set analysis_id = excluded.analysis_id, purchase = excluded.purchase,
        added_date = excluded.added_date, review_date = excluded.review_date, fit = excluded.fit
        where spendsense_waiting_items.user_id = owner_id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
  end loop;
  select revision into stored_revision from public.spendsense_user_profiles where user_id = owner_id;
  return stored_revision;
end;
$$;

revoke all on function public.spendsense_load_workspace(uuid) from public, anon;
revoke all on function public.spendsense_save_workspace(jsonb, bigint) from public, anon;
grant execute on function public.spendsense_load_workspace(uuid) to authenticated;
grant execute on function public.spendsense_save_workspace(jsonb, bigint) to authenticated;
commit;
