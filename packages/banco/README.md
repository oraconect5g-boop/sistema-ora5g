# Banco de dados (Supabase)

Migrations em `supabase/migrations/`, aplicadas em ordem pelo nome. Reversões (só para banco sem dados reais) em `supabase/reversao/`.

| Migration | O que faz |
|---|---|
| `20261107140352_fundacao_acesso.sql` | ADR-002: organização, empresas, unidades, perfis, papéis, permissões, vínculos, contexto da sessão e auditoria, com RLS |
| `20261107140448_indices_chaves_estrangeiras.sql` | Índices recomendados pelo verificador do Supabase |
| `20261107151305_correcoes_revisao_codex.sql` | REV-001, REV-002, REV-005 e REV-006 da revisão do Codex de 07/11 |
| `20261108150432_auditoria_automatica_acesso.sql` | ORA-ORG-005: toda mudança em organizações, empresas, unidades, perfis, papéis, permissões e vínculos vai para a auditoria (ator, horário, alvo, antes/depois, motivo), separada por organização |
| `20261108150620_catalogo_estoque.sql` | ADR-003 (proposto): categorias, marcas, produtos, variações (SKU), preços e custos com histórico, itens com IMEI/ICCID, livro de estoque só de inserção, saldo sem negativo, reservas com trava e idempotência |
| `20261108151325_indices_catalogo_estoque.sql` | Índices das chaves estrangeiras compostas do catálogo e estoque recomendados pelo verificador do Supabase |

### Versões iguais às do Supabase (REV-018 / #17)

Até 08/11 os três arquivos acima tinham versões `20261107120000`, `…130000` e `…140000`, mas o Supabase gravou o horário da aplicação (`…140352`, `…140448`, `…151305`). O conteúdo aplicado é **idêntico byte a byte** ao do Git (md5 do texto gravado em `supabase_migrations.schema_migrations` = md5 do arquivo, conferido em 08/11), então a conciliação foi só **renomear os arquivos**, sem tocar no banco, sem `repair` e sem `reset`. Os comentários dentro das migrations antigas ainda citam o nome velho da reversão: ficaram assim de propósito, porque migration aplicada não muda.

**Regra daqui em diante:**
1. Escrever a migration com qualquer versão provisória e testar no PGlite (`npm test -w @ora5g/banco`).
2. Aplicar no projeto de desenvolvimento.
3. Ler a versão que o Supabase gravou (`list_migrations`) e **renomear o arquivo e a reversão** para ela antes do commit.
4. Registrar versão, nome e md5 em `supabase/aplicadas-dev.json`. O teste `src/migrations.test.ts` falha se uma migration aplicada for alterada depois: correção é sempre uma migration nova.

## Testes

`npm test -w @ora5g/banco` cria um PostgreSQL em memória (PGlite), simula o que o Supabase traz pronto (`src/supabase-simulado.sql`), aplica todas as migrations do zero e roda os testes de permissão T1–T12 do ADR-002 (`src/acesso.test.ts`). Não precisa de Docker nem de internet.

## Como o aplicativo deve usar

- Ao entrar, chamar `selecionar_unidade(unidade)`: devolve `true` (aceita) ou `false` (recusada e registrada na auditoria).
- Antes de cada ação, o banco confere com `tem_permissao('permissao', unidade)`; papéis de unidade só valem na unidade escolhida na sessão.
- Nenhuma tabela aceita escrita direta do usuário logado; escritas virão por funções do banco que validam e auditam na mesma transação.
- Estoque (ADR-003): `reservar_estoque(variante, quantidade, item, chave, origem, minutos)` reserva na unidade da sessão; `liberar_reserva(reserva)`; `conferir_item(item)`; `preco_vigente(variante, unidade, canal, momento)`; `disponibilidade_na_rede(variante)`. Erros com código próprio: `OR001` estoque insuficiente, `OR002` item indisponível, `OR003` IMEI/ICCID de outra loja, `OR004` chave de idempotência usada em outra operação.
- Motivo de uma mudança de configuração: `select set_config('ora.motivo', 'texto', true)` na mesma transação; a auditoria automática registra junto.

## Ambientes

| Ambiente | Projeto | Situação |
|---|---|---|
| Desenvolvimento | `ora5g-dev` (`qgnbeuugklzzcevdzrvg`, São Paulo, plano gratuito) | 67 migrations aplicadas (de 07 a 14/11/2026), lista em `supabase/aplicadas-dev.json` |
| Homologação | a criar | — |
| Produção | a criar | — |

Toda migration nova precisa revogar os privilégios padrão do Supabase (`anon`, `authenticated`) nas tabelas que criar e habilitar RLS.
