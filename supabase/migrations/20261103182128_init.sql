-- Every write goes through the website's /api/runs handler using the secret
-- key (which bypasses RLS). Browsers only ever read the public_* views.

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  source text not null default 'community' check (source in ('official', 'community')),
  channel text not null check (channel in ('api', 'harness')),
  model_id text not null check (length(model_id) between 1 and 128),
  provider text not null check (length(provider) between 1 and 64),
  harness text check (length(harness) between 1 and 64),
  harness_version text check (length(harness_version) between 1 and 64),

  questionnaire_version text not null,
  prompt_version int not null,
  protocol_version int not null,
  seed bigint not null,
  item_order text[] not null,
  answers jsonb not null,

  -- Recomputed by the server from `answers`; clients' own scores are never stored.
  type text not null check (type ~ '^[EI][SN][FT][JP]$'),
  score_ie real not null check (score_ie between 0 and 100),
  score_sn real not null check (score_sn between 0 and 100),
  score_ft real not null check (score_ft between 0 and 100),
  score_jp real not null check (score_jp between 0 and 100),

  client_name text not null,
  client_version text not null,
  nickname text check (length(nickname) between 1 and 32),

  -- Salted hashes only, used for rate limiting and dedup; never exposed.
  device_hash text,
  ip_hash text,
  submission_hash text not null unique,

  flags text[] not null default '{}',
  weight real not null default 1 check (weight between 0 and 1),
  hidden boolean not null default false,

  constraint harness_matches_channel check ((channel = 'harness') = (harness is not null))
);

create index runs_group_idx on public.runs (model_id, provider, channel, harness) where not hidden;
create index runs_recent_idx on public.runs (created_at desc) where not hidden;
create index runs_ip_idx on public.runs (ip_hash, created_at);
create index runs_device_idx on public.runs (device_hash, created_at);

alter table public.runs enable row level security;
revoke all on public.runs from anon, authenticated;

-- Maps spellings people actually submit ("DeepSeek-Flash", "claude code") to one name.
create table public.aliases (
  kind text not null check (kind in ('model', 'provider', 'harness')),
  alias text not null,
  canonical text not null,
  primary key (kind, alias)
);

alter table public.aliases enable row level security;
revoke all on public.aliases from anon, authenticated;

create function public.canonical_name(k text, v text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select a.canonical from public.aliases a where a.kind = k and a.alias = lower(btrim(v))),
    lower(btrim(v))
  )
$$;

create function public.runs_canonicalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.model_id := public.canonical_name('model', new.model_id);
  new.provider := public.canonical_name('provider', new.provider);
  if new.harness is not null then
    new.harness := public.canonical_name('harness', new.harness);
  end if;
  return new;
end
$$;

create trigger runs_canonicalize before insert or update of model_id, provider, harness
on public.runs for each row execute function public.runs_canonicalize();

insert into public.aliases (kind, alias, canonical) values
  ('harness', 'claude code', 'claude-code'),
  ('harness', 'claudecode', 'claude-code'),
  ('harness', 'claude', 'claude-code'),
  ('harness', 'open code', 'opencode'),
  ('harness', 'open-code', 'opencode'),
  ('harness', 'codex-cli', 'codex'),
  ('harness', 'codex cli', 'codex');

-- Public read surface. These views run with the owner's rights on purpose
-- (security_invoker = false): anon has no access to `runs` itself, and the
-- views are what limits it to non-hidden rows without hashes.

create view public.public_runs with (security_invoker = false) as
select
  id, created_at, source, channel, model_id, provider, harness, harness_version,
  questionnaire_version, prompt_version, seed, item_order, answers,
  type, score_ie, score_sn, score_ft, score_jp,
  client_name, client_version, nickname, flags, weight
from public.runs
where not hidden;

create view public.public_group_stats with (security_invoker = false) as
select
  channel,
  model_id,
  provider,
  coalesce(harness, '') as harness,
  count(*)::int as runs,
  count(*) filter (where source = 'official')::int as official_runs,
  sum(weight)::real as effective_runs,
  (sum(score_ie * weight) / sum(weight))::real as ie_mean,
  (sum(score_sn * weight) / sum(weight))::real as sn_mean,
  (sum(score_ft * weight) / sum(weight))::real as ft_mean,
  (sum(score_jp * weight) / sum(weight))::real as jp_mean,
  coalesce(stddev_samp(score_ie), 0)::real as ie_sd,
  coalesce(stddev_samp(score_sn), 0)::real as sn_sd,
  coalesce(stddev_samp(score_ft), 0)::real as ft_sd,
  coalesce(stddev_samp(score_jp), 0)::real as jp_sd,
  max(created_at) as last_run_at
from public.runs
where not hidden and weight > 0
group by channel, model_id, provider, coalesce(harness, '');

create view public.public_type_counts with (security_invoker = false) as
select channel, model_id, provider, coalesce(harness, '') as harness, type, count(*)::int as runs
from public.runs
where not hidden and weight > 0
group by channel, model_id, provider, coalesce(harness, ''), type;

grant select on public.public_runs, public.public_group_stats, public.public_type_counts to anon, authenticated;

-- The project is created with "automatically expose new tables" off, so even
-- the server's secret key (service_role) gets nothing unless granted here.
grant usage on schema public to service_role;
grant select, insert, update on public.runs to service_role;
grant select, insert, update, delete on public.aliases to service_role;
grant select on public.public_runs, public.public_group_stats, public.public_type_counts to service_role;
grant execute on function public.canonical_name(text, text) to service_role;
