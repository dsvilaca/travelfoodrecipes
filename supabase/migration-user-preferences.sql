-- Corre no SQL Editor do Supabase (Run) — uma vez
-- Preferências alimentares por utilizador (restrições do perfil)

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  diet text[] not null default '{}',
  exclude_foods text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_preferences
  add column if not exists exclude_foods text[] not null default '{}';

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists "prefs_select_own" on public.user_preferences;
drop policy if exists "prefs_insert_own" on public.user_preferences;
drop policy if exists "prefs_update_own" on public.user_preferences;
drop policy if exists "prefs_delete_own" on public.user_preferences;

create policy "prefs_select_own" on public.user_preferences
  for select using (auth.uid() = user_id);
create policy "prefs_insert_own" on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy "prefs_update_own" on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "prefs_delete_own" on public.user_preferences
  for delete using (auth.uid() = user_id);
