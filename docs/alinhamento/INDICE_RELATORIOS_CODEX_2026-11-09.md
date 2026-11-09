# Índice dos relatórios Codex e ordem de leitura

**Data:** 09/11/2026. **Uso:** acompanhar [o prompt consolidado para o Claude](PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md). Este índice reúne os 13 relatórios principais encontrados na main e na PR #33 durante a preparação; descobrir também documentos e comentários posteriores.

**Importante:** a PR #33 estava aberta. Os relatórios mais recentes não devem ser considerados ausentes por não aparecerem na main. Leia-os pelo HEAD atual da PR ou pela referência integrada, mantendo o SHA de cada fonte. Data no nome e commit auditado delimitam a conclusão; relatório antigo não prevalece sobre decisão recente nem sobre correção posteriormente comprovada.

## 1. Leia primeiro o estado consolidado mais recente

| Ordem | Relatório | O que confrontar com o código atual |
|---|---|---|
| 1 | [Consolidado Nogle, merges e estoque — 9b1109e](../analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md) | Entregas reais, cinco bloqueantes #55–#59, API/repasse pendentes, cadastro de 11 lojas e próximos lotes |
| 2 | [Merges, duplicidades e versões antigas](../analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md) | Árvores/pais, substituições, wrappers, migrations, DTOs, publicação e jobs; ler junto ao complemento do consolidado |
| 3 | [Prioridade Nogle, gateway e repasses](../analises/PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md) | Matriz das 62 funções, fluxo oficial e contratos ainda incompletos; o adaptador já existe parcialmente |
| 4 | [Vendas, pagamentos e caixa — 371cef0](../analises/REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md) | #45–#53, RLS, financiamento, estorno e retorno físico; considerar a devolução/troca integrada depois deste corte |
| 5 | [Catálogo e fotos — aebbdcc](../analises/REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md) | #40–#44, paginação/busca, imagem/retry e dependências |
| 6 | [Testes e análise por setor](../analises/TESTES_E_ANALISE_POR_SETOR_2026-11-08.md) | Cobertura de áreas e casos adversariais #34–#39, sem confundir demonstração com operação real |
| 7 | [Claude e relatório de navegação web](../analises/REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md) | Ajustes reais, recomendações corrigidas, riscos de acesso e registro oficial Nogle |
| 8 | [Inventário de arquivos do lote 55d10af](../analises/ARQUIVOS_DO_LOTE_55D10AF_2026-11-08.md) | Proveniência e alcance daquele lote, sem usar caminhos antigos como prova de ausência atual |

## 2. Complete a leitura histórica e a matriz do projeto

| Ordem | Relatório | Finalidade |
|---|---|---|
| 9 | [Auditoria Claude Code — 08/11](../analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md) | Origem de achados, revisão funcional e alinhamento com o plano |
| 10 | [Matriz histórica dos 172 requisitos](../analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md) | Comparação do inventário inicial com entregas; o inventário atual deve ser recalculado |
| 11 | [Auditoria funcional e Supabase — 07/11](../analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md) | Base do frontend/backend, banco, migrations e limites das evidências da época |
| 12 | [Revisão incremental — 8e1625d](../analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md) | Mudanças e resíduos daquele corte, implantação e apresentação |
| 13 | [Análise de sistemas — 07/11](../analises/ANALISE_SISTEMAS_2026-11-07.md) | Regras fundamentais, dinheiro, autorização, arquitetura e recomendações iniciais |

## 3. Fontes transversais obrigatórias

