alter table public.cosmos_preferences
  add column preferred_model text,
  add column calculator_enabled boolean not null default false;