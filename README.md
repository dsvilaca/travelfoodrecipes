# Maré

App de refeições de férias (PWA) com receitas e lista de compras no **Supabase**.

## O que é o quê

| Serviço | Função |
|---------|--------|
| **GitHub** | Código + Cursor no iPhone + GitHub Pages (app online) |
| **Supabase** | Base de dados + login (receitas, lista, favoritos) |

Não precisas de “ligar” GitHub ao Supabase. A app no Pages fala diretamente com o Supabase.

## Setup rápido

### 1) Supabase (SQL + chave)

1. Abre o projeto → **SQL Editor** → cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**
2. **Project Settings → API** → copia:
   - Project URL
   - chave **`anon` `public`** (começa por `eyJ...`)
3. Cola a anon key em [`js/config.js`](js/config.js)
4. (Recomendado para uso pessoal) **Authentication → Providers → Email** → desliga **Confirm email**
5. **Não uses** a password da base de dados no frontend

### 2) GitHub + Pages

1. Em github.com: **New repository** → nome `Recipes` → **público** (mais simples no plano grátis) → Create (sem README)
2. No PC, na pasta do projeto:

```bash
git init
git add .
git commit -m "Maré: app com Supabase"
git branch -M main
git remote add origin https://github.com/TEU_USER/Recipes.git
git push -u origin main
```

3. No repo: **Settings → Pages → Deploy from branch → `main` / root → Save**
4. Abre `https://TEU_USER.github.io/Recipes/`
5. iPhone: Safari → Partilhar → **Adicionar ao Ecrã Principal**
6. Cursor iPhone: abre o repo `Recipes` e usa cloud agents

### 3) Primeiro login na app

1. Abre a app → **Criar conta nova** (email + password)
2. Na primeira entrada, as receitas e a lista iniciais são carregadas automaticamente

## Funcionalidades

- Receitas por secção (manhã, praia, lanches, jantar)
- Criar / editar / apagar receitas
- Favoritos
- Lista de compras: adicionar, marcar, apagar
- Cache local se ficares offline (UI + últimos dados)

## Segurança

- A chave **anon** é pública por desenho; a proteção são as políticas RLS (só vês os teus dados com login)
- A **password da base de dados** nunca vai para o código nem para o GitHub
- Se partilhaste a password da BD por engano: **Project Settings → Database → reset database password**
