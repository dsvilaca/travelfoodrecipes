-- Corre no SQL Editor do Supabase (Run) — uma vez
-- Passa de categorias (proteína/bases/frescos) para várias listas de compras

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shopping_lists_user_idx
  on public.shopping_lists (user_id, sort_order, created_at);

alter table public.shopping_items
  add column if not exists list_id uuid references public.shopping_lists (id) on delete cascade;

-- categoria deixa de ser obrigatória / restrita
alter table public.shopping_items drop constraint if exists shopping_items_category_check;
alter table public.shopping_items alter column category set default '';
alter table public.shopping_items alter column category drop not null;

-- Migrar itens antigos (com categoria) para uma lista "Lista principal" por utilizador
insert into public.shopping_lists (user_id, name, sort_order)
select distinct si.user_id, 'Lista principal', 0
from public.shopping_items si
where si.list_id is null
  and not exists (
    select 1 from public.shopping_lists sl
    where sl.user_id = si.user_id and sl.name = 'Lista principal'
  );

update public.shopping_items si
set list_id = sl.id,
    category = coalesce(si.category, '')
from public.shopping_lists sl
where si.list_id is null
  and sl.user_id = si.user_id
  and sl.name = 'Lista principal';

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

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

grant select, insert, update, delete on public.shopping_lists to authenticated;

alter table public.shopping_lists alter column user_id set default auth.uid();
