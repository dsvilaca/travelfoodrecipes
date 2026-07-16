-- Porções por receita (referência para macros por pessoa)
-- Corre no SQL Editor do Supabase se a tabela recipes já existir.

alter table public.recipes
  add column if not exists servings int not null default 2
  check (servings >= 1 and servings <= 12);

comment on column public.recipes.servings is
  'Número de porções/pessoas de referência da receita completa';
