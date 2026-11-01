create extension if not exists pgcrypto;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_id_user_unique unique (id, user_id)
);

create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now(),
  constraint messages_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete cascade
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create table public.cosmos_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1200),
  created_at timestamptz not null default now()
);

create index cosmos_memories_user_created_idx
  on public.cosmos_memories (user_id, created_at desc);

create table public.cosmos_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  memory_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.cosmos_memories enable row level security;
alter table public.cosmos_preferences enable row level security;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.cosmos_memories to authenticated;
grant select, insert, update, delete on public.cosmos_preferences to authenticated;

create policy "Users manage their conversations"
  on public.conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their messages"
  on public.messages for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.id = conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create policy "Users manage their memories"
  on public.cosmos_memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their preferences"
  on public.cosmos_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);