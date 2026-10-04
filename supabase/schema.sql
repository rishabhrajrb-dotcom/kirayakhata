-- KirayaKhata — Supabase schema
-- Run in Supabase → SQL Editor. Safe to re-run.
-- Stores anonymised, structured inputs only: no names, PAN, GSTIN, emails,
-- phone numbers, addresses or free text.

create extension if not exists pgcrypto;

create table if not exists rent_closures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visitor_id text not null,
  input jsonb not null,
  rules_result jsonb not null,
  output jsonb,
  scenario_code text,
  rent_amount numeric,
  language text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  used_fallback boolean default false,
  rules_version text,
  config_version text,
  request_hash text,
  gemini_error_code text,
  -- additions used by the live usage strip
  shortfall_amount numeric default 0,
  tds_mismatch_amount numeric default 0,
  refused boolean default false,
  is_example boolean default false,
  status text
);

create index if not exists rent_closures_visitor_created_idx on rent_closures (visitor_id, created_at desc);
create index if not exists rent_closures_created_idx on rent_closures (created_at desc);
create index if not exists rent_closures_scenario_idx on rent_closures (scenario_code);

-- Row Level Security on, and NO policies: the anon/public keys can neither read
-- nor write. Only the server (service key, held in Vercel) can access the table.
alter table rent_closures enable row level security;

-- Aggregates for /api/stats. Returns numbers only, never rows.
create or replace function kk_stats()
returns table (
  total_rent_checked numeric,
  months_closed bigint,
  caught_amount numeric,
  most_common_scenario text
)
language sql
stable
security invoker
as $$
  select
    coalesce(sum(rent_amount), 0) as total_rent_checked,
    count(*) as months_closed,
    coalesce(sum(coalesce(shortfall_amount, 0) + coalesce(tds_mismatch_amount, 0)), 0) as caught_amount,
    (select scenario_code from rent_closures
       where refused = false
       group by scenario_code order by count(*) desc, scenario_code limit 1) as most_common_scenario
  from rent_closures
  where refused = false;
$$;

revoke all on function kk_stats() from public, anon, authenticated;
grant execute on function kk_stats() to service_role;

-- ---------- Queries for the assignment worksheet ----------
-- Last 5 rows:
--   select created_at, scenario_code, rent_amount, language, input_tokens, output_tokens,
--          used_fallback, output->>'what_this_means' as explanation
--   from rent_closures order by created_at desc limit 5;
-- Average token usage:
--   select round(avg(input_tokens)) as avg_input, round(avg(output_tokens)) as avg_output,
--          round(avg(latency_ms)) as avg_latency_ms, count(*) as requests
--   from rent_closures where input_tokens is not null;
