# Travel Food Recipes

App web de receitas e lista de compras para férias. Funciona no **browser** (computador ou telemóvel) e pode ser adicionada ao ecrã principal como PWA.

**App:** https://dsvilaca.github.io/travelfoodrecipes/

## O que é o quê

| Serviço | Função |
|---------|--------|
| **GitHub Pages** | Hospeda a app online |
| **Supabase** | Base de dados + autenticação |

## Funcionalidades

- Criar conta / iniciar sessão
- Receitas por secção (manhã, praia, lanches, jantar)
- Criar, editar e apagar receitas
- Favoritos
- Lista de compras sincronizada na conta

## Setup (Supabase)

1. No projeto Supabase → **SQL Editor** → corre [`supabase/schema.sql`](supabase/schema.sql)
2. **Project Settings → API** → copia Project URL e chave `anon` / publishable
3. Cola em [`js/config.js`](js/config.js) (usa [`js/config.example.js`](js/config.example.js) como modelo)
4. **Authentication → Providers → Email** → ativa Email e **desliga Confirm email** (uso pessoal / MVP)
5. **Authentication → URL Configuration**
   - Site URL: `https://TEU_USER.github.io/TEU_REPO/`
   - Redirect URLs: `https://TEU_USER.github.io/TEU_REPO/**`

## Segurança

- A chave **anon/publishable** é pública por desenho; a proteção são as políticas RLS
- **Nunca** commits a `service_role` / secret key, passwords de utilizadores, nem dados pessoais de clientes
- Não uses a password da base de dados no frontend
- Se este repositório for público, trata emails/passwords de teste como comprometidos e roda-os

## Desenvolvimento local

Serve a pasta do projeto com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 5500
```

Abre `http://localhost:5500`.
