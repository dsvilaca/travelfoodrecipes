-- Corre no SQL Editor do Supabase (Run) — uma vez
-- Alimentos a excluir (alergias / intolerâncias personalizadas)

alter table public.user_preferences
  add column if not exists exclude_foods text[] not null default '{}';
