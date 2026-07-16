-- Travel Food Recipes — schema Supabase
-- Corre isto no SQL Editor do projeto (Run)

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

-- Lista de compras
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  category text not null check (category in ('proteina', 'bases', 'frescos')),
  checked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shopping_user_cat_idx
  on public.shopping_items (user_id, category, sort_order);

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

-- Default user_id = utilizador autenticado (também em tabelas já criadas)
alter table public.recipes alter column user_id set default auth.uid();
alter table public.shopping_items alter column user_id set default auth.uid();

-- Permissões da API (além do RLS)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
