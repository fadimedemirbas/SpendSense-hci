-- SpendSense savings holdings (Birikim). Prepared for review only.
-- Do not apply to the shared project without approval. Requires 202610280001.
--
-- RUN AS: the same role as 202610280001 (Supabase SQL Editor: postgres).
--
-- A holding is money or an asset put aside without a goal: salary surplus, gold,
-- silver, crypto or other savings. It is stored as entered and never valued:
--   * Salary surplus / Other: an amount in TRY, USD or EUR ("unit" = currency).
--   * Gold / Silver: grams ("unit" = 'g'); Crypto: a quantity of a coin ("unit" =
--     its symbol, e.g. BTC). Up to 8 decimals.
--   * Gold, Silver and Crypto may carry the price paid per unit, as a reminder.
--
-- Client protocol 4 (new): loads with spendsense_load_workspace_v4(uuid, 4), which
-- is the v3 response plus "holdings" and "protocol": 4; saves with schemaVersion 4,
-- which must include "holdings" and "deletions.holdings". Protocol 1 and 3 clients
-- are unchanged: they never see holdings, and their saves leave holdings untouched
-- (holdings are not part of their snapshot, so nothing is deleted).
--
-- Additive only: one new table (RLS forced, owner-only policy), two new functions,
-- and replacements for three validators/RPCs. No existing row is changed.
-- Rollback (only while no holding exists):
--   supabase/rollback/202611010001_spendsense_holdings_rollback.sql
begin;
set local row_security = off;

do $$
declare applied boolean := false; already boolean := false;
begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Run this migration as a role that bypasses RLS (Supabase SQL Editor: postgres); role % cannot see every row', current_user
      using errcode = '42501';
  end if;
  if to_regclass('spendsense_meta.schema_migrations') is not null then
    execute 'select exists (select 1 from spendsense_meta.schema_migrations where version = $1 and status = $2)'
      into applied using '202610280001', 'applied';
    execute 'select exists (select 1 from spendsense_meta.schema_migrations where version = $1 and status = $2)'
      into already using '202611010001', 'applied';
  end if;
  if not applied then
    raise exception 'Migration 202610280001 must be applied first' using errcode = '55000';
  end if;
  if already then
    raise exception 'Migration 202611010001 is already applied (spendsense_meta.schema_migrations)' using errcode = '55000';
  end if;
  if to_regclass('public.spendsense_savings_holdings') is not null
    or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('spendsense_valid_holding','spendsense_load_workspace_v4')) then
    raise exception 'Objects of migration 202611010001 already exist; it (or a draft of it) was applied before' using errcode = '55000';
  end if;
end $$;

create table public.spendsense_savings_holdings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('Salary surplus','Gold','Silver','Crypto','Other')),
  quantity numeric(20,8) not null check (quantity > 0 and quantity <> 'NaN'::numeric),
  unit text not null check (unit ~ '^[A-Za-z0-9]{1,10}$'),
  name text not null check (length(btrim(name)) between 1 and 500),
  holding_date date not null check (isfinite(holding_date)),
  price numeric(14,2) check (price is null or (price > 0 and price <> 'NaN'::numeric)),
  price_currency text check (price_currency is null or price_currency in ('TRY','USD','EUR')),
  created_at timestamptz not null default now(),
  check ((price is null) = (price_currency is null))
);
alter table public.spendsense_savings_holdings enable row level security;
alter table public.spendsense_savings_holdings force row level security;
revoke all on public.spendsense_savings_holdings from public, anon, authenticated;
grant select, insert, update, delete on public.spendsense_savings_holdings to authenticated;
create policy owner_only on public.spendsense_savings_holdings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index on public.spendsense_savings_holdings (user_id);
create trigger spendsense_touch_workspace after insert or update or delete on public.spendsense_savings_holdings
  for each row execute function public.spendsense_touch_workspace();