- [Registro consolidado das revisões](REVISOES_CODEX.md), [pedidos de revisão](PEDIDO_DE_REVISAO_CODEX.md), respostas do Claude em `RESPOSTAS_A_REVISAO_*.md` e issues/comentários correspondentes.
- [Plano](ANALISE_DO_PLANO.md), [fila](FILA_DE_EXECUCAO.md), [rastreabilidade](RASTREABILIDADE.md), `status-requisitos.json`, `backlog.json` e ADRs. Os documentos atuais prevalecem sobre contagens históricas.
- [Configuração e transição do mockup](CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md), [conferência das correções](CONFERENCIA_DAS_CORRECOES_2026-11-07.md) e os prompts/adendos anteriores, conciliados com o consolidado.
- [Registro oficial Nogle e desempenho](NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md), [referência técnica Nogle](../integracoes/NOGLE_API_REFERENCIA.md), coleção oficial versionada e catálogo gerado.
- [51 perguntas à Contel](../integracoes/PERGUNTAS_PARA_CONTEL_NOGLE_2026-11-09.md) e [APIs/habilitações](../integracoes/APIS_E_HABILITACOES_NECESSARIAS.md). Não substituir contrato pendente por um endpoint presumido.
- [Fotos obrigatórias](FOTOS_DOS_PRODUTOS_2026-11-08.md), [busca/transferências](BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md), [cadastro confirmado](../cadastros/LOJAS_CONFIRMADAS_2026-11-09.json) e [protótipo visual](../prototipos/estoque-por-loja-2026-11-09/LEIA-ME.md).
- [Critérios do piloto/saída da Rein](../operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md), com atualização das evidências e do escopo de 11 lojas comerciais + DEFEITOS.

## 4. Evidências a ler e reproduzir conforme a correção

| Pasta | Conteúdo |
|---|---|
| [2026-11-08-web](../analises/evidencias/2026-11-08-web/LEIA-ME.md) | Primeira rodada adversarial de acesso/estoque e relatório web |
| [2026-11-08-setores](../analises/evidencias/2026-11-08-setores/LEIA-ME.md) | Regras, exportação, indicadores e operações por setor |
| [2026-11-08-fotos](../analises/evidencias/2026-11-08-fotos/LEIA-ME.md) | Busca, componentes de foto, registro/retry e plano de índice |
| [2026-11-08-vendas](../analises/evidencias/2026-11-08-vendas/LEIA-ME.md) | Financiamento, caixa, estorno, RLS e deadlock |
| [2026-11-09-merges-e-nogle](../analises/evidencias/2026-11-09-merges-e-nogle/LEIA-ME.md) | Inventário SQL e grafo de fontes, com limites explícitos |
| [2026-11-09-nogle-9b1109](../analises/evidencias/2026-11-09-nogle-9b1109/LEIA-ME.md) | Segredos no web, custo ao vendedor, cobrança LINK, identidade do retry e dupla evidência |

As provas vermelhas são deliberadas e referidas a um SHA. Rodar em ambiente isolado com dados fictícios; adaptar somente a interface se ela evoluiu. Quando corrigidas, transformar a regra em regressão permanente. Não contar uma reexecução como cobertura adicional e não declarar que os casos se aplicam à main atual sem reproduzir ou confrontar o código.

## 5. Registro mínimo de leitura e execução

Para cada fonte: caminho/PR, SHA, corte auditado, conclusão ainda válida, mudança posterior relevante, issue/requisito e ação. Esse registro deve ser breve e alimentar a correção; não é uma entrega que substitui implementação.

No preparo deste índice, a main `d730e9a` já incluía devolução parcial/troca/vale-troca posteriores ao consolidado 9b1109e. Revalidar especialmente cancelamentos, pagamento e retorno de estoque antes de aplicar recomendações daquele corte. As issues abertas #11, #26–#32 e #34–#60 devem ser consultadas; número de issue aberta não prova sozinho que o código atual ainda contém o defeito.

**Stack confirmada pelo proprietário:** Supabase/PostgreSQL, TypeScript/React/Next.js/Tailwind/Node.js. Não iniciar migração para Firebase. **Cadastro confirmado:** 11 lojas + local de exceção DEFEITOS. Não repetir perguntas que já foram respondidas.
