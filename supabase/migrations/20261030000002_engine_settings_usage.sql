alter table public.cosmos_preferences
  add column provider_id text not null default 'openrouter'
    check (provider_id in ('openrouter', 'openai-compatible', 'ollama')),
  add column fallback_provider text
    check (fallback_provider is null or fallback_provider in ('openrouter', 'openai-compatible', 'ollama')),
  add column fallback_model text,
  add column temperature real not null default 0.7 check (temperature between 0 and 2),
  add column max_output_tokens integer not null default 2048 check (max_output_tokens between 64 and 8192),
  add column system_instructions text
    check (system_instructions is null or char_length(system_instructions) <= 4000);

create table public.cosmos_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  provider_id text not null check (provider_id in ('openrouter', 'openai-compatible', 'ollama')),
  model_id text not null check (char_length(model_id) between 1 and 160),
  fallback_used boolean not null default false,
  usage_estimated boolean not null default false,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint cosmos_usage_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete cascade
);

create index cosmos_usage_user_created_idx on public.cosmos_usage (user_id, created_at desc);
alter table public.cosmos_usage enable row level security;
grant select, insert on public.cosmos_usage to authenticated;

create policy "Users view their model usage"
  on public.cosmos_usage for select
  using (auth.uid() = user_id);

create policy "Users record their model usage"
  on public.cosmos_usage for insert
  with check (auth.uid() = user_id);