create function public.spendsense_valid_holding(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare money boolean;
begin
  if jsonb_typeof(v) is distinct from 'object' or not v ?& array['id','kind','quantity','unit','name','date'] then return false; end if;
  money := v->>'kind' in ('Salary surplus','Other');
  return coalesce(public.spendsense_json_uuid(v->'id')
    and v->>'kind' in ('Salary surplus','Gold','Silver','Crypto','Other')
    and public.spendsense_json_text(v->'name',500) and public.spendsense_json_date(v->'date')
    and case when money then
        public.spendsense_json_number(v->'quantity',0.01,999999999999.99)
        and round((v->>'quantity')::numeric,2) = (v->>'quantity')::numeric
        and public.spendsense_json_currency(v->'unit')
        and not v ? 'price' and not v ? 'priceCurrency'
      else
        public.spendsense_json_number(v->'quantity',0.00000001,999999999999.99999999)
        and round((v->>'quantity')::numeric,8) = (v->>'quantity')::numeric
        and jsonb_typeof(v->'unit') = 'string'
        and case when v->>'kind' = 'Crypto' then (v->>'unit') ~ '^[A-Z0-9]{1,10}$' else v->>'unit' = 'g' end
        and ((not v ? 'price' and not v ? 'priceCurrency')
          or (public.spendsense_json_number(v->'price',0.01,999999999999.99)
            and round((v->>'price')::numeric,2) = (v->>'price')::numeric
            and public.spendsense_json_currency(v->'priceCurrency')))
      end, false);
exception when others then return false;
end;
$$;

-- Protocols 3 and 4 both require explicit currencies.
create or replace function public.spendsense_valid_currency_field(item jsonb, version integer)
returns boolean language sql immutable set search_path = '' as $$
  select case when version in (3,4) then public.spendsense_json_currency(item->'currency')
    else coalesce(not item ? 'currency' or item->'currency' = '"TRY"'::jsonb, false) end;
$$;

create or replace function public.spendsense_valid_workspace(v jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare k text; item jsonb; p jsonb; version integer; keys text[];
begin
  if jsonb_typeof(v) is distinct from 'object'
    or not coalesce(v->'schemaVersion' in ('1'::jsonb, '3'::jsonb, '4'::jsonb), false)
    or not public.spendsense_json_uuid(v->'ownerId') or jsonb_typeof(v->'deletions') is distinct from 'object' then return false; end if;
  version := (v->>'schemaVersion')::integer;
  p := v->'profile';
  if jsonb_typeof(p) is distinct from 'object' or not p ?& array['income','savings','onboarded','currency','habits']
    or not public.spendsense_json_number(p->'income',0,4,true) or not public.spendsense_json_number(p->'savings',0,4,true)
    or jsonb_typeof(p->'onboarded') is distinct from 'boolean' or p->>'currency' not in ('symbol','code')
    or not public.spendsense_valid_behavior(p->'habits',v->'behaviorScores')
    or (p->>'onboarded' = 'true' and jsonb_array_length(p->'habits') <> 4) then return false; end if;
  -- Protocol 1 clients may echo a displayCurrency; it is never written from them.
  if (version >= 3 or p ? 'displayCurrency') and not public.spendsense_json_currency(p->'displayCurrency') then return false; end if;
  -- Only protocol 4 knows holdings; older snapshots leave them untouched.
  keys := array['entries','goals','analyses','decisions','waiting','reflections']
    || case when version = 4 then array['holdings'] else array[]::text[] end;
  foreach k in array keys loop
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
        and public.spendsense_json_date(item->'date')
        and public.spendsense_valid_currency_field(item, version), false) then return false; end if;
      if k = 'goals' and not (public.spendsense_valid_goal(item)
        and public.spendsense_valid_currency_field(item, version)) then return false; end if;
      if k = 'holdings' and not public.spendsense_valid_holding(item) then return false; end if;
      if k = 'analyses' then
        if not public.spendsense_valid_purchase(item->'purchase') or not public.spendsense_valid_analysis(item->'result')
          or not public.spendsense_valid_currency_field(item->'purchase', version)
          or not public.spendsense_json_timestamp(item->'createdAt')
          or (item ? 'goalId' and item->'goalId' <> 'null'::jsonb and not public.spendsense_json_uuid(item->'goalId'))
          or (item->>'goalId' is not null and item#>>'{result,goal,id}' is distinct from item->>'goalId') then return false; end if;
      end if;
      if k in ('decisions','waiting') then
        if not public.spendsense_valid_purchase(item) or not public.spendsense_json_uuid(item->'analysisId')
          or not public.spendsense_valid_currency_field(item, version)
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

-- Protocol 4: the protocol 3 response plus the holdings.
create function public.spendsense_load_workspace_v4(expected_user_id uuid, client_protocol integer)
returns jsonb language plpgsql stable security invoker set search_path = ''
set datestyle = 'ISO, YMD' set timezone = 'UTC' as $$
declare loaded jsonb;
begin
  if client_protocol is distinct from 4 then
    raise exception 'Unsupported client protocol' using errcode = '22023';
  end if;
  loaded := public.spendsense_load_workspace_v3(expected_user_id, 3);
  if loaded is null then return null; end if;
  return jsonb_set(loaded || jsonb_build_object('protocol', 4), '{workspace,holdings}',
    coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', id, 'kind', kind,
      'quantity', quantity, 'unit', unit, 'name', name, 'date', holding_date,
      'price', price, 'priceCurrency', price_currency)) order by holding_date desc, created_at desc)
      from public.spendsense_savings_holdings where user_id = auth.uid()), '[]'::jsonb));
