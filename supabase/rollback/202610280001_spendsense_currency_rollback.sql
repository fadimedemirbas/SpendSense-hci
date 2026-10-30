-- ROLLBACK for 202610280001_spendsense_currency. NEVER RUN AUTOMATICALLY.
-- This file is deliberately outside supabase/migrations so no tool applies it.
-- Runbook: docs/multi-currency-migration-runbook.md
--
-- WARNING: only for the window after the currency migration and BEFORE any
-- USD/EUR data exists. Dropping the currency columns would make every USD/EUR
-- amount read as lira, so this script refuses to run if any account holds a
-- non-TRY entry, goal, purchase, analysis goal snapshot or display currency.
-- After USD/EUR data exists, recover with a forward fix (a new migration) or,
-- as a last resort, a restore from backup -- never with this script.
--
-- RUN AS: the same role as the migration (Supabase SQL Editor: postgres). One
-- transaction: any failed check leaves the database exactly as it was.
-- What it does: restores the six migration-1 functions verbatim, drops the four
-- functions and three columns the migration added, verifies all 14 migration-1
-- function bodies by md5, and marks the private ledger entry as reverted. Rows,
-- IDs and amounts are untouched; purchases saved meanwhile may keep a
-- "currency": "TRY" key, which migration 1 accepts.
begin;
set local row_security = off;

do $$
declare applied boolean := false;
begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Run this rollback as a role that bypasses RLS (Supabase SQL Editor: postgres); role % cannot see every row', current_user
      using errcode = '42501';
  end if;
  if to_regclass('spendsense_meta.schema_migrations') is not null then
    execute 'select exists (select 1 from spendsense_meta.schema_migrations where version = $1 and status = $2)'
      into applied using '202610280001', 'applied';
  end if;
  if not applied then
    raise exception 'Migration 202610280001 is not recorded as applied; nothing to roll back' using errcode = '55000';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public'
      and ((table_name in ('spendsense_money_entries','spendsense_savings_goals') and column_name = 'currency')
        or (table_name = 'spendsense_user_profiles' and column_name = 'display_currency'))) <> 3 then
    raise exception 'The currency columns are not all present; inspect the database before rolling back' using errcode = '55000';
  end if;
  if exists (select 1 from public.spendsense_money_entries where currency <> 'TRY')
    or exists (select 1 from public.spendsense_savings_goals where currency <> 'TRY')
    or exists (select 1 from public.spendsense_user_profiles where display_currency <> 'TRY')
    or exists (select 1 from public.spendsense_purchase_analyses
      where coalesce(purchase->>'currency','TRY') <> 'TRY' or coalesce(result#>>'{goal,currency}','TRY') <> 'TRY')
    or exists (select 1 from public.spendsense_purchase_decisions where coalesce(purchase->>'currency','TRY') <> 'TRY')
    or exists (select 1 from public.spendsense_waiting_items where coalesce(purchase->>'currency','TRY') <> 'TRY') then
    raise exception 'USD/EUR data exists; rolling back would make it read as TRY. Use a forward fix instead' using errcode = '55000';
  end if;
end $$;

-- Migration-1 functions, verbatim from 202610250001_spendsense.sql.
create or replace function public.spendsense_valid_goal(v jsonb)
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

create or replace function public.spendsense_valid_purchase(v jsonb)
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

create or replace function public.spendsense_valid_analysis(v jsonb)
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

create or replace function public.spendsense_valid_workspace(v jsonb)
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

create or replace function public.spendsense_load_workspace(expected_user_id uuid)
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

create or replace function public.spendsense_save_workspace(payload jsonb, expected_revision bigint)
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

drop function public.spendsense_load_workspace_v3(uuid, integer);
drop function public.spendsense_has_foreign_currency(uuid);
drop function public.spendsense_valid_currency_field(jsonb, integer);
drop function public.spendsense_json_currency(jsonb);
alter table public.spendsense_money_entries drop column currency;
alter table public.spendsense_savings_goals drop column currency;
alter table public.spendsense_user_profiles drop column display_currency;

-- Verify the result is migration 1 exactly before committing.
do $$
declare
  fn record;
  expected constant jsonb := '{"spendsense_json_date": "d7b7b85ba213f9a0983a29b9819e7360",
    "spendsense_json_number": "990f89d17aaf61580544d9695416fc39",
    "spendsense_json_text": "781b67adceff59bff525ea35c3ebc209",
    "spendsense_json_timestamp": "df1eb6209dad693d77dac73ca5c69330",
    "spendsense_json_uuid": "e42ba2cf7b749a0d8c1a4303c9fa3f37",
    "spendsense_load_workspace": "ef7db0aaf14dd44276bffa146301c2de",
    "spendsense_profile_revision": "777813fab2ea8f51924ba11e7ef6a5c6",
    "spendsense_save_workspace": "c361b5f50374d1deb29846d1256271a3",
    "spendsense_touch_workspace": "e6143592768724941a66be78d6459c09",
    "spendsense_valid_analysis": "1459e26ecaf5d206e670790ded6c76ae",
    "spendsense_valid_behavior": "f6e7424ba3f7802c958cc3bf569a9d03",
    "spendsense_valid_goal": "0af8a561ac6b822846c38c432309aeab",
    "spendsense_valid_purchase": "ad9f1fbd17661882dcf5b3eed48d202f",
    "spendsense_valid_workspace": "7f7e0831df50199b938f2d2ae9a6bc12"}';
begin
  for fn in select key as name, value #>> '{}' as hash from jsonb_each(expected) loop
    if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = fn.name) <> 1
      or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = fn.name
        and md5(replace(prosrc, E'\r', '')) = fn.hash) then
      raise exception 'public.% does not match migration 202610250001 after rollback', fn.name using errcode = '55000';
    end if;
  end loop;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in
      ('spendsense_json_currency','spendsense_valid_currency_field','spendsense_has_foreign_currency','spendsense_load_workspace_v3')) then
    raise exception 'Currency functions are still present after rollback' using errcode = '55000';
  end if;
end $$;

update spendsense_meta.schema_migrations
  set status = 'reverted', recorded_at = now(), recorded_by = current_user,
    notes = 'Rolled back with supabase/rollback/202610280001_spendsense_currency_rollback.sql'
  where version = '202610280001';
commit;
