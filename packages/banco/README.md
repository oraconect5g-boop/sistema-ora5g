# Banco de dados (Supabase)

Migrations em `supabase/migrations/`, aplicadas em ordem pelo nome. Reversões (só para banco sem dados reais) em `supabase/reversao/`.

| Migration | O que faz |
|---|---|
| `20261107120000_fundacao_acesso.sql` | ADR-002: organização, empresas, unidades, perfis, papéis, permissões, vínculos, contexto da sessão e auditoria, com RLS |
| `20261107130000_indices_chaves_estrangeiras.sql` | Índices recomendados pelo verificador do Supabase |

## Testes

`npm test -w @ora5g/banco` cria um PostgreSQL em memória (PGlite), simula o que o Supabase traz pronto (`src/supabase-simulado.sql`), aplica todas as migrations do zero e roda os testes de permissão T1–T12 do ADR-002 (`src/acesso.test.ts`). Não precisa de Docker nem de internet.

## Como o aplicativo deve usar

- Ao entrar, chamar `selecionar_unidade(unidade)`: devolve `true` (aceita) ou `false` (recusada e registrada na auditoria).
- Antes de cada ação, o banco confere com `tem_permissao('permissao', unidade)`; papéis de unidade só valem na unidade escolhida na sessão.
- Nenhuma tabela aceita escrita direta do usuário logado; escritas virão por funções do banco que validam e auditam na mesma transação.

## Ambientes

| Ambiente | Projeto | Situação |
|---|---|---|
| Desenvolvimento | `ora5g-dev` (`qgnbeuugklzzcevdzrvg`, São Paulo, plano gratuito) | Migrations aplicadas em 07/11/2026 |
| Homologação | a criar | — |
| Produção | a criar | — |

Toda migration nova precisa revogar os privilégios padrão do Supabase (`anon`, `authenticated`) nas tabelas que criar e habilitar RLS.