end;
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
  version integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if payload->>'ownerId' is distinct from owner_id::text then
    raise exception 'Session changed; reload before saving' using errcode = '42501';
  end if;
  -- A protocol 1 client only knows lira. Once the account holds USD/EUR records it
  -- must update before saving rather than overwrite them. Checked first so echoed
  -- USD/EUR fields report this, not a validation error.
  if payload->'schemaVersion' = '1'::jsonb and public.spendsense_has_foreign_currency(owner_id) then
    raise exception 'This workspace uses multiple currencies; update SpendSense before saving' using errcode = '0A000';
  end if;
  if expected_revision is null or expected_revision < 0 or expected_revision > 9007199254740991 or not public.spendsense_valid_workspace(payload) then
    raise exception 'Invalid or incomplete workspace' using errcode = '22023';
  end if;
  version := (payload->>'schemaVersion')::integer;
  if expected_revision = 0 then
    insert into public.spendsense_user_profiles(user_id, income_range, savings_range, display_currency)
      values (owner_id, (payload#>>'{profile,income}')::smallint, (payload#>>'{profile,savings}')::smallint,
        case when version >= 3 then payload#>>'{profile,displayCurrency}' else 'TRY' end)
      on conflict (user_id) do nothing;
  end if;
  select revision into stored_revision from public.spendsense_user_profiles where user_id = owner_id for update;
  if stored_revision is null or stored_revision <> expected_revision then
    raise exception 'Workspace changed; reload before saving' using errcode = '40001';
  end if;
  -- Re-checked under the profile row lock, in case a version 2 save landed in between.
  if version = 1 and public.spendsense_has_foreign_currency(owner_id) then
    raise exception 'This workspace uses multiple currencies; update SpendSense before saving' using errcode = '0A000';
  end if;
  -- A missing record is never an instruction to delete it. Every removal needs
  -- an explicit owned ID; a truncated snapshot aborts before any mutation.
  -- Holdings are part of the snapshot only for protocol 4.
  foreach key in array array['entries','goals','analyses','decisions','waiting','reflections']
      || case when version = 4 then array['holdings'] else array[]::text[] end loop
    table_name := case key when 'entries' then 'spendsense_money_entries'
      when 'goals' then 'spendsense_savings_goals' when 'analyses' then 'spendsense_purchase_analyses'
      when 'decisions' then 'spendsense_purchase_decisions' when 'waiting' then 'spendsense_waiting_items'
      when 'holdings' then 'spendsense_savings_holdings'
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
    currency = payload#>>'{profile,currency}',
    display_currency = case when version >= 3 then payload#>>'{profile,displayCurrency}' else display_currency end
    where user_id = owner_id;
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
  if version = 4 then
    delete from public.spendsense_savings_holdings where user_id = owner_id and id in
      (select (x #>> '{}')::uuid from jsonb_array_elements(payload->'deletions'->'holdings') x);
  end if;

  -- Protocol 1 never changes a stored currency (new protocol 1 rows are TRY).
  for item in select value from jsonb_array_elements(payload->'entries') loop
    insert into public.spendsense_money_entries(id, user_id, entry_type, amount, currency, category, name, entry_date)
      values ((item->>'id')::uuid, owner_id, item->>'type', (item->>'amount')::numeric,
        coalesce(item->>'currency', 'TRY'), item->>'cat', item->>'name', (item->>'date')::date)
      on conflict (id) do update set entry_type = excluded.entry_type, amount = excluded.amount,
        currency = case when version >= 3 then excluded.currency else spendsense_money_entries.currency end,
        category = excluded.category, name = excluded.name, entry_date = excluded.entry_date
        where spendsense_money_entries.user_id = owner_id;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
  end loop;
  for item in select value from jsonb_array_elements(payload->'goals') loop
    insert into public.spendsense_savings_goals(id, user_id, name, target, saved, currency, target_date, status)
      values ((item->>'id')::uuid, owner_id, item->>'name', (item->>'target')::numeric,
        (item->>'saved')::numeric, coalesce(item->>'currency', 'TRY'), (item->>'date')::date, item->>'status')
      on conflict (id) do update set name = excluded.name, target = excluded.target, saved = excluded.saved,
        currency = case when version >= 3 then excluded.currency else spendsense_savings_goals.currency end,
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
  if version = 4 then
    for item in select value from jsonb_array_elements(payload->'holdings') loop
      insert into public.spendsense_savings_holdings(id, user_id, kind, quantity, unit, name, holding_date, price, price_currency)
        values ((item->>'id')::uuid, owner_id, item->>'kind', (item->>'quantity')::numeric, item->>'unit',
          item->>'name', (item->>'date')::date, (item->>'price')::numeric, item->>'priceCurrency')
        on conflict (id) do update set kind = excluded.kind, quantity = excluded.quantity, unit = excluded.unit,
          name = excluded.name, holding_date = excluded.holding_date, price = excluded.price,
          price_currency = excluded.price_currency
          where spendsense_savings_holdings.user_id = owner_id;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Record is not owned by current user' using errcode = '42501'; end if;
    end loop;
  end if;
  select revision into stored_revision from public.spendsense_user_profiles where user_id = owner_id;
  return stored_revision;
end;
$$;

revoke all on function public.spendsense_load_workspace_v4(uuid, integer) from public, anon;
revoke all on function public.spendsense_save_workspace(jsonb, bigint) from public, anon;
grant execute on function public.spendsense_load_workspace_v4(uuid, integer) to authenticated;
grant execute on function public.spendsense_save_workspace(jsonb, bigint) to authenticated;

insert into spendsense_meta.schema_migrations(version, name, status)
  values ('202611010001', 'spendsense_holdings', 'applied')
  on conflict (version) do update set status = 'applied', recorded_at = now(), recorded_by = current_user, notes = null;
commit;
