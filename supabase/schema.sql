-- Travel Food Recipes — schema Supabase
-- Corre isto no SQL Editor do projeto (Run)
-- Se já tinhas a versão antiga com categorias, corre também migration-shopping-lists.sql

create extension if not exists "pgcrypto";

-- Receitas
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null check (section in ('manha', 'praia', 'lanches', 'jantar')),
  title text not null,
  subtitle text not null default '',
  protein_note text not null default '',
  tags text[] not null default '{}',
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  note text not null default '',
  is_favorite boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_user_section_idx
  on public.recipes (user_id, section, sort_order);

-- Listas de compras (várias por utilizador)
create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shopping_lists_user_idx
  on public.shopping_lists (user_id, sort_order, created_at);

-- Itens de uma lista
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid references public.shopping_lists (id) on delete cascade,
  label text not null,
  category text not null default '',
  checked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shopping_user_list_idx
  on public.shopping_items (user_id, list_id, sort_order);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- RLS
alter table public.recipes enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "recipes_select_own" on public.recipes;
drop policy if exists "recipes_insert_own" on public.recipes;
drop policy if exists "recipes_update_own" on public.recipes;
drop policy if exists "recipes_delete_own" on public.recipes;

create policy "recipes_select_own" on public.recipes
  for select using (auth.uid() = user_id);
create policy "recipes_insert_own" on public.recipes
  for insert with check (auth.uid() = user_id);
create policy "recipes_update_own" on public.recipes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recipes_delete_own" on public.recipes
  for delete using (auth.uid() = user_id);

drop policy if exists "lists_select_own" on public.shopping_lists;
drop policy if exists "lists_insert_own" on public.shopping_lists;
drop policy if exists "lists_update_own" on public.shopping_lists;
drop policy if exists "lists_delete_own" on public.shopping_lists;

create policy "lists_select_own" on public.shopping_lists
  for select using (auth.uid() = user_id);
create policy "lists_insert_own" on public.shopping_lists
  for insert with check (auth.uid() = user_id);
create policy "lists_update_own" on public.shopping_lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lists_delete_own" on public.shopping_lists
  for delete using (auth.uid() = user_id);

drop policy if exists "shopping_select_own" on public.shopping_items;
drop policy if exists "shopping_insert_own" on public.shopping_items;
drop policy if exists "shopping_update_own" on public.shopping_items;
drop policy if exists "shopping_delete_own" on public.shopping_items;

create policy "shopping_select_own" on public.shopping_items
  for select using (auth.uid() = user_id);
create policy "shopping_insert_own" on public.shopping_items
  for insert with check (auth.uid() = user_id);
create policy "shopping_update_own" on public.shopping_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shopping_delete_own" on public.shopping_items
  for delete using (auth.uid() = user_id);

-- Preferências alimentares (perfil / restrições)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  diet text[] not null default '{}',
  exclude_foods text[] not null default '{}',
  updated_at timestamptz not null default now()
);

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

alter table public.recipes alter column user_id set default auth.uid();
alter table public.shopping_lists alter column user_id set default auth.uid();
alter table public.shopping_items alter column user_id set default auth.uid();

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.shopping_lists to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
