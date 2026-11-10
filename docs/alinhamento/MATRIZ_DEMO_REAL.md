# Matriz demonstração × aplicação real

**Atualizada em:** 10/11/2026, lote 1 da #65 (financeiro real). **Base:** `main` depois do merge deste lote.
**Pedido:** prompt do Codex em `docs/prompt-financeiro-real-20261110` (PROMPT_CLAUDE_FINANCEIRO_REAL_E_PLANO_COMPLETO_2026-11-10.md) e relatório dos 179 requisitos.

Cada linha liga a função da referência (demonstração, `/demo`, dados fictícios) à rota real, à fonte persistente, à regra de acesso e ao teste. A demonstração continua separada e com o aviso; nenhuma tela real importa `demo/`. Estados: os mesmos de `status-requisitos.json` (testado em desenvolvimento ≠ homologado).

| Área | Função da referência | Rota real | Fonte persistente | Regra / permissão | Prova | Estado |
|---|---|---|---|---|---|---|
| Financeiro | Vendas e devoluções por período | `/financeiro` | `public.financeiro_painel` (soma do período inteiro no banco) sobre `vendas` e `venda_devolucoes` | `venda.ver_unidade` (loja do turno) ou `venda.ver_todas` (rede); RLS em cada linha somada | `packages/banco/src/financeiro-painel.test.ts`, `lib/financeiro/painel.test.ts`, `app/financeiro/financeiro.test.ts` | Parcial (lote 1) |
| Financeiro | Recebimentos por meio | `/financeiro` | `venda_pagamentos` (troco, entrada de financiamento, vale) e `contas_a_receber` | Idem | Idem (reconcilia pagamentos × livro do caixa) | Parcial: registro, não liquidação |
| Financeiro | Caixas e fechamentos | `/financeiro` | `caixas`, `caixa_movimentos` | Caixas da loja só com `caixa.conferir` (RLS); o vendedor vê o próprio em `/caixa` | Idem | Parcial |
| Financeiro | Detalhamento e exportação | `/financeiro` (registros por página) e `/financeiro/exportar` (CSV) | As mesmas tabelas, lote a lote (limite da API) | Mesma permissão e escopo, conferidos no servidor | `financeiro.test.ts` | Parcial: CSV; XLSX/PDF não |
| Financeiro | Contas a pagar, conciliação, DRE, previsão, repasses | — (a tela mostra "indisponível") | Modelos ainda não existem | — | — | Não iniciado |
| Início | Pendências, atalhos e resumo do dia | `/inicio` | Contagens por tabela; `financeiro_painel` de hoje | Cada bloco só com a permissão dele | `app/vendas/vendas.test.ts`, `financeiro.test.ts` | Parcial: meta, ticket e ranking faltam |
| Relatórios | Evolução, margem, ticket, descontos, ranking | — (vendas por dia já em `/financeiro`) | `venda_itens_custos` para margem | `custo.ver` | — | Não iniciado (próxima fatia) |
| Vendas | Lista e comprovante | `/vendas`, `/vendas/[id]` | `vendas`, `venda_itens`, `venda_pagamentos` | Vendedor: as próprias; gerência: a loja | `vendas.test.ts`, `lib/vendas/lista.test.ts` | Parcial (homologação com perfis de teste) |
| PDV | Carrinho, desconto, pagamento misto | `/vender` | RPCs `criar_venda` … `concluir_venda` | `venda.registrar`, `desconto.*` | `packages/banco/src/vendas.test.ts`, E2E | Parcial |
| Caixa | Abrir, suprir, sangrar, fechar, conferir | `/caixa` | `caixas`, `caixa_movimentos` | `caixa.abrir`, `caixa.conferir` | Testes do banco | Testado (PAY-004/006) |
| Estoque | Consulta por IMEI/ICCID, transferências | `/estoque`, `/transferencias` | `itens_serializados`, `estoque_*`, `transferencias` | `estoque.*` | Testes do banco | Parcial |
| Catálogo | Produtos, preços e fotos | `/catalogo` | `produtos`, `variantes`, `precos`, `fotos_produto` | `catalogo.fotos`; custo só com `custo.ver` | Testes do banco | Parcial |
| Aprovações, notas, auditoria | Filas e trilha | `/aprovacoes`, `/notas`, `/auditoria` | `aprovacoes_desconto`, `notas_pedidos`, `auditoria` | `desconto.aprovar`, `nota.aprovar`, `auditoria.ver` | Testes do banco e de telas | Testado/parcial |
| Ora Connect | Ativação, recarga, portabilidade | `/connect` | `connect_operacoes` + worker | `connect.*`; segredos só no worker | Testes do banco e do worker | Parcial: Nogle real depende de C1/C2 |
| Equipe | Usuários, convites, bloqueios | `/equipe` | `vinculos`, `convites` + worker de identidade | `usuarios.gerir` | Testes do banco | Parcial: depende de A1/A2 |
| Metas e comissões | Painéis e ranking | — | — | `metas.*` | — | Não iniciado |
| CRM e WhatsApp | Clientes e conversas | — | — | — | — | Não iniciado |
| Assistência | Ordens de serviço | — | — | `os.*` | — | Não iniciado |
| Canais online | Loja e marketplaces | — | — | — | — | Não iniciado |
| Importação Rein | Prévia e aprovação do arquivo | — | — | `importacao.*` | — | Não iniciado (depende de B1) |

## Contrato dos números do financeiro (lote 1)

Centavos inteiros; dia e hora de São Paulo; a loja de vendas, pagamentos e devoluções é a da venda. Detalhes no cabeçalho de `packages/banco/supabase/migrations/20261110224537_financeiro_painel.sql` e de `apps/plataforma/src/lib/financeiro/painel.ts`.

| Número | Definição | Data | Não é |
|---|---|---|---|
| Vendas concluídas | Total das vendas concluídas no período, mesmo se canceladas depois | Conclusão | Recebimento |
| Devoluções e cancelamentos | Devoluções (valor) e cancelamentos de venda já concluída (total). Venda com devolução não se cancela inteira (OR017) | Data de cada fato | Estorno confirmado |
| Vendido líquido | Vendas − cancelamentos − devoluções, cada fato na sua data | — | Lucro, margem ou DRE |
| Recebido na loja | Pagamentos confirmados: meios sem financeira menos o troco, mais as entradas de financiamento | Registro do pagamento | Liquidação (não há conciliação com extrato) |
| A receber das financeiras | Parte financiada (PayJoy/Aiva) registrada no período | Registro | Repasse (prazo e taxa sem contrato) |
| Vale-troca usado | Crédito de devolução usado como pagamento | Registro | Dinheiro |
| Estornos pendentes | Estornos externos aguardando comprovante | Pedido do estorno | Reembolso comprovado |
| Movimentação dos caixas | Movimentos em dinheiro do livro dos caixas, por tipo | Movimento | Fluxo de caixa da empresa (fundo e suprimento não são receita; sangria não é despesa) |

Comparação: o período anterior é a mesma janela deslocada em dias inteiros (hoje × ontem até a mesma hora). Sem fatos antes, a tela diz que não há histórico comparável, sem percentual inventado.
