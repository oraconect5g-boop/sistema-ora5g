# Matriz demonstração × aplicação real

**Atualizada em:** 13/11/2026, lote G2a (relatórios reais: linhas 8 a 14 entregues, com a margem bruta, a exportação e o indicador da margem no Início; cada linha diz o que ficou para depois). O G1, também de 13/11, entregou as linhas 1 a 6. A matriz e o contrato dos números são do lote P0, de 12/11. **Base:** `main` `e75f51a` (merge do G1).
**Pedidos:** prompt do financeiro real de 10/11 (`docs/prompt-financeiro-real-20261110`), relatório dos 179 requisitos e prompt do Tech Lead de 12/11 (corrigir os achados da revisão integral e devolver à aplicação real o acompanhamento visual da demonstração).

Este documento liga cada função e cada gráfico da referência (demonstração, `/demo`, dados fictícios) à rota real, à fonte persistente, à regra de acesso e ao teste. A demonstração continua separada e com o aviso; nenhuma tela real importa `demo/` nem usa número da demonstração. Estados: os mesmos de `status-requisitos.json` (testado em desenvolvimento ≠ homologado).

- Seção 1: contagem conferida dos gráficos.
- Seção 2: matriz gráfico por gráfico (os 25 usos da demonstração).
- Seção 3: contrato dos números (o que cada indicador soma, de onde, com que data e para quem).
- Seção 4: estados que todo painel real precisa ter.
- Seção 5: matriz por área e função.

## 1. Contagem conferida (13/11/2026)

| Onde | Usos diretos de gráfico ou medidor | Arquivos |
|---|---|---|
| Demonstração (`apps/plataforma/src/app/demo/`) | **25** | `_paineis/PainelGestao.tsx` (5), `_paineis/InicioVendedor.tsx` (1), `_paineis/OutrosPaineis.tsx` (1), `relatorios/page.tsx` (8), `financeiro/page.tsx` (2), `metas/page.tsx` (3), `estoque/page.tsx` (1), `connect/_abas/ConsultarLinha.tsx` (1), `connect/_abas/Operacoes.tsx` (2), `connect/_abas/Carteira.tsx` (1) |
| Aplicação real | **14** | `financeiro/ConteudoFinanceiro.tsx` (3: linhas 67, 88 e 115); os sete do G1, que o G2a separou em `componentes/paineis-de-vendas.tsx` (6: linhas 215, 244, 281, 284, 293 e 332; o Início e os Relatórios usam os mesmos) e `inicio/ConteudoInicio.tsx` (1: linha 51, a equipe); e, desde o G2a, `relatorios/ConteudoRelatorios.tsx` (4: linhas 77, 121, 165 e 206) |

Como repetir: `grep -rnE "<(Linhas|Colunas|ColunasDivergentes|BarrasHorizontais|BarraSegmentada|Medidor|Sparkline)\b" apps/plataforma/src/app apps/plataforma/src/componentes/paineis-de-vendas.tsx --include=*.tsx`, separando o que está em `demo/` do resto. Desde o G2a, os painéis que o Início e os Relatórios mostram do mesmo jeito ficam em `componentes/paineis-de-vendas.tsx`, fora de `app/`, e por isso entram na busca; um painel usado nas duas telas conta uma vez. Os componentes ficam em `apps/plataforma/src/componentes/graficos.tsx` e servem às duas aplicações: o que muda no real é a origem dos números.

## 2. Matriz gráfico por gráfico

Os códigos da coluna "Indicador" (V1, P1, M1, E3, T2, X2, U1) são os da seção 3. "Lote" é o da fila do checkpoint (`EXECUCAO_INTEGRAL_STATUS.md`, seção 5.1). As linhas da demonstração são as de `apps/plataforma/src/app/demo/`.

### 2.1 Início

| Nº | Referência da demo | Destino real | Indicador | Fonte persistente | Permissão | Já existe | Lacuna | Teste | Lote |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `_paineis/PainelGestao.tsx:161` · `Linhas` · "Faturamento por hora" (hoje × ontem) e "por dia" (7 ou 14 dias × período anterior) | `/inicio`, painel "Vendas" ("Minhas vendas" para o vendedor), com filtro hoje, 7 dias e 30 dias | V1 por hora (hoje) ou por dia, com a mesma janela anterior (3.2) | `vendas_painel` → `periodos` (`vendas.concluida_em`, `total_centavos`), lida duas vezes: a janela atual e a anterior, no mesmo grão | `venda.ver_todas` (rede, com filtro de loja), `venda.ver_unidade` (loja do turno) ou `venda.ver_propria` (só as próprias vendas, linha 6) | **Entregue (G1, 13/11):** linha do período atual com o anterior tracejado, ponto a ponto, legenda e tabela equivalente; ligação "Conferir no financeiro" no mesmo recorte. A série em colunas com devoluções continua em `/financeiro` | Jornada com login dos três perfis (J1) | Banco: `vendas-painel.test.ts` (valores conhecidos; cada fato no dia e na hora de São Paulo; os períodos batem com os de `financeiro_painel`); regra pura: `lib/inicio/painel.test.ts` (as duas janelas ponto a ponto, madrugada e período anterior não lido); tela: `app/inicio/inicio.test.ts` (os seis estados da seção 4) | G1 (entregue) |
| 2 | `_paineis/PainelGestao.tsx:182` · `Medidor` "Meta do dia" e barras do mix por categoria | `/inicio`: painel "Mix de vendas" agora; medidor quando houver meta | X2 (atingimento), V7 (mix por tipo de item) e V8 (por categoria) | Mix: `vendas_painel` → `tipos` e `categorias` (`venda_itens` das vendas concluídas; tipo gravado no item, categoria atual do cadastro). Meta: não há tabela | `venda.ver_unidade` ou `venda.ver_todas`; meta: `metas.ver_unidade` | **Entregue (G1):** barra por grupo (Aparelhos, Acessórios, Ora Connect e Serviços), barras das seis maiores categorias e as duas tabelas completas, com itens, vendido e o que foi devolvido ou cancelado | Medidor: modelo de metas e valores definidos pelo proprietário | Banco: a soma dos tipos e a das categorias fecham com V1; o tipo é o gravado no item e a categoria é a atual. Regra pura: tipo desconhecido vai para "Outros" sem perder valor; categoria só com devolução fica na tabela e fora do gráfico | G1 (mix, entregue), G4 (medidor) |
| 3 | `_paineis/PainelGestao.tsx:204` · `BarraSegmentada` "Recebimentos por meio" | `/inicio`, painel "Recebimentos por meio" (só para a gestão) | P1 por meio | `financeiro_painel` → `pagamentos` (`venda_pagamentos` confirmados): a mesma leitura e o mesmo cálculo do `/financeiro` | `venda.ver_unidade` ou `venda.ver_todas`; o vendedor não recebe este painel | **Entregue (G1):** barra por meio, com legenda e tabela; entradas de financiamento, financiado a receber e vale-troca escritos ao lado; ligação "Ver pagamentos" para o `/financeiro` no mesmo recorte | Liquidação e conciliação por meio (P5) continuam na linha 16 | Tela (`inicio.test.ts`): troco descontado, entrada de financiamento no meio em que foi paga e total igual ao do financeiro; regra pura (`painel.test.ts`): a cor é do meio, não da posição, e meio desconhecido não perde valor; banco: `financeiro-painel.test.ts` | G1 (entregue) |
| 4 | `_paineis/PainelGestao.tsx:221` · `BarrasHorizontais` "Desempenho das lojas hoje" (vendido × meta) | `/inicio`, painel "Desempenho das lojas", só na visão da rede inteira | V9; a marca da meta fica para o G4 | `vendas_painel` → `lojas` (`vendas.unidade_id`); as lojas do cadastro que a pessoa lê entram com zero quando não venderam | `venda.ver_todas` | **Entregue (G1):** barras por loja no período escolhido e tabela com vendas, vendido, devolvido e cancelado, líquido e ticket; cada loja da tabela abre o Início daquela loja | Meta por loja (marca no gráfico) | Banco: duas lojas com valores conhecidos; o gerente soma a loja dele e nada de outra; loja inativada continua na soma da rede, sem o nome. Tela: a venda fica na loja em que foi feita e loja sem venda aparece com zero | G1 (entregue); meta no G4 |
| 5 | `_paineis/PainelGestao.tsx:231` · `BarrasHorizontais` "Equipe hoje" (vendido por vendedor × meta) | `/inicio`: painel "Equipe" (uma loja) ou "Melhores vendedores" (rede inteira) | V10 | `vendas_painel` → `vendedores` (`vendas.vendedor_id`, o vendedor de origem); nome por `ranking_nomes` | Números: `venda.ver_unidade` (a loja) ou `venda.ver_todas`. Nomes: `ranking.ver` na loja da venda. O vendedor não recebe este painel (os números dele estão na linha 6) | **Entregue (G1):** barras por vendedor de origem (até 12 na loja e 10 na rede; a tabela traz todos), com vendas, vendido, devolvido e cancelado, líquido e ticket; quem consulta aparece marcado. Sem `ranking.ver`, o painel diz "sem permissão" e os nomes nem são pedidos ao banco | Meta individual (G4); ranking para o vendedor (decisão P3) | Banco: o vendedor não soma venda de colega; o gerente não soma outra loja; `ranking_nomes` só devolve nome a quem tem `ranking.ver` na loja da venda. Tela: sem nome liberado ninguém é inventado; nomes fora do ar não viram lista de "não identificados" | G1 (entregue); meta no G4 |
| 6 | `_paineis/InicioVendedor.tsx:53` · `Medidor` "Meta do dia" do vendedor | `/inicio` do vendedor ("Meus resultados"): "Minhas vendas", "Minha produção" e "Onde vendi" agora; medidor quando houver meta | V1, V2, V5, V6 e V7 só das vendas de quem consulta; V9 das próprias vendas; X2 | `vendas_painel` com `p_vendedor` = quem consulta (o RLS `vendas_ler` confere de novo: pedir as vendas de um colega não devolve nada) | `venda.ver_propria` | **Entregue (G1):** indicadores próprios (vendas, ticket, descontos, devoluções e cancelamentos), linha "Minhas vendas" com o período anterior, "Minha produção" (itens vendidos por grupo, em quantidade) e "Onde vendi" (para quem vendeu em mais de uma loja). Sem recebimentos, gaveta nem nome de colega | Medidor de meta e produção de telecom confirmada (G4); "resumo da loja" e ranking com colegas dependem da decisão P3 (o cartão do vendedor diz isso); jornada com login (J1, depende do item A1) | Banco: o vendedor soma as próprias vendas nas lojas em que vende, e pedir as do colega não devolve nada. Tela: só as próprias perguntas (sem financeiro, sem gaveta e sem nomes); `?loja` no endereço não amplia o recorte | G1 (minhas vendas, entregue), G4 (medidor), J1 |
| 7 | `_paineis/OutrosPaineis.tsx:34` · `BarraSegmentada` "Usuários por papel" | `/equipe` | U1 | `vinculos` vigentes × `papeis` | `usuarios.gerir` | `/equipe` lista as pessoas, sem contagem por papel | Contagem no banco e gráfico | Vínculo encerrado fica fora; pessoa com dois papéis | G5 |

### 2.2 Relatórios

| Nº | Referência da demo | Destino real | Indicador | Fonte persistente | Permissão | Já existe | Lacuna | Teste | Lote |
|---|---|---|---|---|---|---|---|---|---|
| 8 | `relatorios/page.tsx:80` · `Linhas` "Faturamento por dia e meta diária" (7, 14 ou 30 dias; comparação só com período anterior completo) | `/relatorios` (rota nova) | V1 por dia × janela anterior; meta diária (X1) | `vendas_painel` → `periodos` (desde o G2a; a soma por dia é a mesma do `financeiro_painel`, provada em `vendas-painel.test.ts`), lida duas vezes: a janela atual e a anterior de mesmo tamanho | `venda.ver_unidade` ou `venda.ver_todas` | **Entregue (G2a, 13/11):** `/relatorios` (menu "Relatórios", grupo Gestão) em 7, 14 (padrão) ou 30 dias: linha do período atual com a janela anterior tracejada, dia a dia, com legenda e tabela; ligação para o `/financeiro` no menor recorte que cobre o período (o de 30 dias para os 14, dito na própria ligação) | Meta diária (G4); jornada com login (J1) | Banco: `vendas-painel.test.ts`; regras: `lib/relatorios/painel.test.ts` (janelas de 7, 14 e 30 dias e endereços); tela: `app/relatorios/relatorios.test.ts` (as janelas pedidas ao banco, período anterior não lido, sem histórico comparável, fonte indisponível e falha) | G2a (entregue); meta no G4 |
| 9 | `relatorios/page.tsx:85` · `BarraSegmentada` "Meios de pagamento hoje" | `/relatorios` | P1 por meio no período escolhido | Como na linha 3 | Como na linha 8 | **Entregue (G2a):** o painel da linha 3 no período do relatório, com "Ver pagamentos" para o `/financeiro` | Liquidação e conciliação por meio (linha 16, G2b) | Como na linha 3; tela: `relatorios.test.ts` (falha dos recebimentos não derruba os outros painéis) | G2a (entregue) |
| 10 | `relatorios/page.tsx:88` · `BarraSegmentada` "Mix de vendas hoje" | `/relatorios` | V7 e V8 (categoria do cadastro) | `venda_itens` → `variantes` → `produtos` → `categorias` | Como na linha 8 | **Entregue (G2a):** o painel "Mix de vendas" (linha 2) no período do relatório, com as duas tabelas | — | Soma por categoria = soma por tipo = V1 (já provado em `vendas-painel.test.ts`) | G2a (entregue) |
| 11 | `relatorios/page.tsx:94` · `BarrasHorizontais` "Lojas no período" (faturamento × meta do período) | `/relatorios`, visão da rede | V9 no período | Como na linha 4 | `venda.ver_todas` | **Entregue (G2a):** "Desempenho das lojas" na visão da rede inteira, no período do relatório; cada loja da tabela abre o relatório daquela loja | Meta do período (G4) | Como na linha 4, em 30 dias | G2a (entregue); meta no G4 |
| 12 | `relatorios/page.tsx:100` · `Linhas` "Margem bruta por dia" | `/relatorios`, só para quem vê custo | M1 por dia, com M2 (cobertura) ao lado | `public.margem_painel` e `public.margem_itens` (G2a, migration `20261113065706_margem_painel`), sobre `vendas`, `venda_itens`, `venda_itens_custos` (custo gravado no item), `venda_devolucoes` e `venda_devolucao_itens` | `custo.ver` na loja, além da leitura das vendas | **Entregue (G2a):** "Margem bruta por dia" (linha com área; dia com movimento e nenhum custo gravado fica em branco, não zero; dia só com devolução fica abaixo de zero, com o sinal) e a tabela com o total; "Cobertura do custo" (barra com e sem custo, a conta da margem e "não é lucro"); "Margem por item" (uma linha por item das vendas concluídas, 50 por página, com o custo gravado e a margem); exportação por dia e por item. Sem `custo.ver`, o banco nem é perguntado: a tela mostra um cartão "sem permissão" e a exportação por item responde 403 | Jornada com login (J1) | Banco: `margem-painel.test.ts` (14 casos: valores conhecidos, cada fato no seu dia, custo histórico, item sem custo, soma maior que uma página da API, perfis, e loja sem `custo.ver` fora do numerador e do denominador); regras: `lib/margem/painel.test.ts` (leitura estrita, conta que não fecha é falha, as quatro situações) e `lib/relatorios/painel.test.ts`; tela e exportação: `relatorios.test.ts` | G2a (entregue) |
| 13 | `relatorios/page.tsx:103` · `Linhas` "Ticket médio por dia" | `/relatorios` | V5 por dia | `vendas_painel` → `periodos` (vendido e quantidade de cada dia) | Como na linha 8 | **Entregue (G2a):** "Ticket médio por dia" em linha, com o ticket do período; dia sem venda fica em branco (não é zero), com nota e tabela | — | Regra pura: ticket no centavo e dia sem venda nulo (`lib/relatorios/painel.test.ts`); tela: `relatorios.test.ts` | G2a (entregue) |
| 14 | `relatorios/page.tsx:106` · `Colunas` "Descontos concedidos por dia" | `/relatorios` | V6 por dia | `vendas.desconto_centavos` e `subtotal_centavos`, por dia em `vendas_painel` → `periodos` | Como na linha 8 | **Entregue (G2a):** "Descontos concedidos por dia" em colunas, com o total do período, o percentual sobre o valor de tabela e a tabela de cada dia; período sem desconto ou sem venda é explicado | — | A soma dos descontos dos itens é o desconto da venda; venda sem desconto | G2a (entregue) |
| 15 | `relatorios/page.tsx:112` · `Colunas` "Chips, ativações e recargas por dia" (só confirmadas) | `/relatorios` e `/connect` | T1 e T2 por dia | `venda_itens` (tipo `chip`) e `connect_producao` | Leitura das vendas (chips); `connect.gerir` (operações da loja) | `/connect` lista as 30 operações mais recentes | Agregação por dia no banco | Operação repetida não conta duas vezes; recusada, cancelada e sem resultado não contam | G4 |

### 2.3 Financeiro

| Nº | Referência da demo | Destino real | Indicador | Fonte persistente | Permissão | Já existe | Lacuna | Teste | Lote |
|---|---|---|---|---|---|---|---|---|---|
| 16 | `financeiro/page.tsx:58` · `BarraSegmentada` "Recebimentos por meio", com a situação da conciliação | `/financeiro` | P1 por meio; P5 (conciliado × a conciliar) | `venda_pagamentos` (`conciliado_em`, `liquidado_em`, `valor_liquido_centavos`) | `venda.ver_unidade` ou `venda.ver_todas`; conciliar: `pagamento.conciliar` | "Pagamentos registrados por meio" (barras e tabela), preservado; conciliação manual em `/pagamentos/conciliacao` (L7a) | Situação da conciliação por meio no painel; conciliação por extrato depende de arquivo ou API oficial | Pagamento conciliado, conciliação desfeita e meio não conciliável; valor líquido nunca maior que o valor | G2 |
| 17 | `financeiro/page.tsx:95` · `ColunasDivergentes` "Fluxo de caixa da rede · 14 dias" | `/financeiro` | P6 hoje; fluxo financeiro da empresa quando houver contas e liquidações | `caixa_movimentos` (existe); contas a pagar e extratos (não existem) | `caixa.conferir` (gaveta); contas: a definir com o modelo | "Movimentação dos caixas" (só dinheiro da gaveta), preservado | Contas a pagar e a receber, liquidação e projeção: sem fonte, aparecem como "indisponível" | Gaveta já coberta; o fluxo ganha teste junto com a fonte | L7b e L8 |

### 2.4 Metas

| Nº | Referência da demo | Destino real | Indicador | Fonte persistente | Permissão | Já existe | Lacuna | Teste | Lote |
|---|---|---|---|---|---|---|---|---|---|
| 18 | `metas/page.tsx:51` · `Medidor` "Meta do dia" (vendedor) | `/metas` (rota nova) | X2 do vendedor | Modelo de metas (não existe) e `vendas` do vendedor | `metas.ver_propria` | Nada | Metas persistentes com vigência e versão; valores definidos pelo proprietário | Mudar a meta não reescreve o período passado; sem meta, "meta não definida" | G4 |
| 19 | `metas/page.tsx:60` · `BarrasHorizontais` "Por loja hoje" (vendedor) | `/metas` | V9 só das vendas do vendedor | `vendas` do vendedor, por `unidade_id` | `venda.ver_propria` | Desde o G1: "Onde vendi" no `/inicio` do vendedor (`vendas_painel` com `p_vendedor`, grão `lojas`) | Levar a `/metas`, ao lado da meta | Vendedor com vendas em duas lojas (já provado em `vendas-painel.test.ts` e `inicio.test.ts`) | G4 (a função do G1 já existe) |
| 20 | `metas/page.tsx:100` · `BarrasHorizontais` "Atingimento por vendedor" e tabela "Produção por categoria" | `/metas` | X2 por vendedor; V7 e T2 por vendedor; margem só com custo (M1) | Metas, `vendas`, `venda_itens` e `connect_producao` | `metas.ver_unidade` (gerente) ou `metas.gerir`; margem: `custo.ver` | Nada | Tudo acima; coluna de margem fechada no servidor | Gerente só a loja; coluna de margem ausente sem `custo.ver` | G4 |

### 2.5 Estoque

| Nº | Referência da demo | Destino real | Indicador | Fonte persistente | Permissão | Já existe | Lacuna | Teste | Lote |
|---|---|---|---|---|---|---|---|---|---|
| 21 | `estoque/page.tsx:113` · `BarrasHorizontais` "Aparelhos por modelo" (traço = mínimo), com os indicadores do topo | `/estoque` | E3 por modelo, com E5 (mínimo); E2, E4, E6 e E7 nos indicadores; E8 só com custo | `estoque_saldos`, `variantes` (`estoque_minimo`), `produtos`, `categorias`, `itens_serializados`, `transferencias`, `estoque_movimentos`, `fotos_produto` | `estoque.consultar` na loja (RLS); valor em custo: `custo.ver` | `/estoque`: saldo da loja em lista (lê até 500 linhas), "onde tem" na rede e fotos | Soma no banco (sem cortar em 500), por modelo, categoria e local; mínimo, reservado, trânsito, parado e pendências; do gráfico ao detalhe do produto | Disponível = físico − reservado; transferência enviada conta em trânsito até ser recebida; loja sem permissão fica fora; mais de 500 variações | G3 |

### 2.6 Ora Connect

| Nº | Referência da demo | Destino real | Indicador | Fonte persistente | Permissão | Já existe | Lacuna | Teste | Lote |
|---|---|---|---|---|---|---|---|---|---|
| 22 | `connect/_abas/ConsultarLinha.tsx:96` · `Colunas` "Consumo de internet · últimos 30 dias" | `/connect`, consulta de linha | T8 | Externa: consumo da linha na Nogle. Não há fato local | A definir com o contrato (proposta: `connect.operar`) | Nada | Contrato e evidência oficial da Nogle (C1/C2); até lá, adaptador com exemplos e painel "fonte indisponível" | Adaptador com exemplos; nenhum número fictício na tela real | Bloqueado (C1/C2) |
| 23 | `connect/_abas/Operacoes.tsx:67` · `BarraSegmentada` "Operações por tipo" (hoje) | `/connect` | T1 (chips vendidos), T2 (confirmadas por tipo) e T3 (em andamento, à parte) | `venda_itens` (tipo `chip`), `connect_producao`, `connect_operacoes` | Vendedor: as próprias; `connect.gerir`: a loja | Lista das 30 operações mais recentes | Contagem do período inteiro no banco; chip separado de ativação | Uma operação é uma linha de produção; em andamento não soma | G4 |
| 24 | `connect/_abas/Operacoes.tsx:76` · `BarrasHorizontais` "Confirmadas por vendedor" | `/connect`, gestão | T2 por vendedor de origem | `connect_producao.vendedor_id` | `connect.gerir` | Nada | Agregação por vendedor | O vendedor não recebe colegas; operação resolvida pela gerência continua do vendedor de origem | G4 |
| 25 | `connect/_abas/Carteira.tsx:43` · `BarraSegmentada` "Transações de hoje" (carteira) | `/connect`, carteira | T6 (débito registrado) agora; saldo e extrato são externos | Local: `connect_operacoes_custos.valor_debitado_centavos`. Externa: relatório de transações e extrato da carteira na Nogle | `custo.ver` (débito) e `connect.gerir` | O débito aparece por operação para quem tem `custo.ver` | Soma do período; saldo e extrato só com contrato e evidência (C1/C2) | Débito só com `custo.ver`; nenhum saldo inventado | G4 (local); externo bloqueado |

### 2.7 Indicadores e listas que acompanham os gráficos

| Na demonstração | Destino real | Número | Lote |
|---|---|---|---|
| Vendas realizadas e ticket médio (Início) | `/inicio` | V2 e V5 | G1 (entregue) |
| Descontos concedidos (Início) | `/inicio` | V6 | G1 (entregue) |
| Margem bruta (Início) | `/inicio`, só com `custo.ver` e nunca na visão do vendedor | M1, com M3 e o que ficou fora da conta (itens sem custo, lojas sem `custo.ver`) | G2a (entregue) |
| Chips, ativações e recargas (Início) | `/inicio` | T1 e T2 | G4 |
| Caixa em dinheiro e aprovações pendentes (Início) | `/inicio` | P6 (só com `caixa.conferir`) e as contagens de pendência que já existem | G1 (entregue) |
| Melhores vendedores (Início, gestão) | `/inicio` | V10 em ordem (nomes só com `ranking.ver`) | G1 (entregue) |
| Minha produção hoje (vendedor) | `/inicio` | Quantidades de V7 das próprias vendas; T2 próprias | G1 (itens, entregue), G4 (telecom) |
| Estoque parado há mais de 60 dias (relatórios) | `/estoque` e `/relatorios` | E6 | G3 |
| Exportação dos relatórios | `/relatorios/exportar` | Os mesmos números da tela, com a mesma permissão: por dia (vendas e, com `custo.ver`, as colunas de margem) e por item (só com `custo.ver`), em CSV | G2a (entregue); XLSX e PDF depois |
| Financeiras, notas fiscais e contas (financeiro) | `/financeiro` (P2), `/notas`; contas sem fonte | P2 | L7b e L8 |

## 3. Contrato dos números

### 3.1 Regras que valem para todos

- **Unidade:** centavos inteiros no banco e na aplicação; percentual calculado na tela a partir dos centavos.
- **Data e fuso:** cada fato tem o instante em que aconteceu; dia e hora são os de São Paulo (`America/Sao_Paulo`). A janela é `[início, fim)`: "hoje" vai da meia-noite de São Paulo até agora; 7 e 30 dias incluem hoje.
- **Organização:** sempre a da sessão; as regras de leitura do banco (RLS) valem em cada linha somada.
- **Loja:** a da venda (`vendas.unidade_id`) ou a do fato (caixa, saldo, operação). Nunca a loja atual do vendedor.
- **Vendedor:** o de origem (`vendas.vendedor_id`, `connect_operacoes.vendedor_id`), gravado quando o fato nasce. Cancelar, devolver ou resolver por outra pessoa não muda o vendedor de origem.
- **Canal:** `vendas.canal` (`loja` ou `online`). Os painéis somam os canais e a tabela separa quando houver venda online (hoje só a loja gera fatos).
- **Quem vê:** dono e administrador, a rede (`venda.ver_todas`) ou uma loja; gerente, a loja do turno (`venda.ver_unidade`); vendedor, só o que é dele (`venda.ver_propria`). Custo e margem só com `custo.ver`, também em agregados, exportações e endereços.
- **Onde soma:** o período inteiro é somado no banco, por função que roda com as permissões de quem chama (`security invoker`). A tela não soma páginas da API. Desde o G1, V1 a V10 saem de `public.vendas_painel` (uma leitura por janela, com os grãos `totais`, `periodos`, `tipos`, `categorias`, `lojas` e `vendedores`; não lê custo); P1 e P6 continuam em `public.financeiro_painel`.
- **Sem multiplicar:** vendas, itens, pagamentos, devoluções e caixas são somados cada um no seu grão e só se encontram pela chave do período, da loja ou do vendedor. Não há junção de item com pagamento.
- **Nomes diferentes para coisas diferentes:** venda (V), pagamento registrado (P1), liquidação (P5), movimentação da gaveta (P6), margem (M), produção de telecom (T), meta (X). Receita reconhecida, comissão e repasse não têm número enquanto não houver regra e contrato: aparecem como indisponíveis.
- **Sem valor de negócio inventado:** meta, comissão, taxa, prazo de repasse e limite só entram com decisão registrada do proprietário.

### 3.2 Janela e comparação

O período anterior é a mesma janela deslocada em dias inteiros: hoje × ontem até a mesma hora; 7 dias × os 7 dias anteriores; 30 dias × os 30 anteriores. A variação percentual só aparece quando o período anterior tem valor maior que zero; sem fatos antes, a tela diz "sem histórico comparável" e não inventa percentual. No gráfico, a série anterior é tracejada e alinhada ponto a ponto (mesma hora ou mesmo dia da janela).

### 3.3 Vendas

Conferência de todos os números desta tabela: `/financeiro` → "Registros do período" (visões Vendas e Devoluções, com filtro de situação e exportação) → `/vendas/[id]`. Onde aparecem: `/financeiro` (V1 a V4) e, desde o G1, `/inicio` (V1 a V10).

| Cód. | Número | Fórmula | Origem | Data | Situação considerada | Cancelamentos e devoluções | Escopo |
|---|---|---|---|---|---|---|---|
| V1 | Vendas concluídas (valor) | Soma de `total_centavos` | `vendas` | `concluida_em` | Vendas que foram concluídas, mesmo se canceladas depois | Não abatem V1; entram em V3 na data delas | Loja da venda; vendedor de origem; todos os canais |
| V2 | Vendas concluídas (quantidade) | Contagem das vendas de V1 | `vendas` | `concluida_em` | Como V1 | Como V1 | Como V1 |
| V3 | Devoluções e cancelamentos | Soma de `venda_devolucoes.valor_centavos` mais o `total_centavos` das vendas canceladas depois de concluídas | `venda_devolucoes`, `vendas` | Devolução: `criado_em`; cancelamento: `cancelada_em` | Só venda que chegou a ser concluída | É o próprio número. Venda com devolução não se cancela inteira (OR017) | Loja e vendedor de origem da venda |
| V4 | Vendido líquido | V1 − V3 | — | Cada fato na sua data | — | — | Como V1. Não é lucro, margem nem DRE |
| V5 | Ticket médio | V1 ÷ V2, arredondado ao centavo | — | Como V1 | Como V1 | Não alteram o ticket do dia da venda | Sem venda no período, não há ticket (a tela diz "sem vendas", não zero) |
| V6 | Descontos concedidos | Soma de `desconto_centavos`; percentual = descontos ÷ soma de `subtotal_centavos` | `vendas` (igual à soma de `venda_itens.desconto_centavos`) | `concluida_em` | Vendas de V1 | Desconto de venda cancelada continua na data da venda | Como V1 |
| V7 | Mix por tipo de item | Soma de `preco_unitario_centavos × quantidade − desconto_centavos`, por grupo: Aparelhos (`aparelho`), Acessórios (`acessorio`), Ora Connect (`chip`, `ativacao`, `portabilidade`, `recarga`) e Serviços (`servico`) | `venda_itens.tipo` (gravado quando o item entra na venda) | `concluida_em` da venda | Itens das vendas de V1 | Devolvido por tipo (`venda_devolucao_itens.valor_centavos`) e cancelado por tipo ficam em colunas à parte, na data de cada fato | Como V1. A soma dos grupos é V1 |
| V8 | Mix por categoria | A soma de V7 por `categorias.nome` | `venda_itens` → `variantes` → `produtos` → `categorias` | Como V7 | Como V7 | Como V7 | A categoria é a atual do cadastro (não é retrato da venda); a tela avisa |
| V9 | Vendas por loja | V1, V2 e V3 por `vendas.unidade_id` | `vendas`, `venda_devolucoes` | Como V1 e V3 | Como V1 | Como V3 | Só lojas que quem consulta pode ler; a soma das lojas é o número da rede |
| V10 | Vendas por vendedor | V1, V2 e V3 por `vendas.vendedor_id` | `vendas`, `venda_devolucoes` | Como V1 e V3 | Como V1 | Contam para o vendedor de origem, na data do fato | Gerência: os vendedores da loja ou da rede; vendedor: só a própria linha. O nome de cada vendedor só sai para quem tem `ranking.ver` na loja da venda (`public.ranking_nomes`); sem essa permissão, o painel de vendedores aparece no estado "sem permissão", sem números nem nomes. Não é comissão |

### 3.4 Pagamentos, financeiras e caixa

Conferência: `/financeiro` → "Registros do período" (visões Pagamentos e Caixas); conciliação em `/pagamentos/conciliacao`. P1 a P4 e P6 são os números do lote 1 do financeiro: os detalhes continuam no cabeçalho de `packages/banco/supabase/migrations/20261110224537_financeiro_painel.sql` e de `apps/plataforma/src/lib/financeiro/painel.ts`.

| Cód. | Número | Fórmula | Origem | Data | Situação considerada | Desfazimentos | Não é |
|---|---|---|---|---|---|---|---|
| P1 | Recebido na loja (registro), por meio | Pagamentos confirmados dos meios sem financeira, menos o troco (abatido do dinheiro), mais as entradas de financiamento | `venda_pagamentos`, `vendas.troco_centavos` | `criado_em` do pagamento | `confirmado` | Pagamento desfeito sai do recebido e aparece em estornos (P4) | Liquidação: não prova que o dinheiro caiu na conta |
| P2 | A receber das financeiras | Parte financiada (PayJoy/Aiva) registrada no período | `contas_a_receber` | Registro (`criado_em`) | `aberta` (a situação `recebida` só muda com baixa registrada) | Cancelar a venda cancela a conta; venda financiada não tem devolução parcial (OR016) | Repasse: prazo e taxa sem contrato (decisão pendente P8) |
| P3 | Vale-troca usado | Crédito de devolução usado como pagamento | `vales_troca_usos` | Uso (`usado_em`) | Usado | O uso volta ao vale quando o pagamento é estornado (`devolvido_em`) | Dinheiro novo |
| P4 | Estornos externos pendentes e confirmados | Estornos de cartão, Pix e outros meios externos pedidos no período, separados em aguardando comprovante e confirmados | `estornos_externos` | Pedido do estorno (`solicitado_em`) | `pendente` × `confirmado` (confirmar exige comprovante) | É o próprio número | Devolução de mercadoria (V3); reembolso comprovado só o confirmado |
| P5 | Conciliado × a conciliar | Pagamentos de maquininha com conciliação registrada: valor, valor líquido e data de liquidação | `venda_pagamentos` (`conciliado_em`, `liquidado_em`, `valor_liquido_centavos`) | Liquidação: `liquidado_em`; pagamento: `criado_em` | Conciliado ou não | Conciliação desfeita volta a "a conciliar" | Taxa contratada: a diferença é a observada, não a do contrato |
| P6 | Movimentação dos caixas | Movimentos em dinheiro do livro dos caixas, por tipo; saldo = soma | `caixa_movimentos`, `caixas` | Movimento (`ocorrido_em`) | Todos os tipos (fundo, suprimento, recebimento, troco, sangria, estorno) | Estorno em dinheiro é movimento próprio | Fluxo de caixa da empresa: fundo e suprimento não são receita; sangria não é despesa |

### 3.5 Margem (só com `custo.ver`)

Conferência: `/relatorios` → detalhe por venda e item (custo gravado, preço, desconto) → `/vendas/[id]`. Quem não tem `custo.ver` não recebe margem na tela, na exportação nem pelo endereço direto.

| Cód. | Número | Fórmula | Origem | Data | Situação considerada | Cancelamentos e devoluções | Escopo |
|---|---|---|---|---|---|---|---|
| M1 | Margem bruta | Para cada item com custo gravado: `preco_unitario_centavos × quantidade − desconto_centavos − custo_unitario_centavos × quantidade`; soma dos itens | `venda_itens`, `venda_itens_custos` | `concluida_em` da venda | Itens das vendas de V1 | Devolução: sai `valor devolvido − custo × quantidade devolvida`, na data da devolução; cancelamento: sai a margem inteira da venda, na data do cancelamento | Só lojas em que quem consulta tem `custo.ver`; as outras ficam fora do numerador e do denominador e a tela diz quantas |
| M2 | Cobertura da margem | Valor vendido dos itens com custo gravado ÷ valor vendido de todos os itens | Como M1 | Como M1 | Como M1 | — | Item sem custo gravado não entra em M1 e é contado ("N itens sem custo, R$ X") |
| M3 | Margem percentual | M1 ÷ base líquida: vendido dos itens com custo gravado − devolvido com custo − cancelado com custo (refinado no G2a: como M1 já desconta devoluções e cancelamentos, a base também desconta; sem isso, o percentual de um período com devolução sairia menor que o real) | Como M1 | Como M1 | Como M1 | Na base, como em M1 | Sem base positiva, não há percentual |

**Entregue no G2a** (`public.margem_painel` e `public.margem_itens`, migration `20261113065706_margem_painel`). **Situações do período:** sem venda, devolução nem cancelamento, a margem é zero; movimento só em loja sem `custo.ver`, nenhum número (a tela diz por quê); movimento sem nenhum item com custo gravado, a margem é desconhecida ("sem custo", nunca zero). No gráfico por dia, o dia com movimento e sem custo gravado fica em branco.

**Custo histórico:** vale o custo gravado no item quando ele entrou na venda (`venda_itens_custos`). Mudança posterior de custo, nova entrada de mercadoria ou estorno de entrada não reescrevem a margem de venda passada. **Não é lucro:** taxa de meio de pagamento, comissão, frete e imposto ficam fora.

### 3.6 Estoque

Conferência: `/estoque` (saldo da loja e "onde tem") → detalhe do item ou do produto e o livro de movimentos; transferências em `/transferencias`.

| Cód. | Número | Fórmula | Origem | Data | Situação considerada | Escopo |
|---|---|---|---|---|---|---|
| E1 | Físico | Soma de `quantidade` | `estoque_saldos` | Posição de agora | — | Lojas com `estoque.consultar` |
| E2 | Reservado | Soma de `reservado` | `estoque_saldos` (reservas ativas de venda e de transferência) | Agora | Reserva ativa | Como E1 |
| E3 | Disponível para vender | E1 − E2 | — | Agora | — | Por variação, modelo, categoria e loja |
| E4 | Em trânsito | Soma de `quantidade` das transferências enviadas e ainda não recebidas | `transferencias` (situação `enviada`); aparelho e chip: `itens_serializados.situacao = 'em_transito'` | Agora | `enviada` | Aparece para a origem e para o destino que quem consulta pode ler |
| E5 | Abaixo do mínimo | Variações com E3 menor que `estoque_minimo` | `variantes.estoque_minimo` | Agora | Variação ativa | O mínimo é da variação e vale igual em toda loja; mínimo por loja não existe |
| E6 | Parado há mais de 60 dias | Saldo disponível sem saída por venda nos últimos 60 dias; aparelho e chip: item disponível há mais de 60 dias na loja | `estoque_movimentos` (`ocorrido_em`, tipo `venda`), `itens_serializados` | Agora | Disponível | 60 dias é o corte da referência (REPORT-007); mudar o corte é decisão do proprietário |
| E7 | Pendências | Transferências a separar, enviar e receber; inventários em contagem ou aguardando decisão; itens de venda cancelada aguardando a conferência do retorno físico; aparelhos e chips sem conferência do dia | `transferencias`, `inventarios`, `venda_retornos`, `itens_serializados.conferido_em` | Agora | Em aberto | Loja do turno |
| E8 | Valor em estoque (custo) | Soma de quantidade × custo vigente da variação | `estoque_saldos`, `custos` (o custo é da variação e vale para toda a rede) | Agora | Variação sem custo fica fora e é contada | Só com `custo.ver` |

### 3.7 Ora Connect

Conferência: `/connect` (operações, com a evidência de cada uma) e `/vendas/[id]` (chip e cobrança na loja).

| Cód. | Número | Fórmula | Origem | Data | Situação considerada | Não é |
|---|---|---|---|---|---|---|
| T1 | Chips vendidos | Soma de `quantidade` dos itens de tipo `chip` | `venda_itens` das vendas de V1 | `concluida_em` da venda | Como V1 | Ativação: vender o chip não ativa a linha |
| T2 | Ativações, portabilidades e recargas confirmadas | Contagem por tipo; uma linha por operação | `connect_producao` (`operacao_id` único) | `confirmado_em` | Confirmada por evidência da operadora ou por revisão da gerência (as duas origens aparecem separadas) | Operação registrada, enviada ou sem resultado |
| T3 | Em andamento ou sem resultado | Contagem por situação | `connect_operacoes` (`registrada`, `enviando`, `aguardando_operadora`, `resultado_desconhecido`) | `criado_em` | As quatro situações | Produção |
| T4 | Valor de face das recargas confirmadas | Soma de `valor_face_centavos` | `connect_producao` | `confirmado_em` | Como T2 | Receita ou repasse |
| T5 | Cobrado na loja | Já está em V1 e P1 pela venda vinculada (`venda_item_id`) | `vendas`, `venda_pagamentos` | Como V1 e P1 | Como V1 | Um número a somar de novo |
| T6 | Débito registrado na carteira | Soma de `valor_debitado_centavos` | `connect_operacoes_custos` | Conclusão da operação | Confirmada | Saldo ou extrato da carteira (externos) |
| T7 | Repasse e comissão da operadora | Sem contrato: indisponível | — | — | — | — |
| T8 | Consumo da linha, saldo e extrato da carteira | Externos: só com contrato e evidência oficial da Nogle (C1/C2) | — | — | — | Fato local |

### 3.8 Metas e equipe

| Cód. | Número | Fórmula | Origem | Data | Regra |
|---|---|---|---|---|---|
| X1 | Meta | Valor definido por quem tem `metas.gerir`, por loja ou vendedor e por período | Modelo de metas (não existe; G4) | Vigência da versão | Mudar a meta cria versão nova; o passado continua com a versão que valia. Nenhum valor de meta é inventado |
| X2 | Atingimento | Produção do período ÷ meta vigente | Meta e os números V e T | Como a produção | A base da produção (bruto ou líquido, que tipos contam) é regra versionada, escolhida pelo proprietário. Sem meta, a tela diz "meta não definida", não 0% |
| U1 | Pessoas por papel | Contagem de pessoas com vínculo vigente, por papel | `vinculos` (`fim` nulo ou futuro), `papeis` | Agora | Quem tem dois papéis conta em cada um; o total de pessoas aparece ao lado |

## 4. Estados de todo painel real

O painel mantém o título e o espaço em qualquer estado; só muda o conteúdo.

| Estado | Quando | O que a tela mostra |
|---|---|---|
| Com dados | Consulta bem-sucedida e fatos no período | Gráfico, legenda (duas séries ou mais), tabela acessível e caminho para os registros |
| Sem movimentação | Consulta bem-sucedida e nenhum fato | "Nenhum(a) … no período": zero só aqui |
| Sem histórico comparável | Período anterior sem fatos | O número atual, sem percentual e sem série anterior |
| Fonte indisponível | A função ou a fonte ainda não existe neste ambiente, ou depende de contrato externo | "Indisponível", com o motivo; nenhum número |
| Falha de consulta | Erro ao ler | Aviso de falha com nova tentativa; nunca zero |
| Sem permissão | Quem consulta não pode ver o número | O painel diz que não há permissão; custo e margem não aparecem nem em agregado |

## 5. Matriz por área e função

| Área | Função da referência | Rota real | Fonte persistente | Regra / permissão | Prova | Estado |
|---|---|---|---|---|---|---|
| Financeiro | Vendas e devoluções por período | `/financeiro` | `public.financeiro_painel` (soma do período inteiro no banco) sobre `vendas` e `venda_devolucoes` | `venda.ver_unidade` (loja do turno) ou `venda.ver_todas` (rede); RLS em cada linha somada | `packages/banco/src/financeiro-painel.test.ts`, `lib/financeiro/painel.test.ts`, `app/financeiro/financeiro.test.ts` | Parcial (lote 1) |
| Financeiro | Recebimentos por meio | `/financeiro` | `venda_pagamentos` (troco, entrada de financiamento, vale) e `contas_a_receber` | Idem | Idem (reconcilia pagamentos × livro do caixa) | Parcial: registro, não liquidação |
| Financeiro | Caixas e fechamentos | `/financeiro` | `caixas`, `caixa_movimentos` | Caixas da loja só com `caixa.conferir` (RLS); o vendedor vê o próprio em `/caixa` | Idem | Parcial |
| Financeiro | Detalhamento e exportação | `/financeiro` (registros por página) e `/financeiro/exportar` (CSV) | As mesmas tabelas, lote a lote (limite da API) | Mesma permissão e escopo, conferidos no servidor | `financeiro.test.ts` | Parcial: CSV; XLSX/PDF não |
| Financeiro | Ticket, descontos, margem e relatórios | `/inicio` (indicadores do período, desde o G1; margem desde o G2a) e `/relatorios` (séries por dia, margem e exportação, desde o G2a) | Seções 3.3 e 3.5 | `custo.ver` para margem | Os testes do Início e dos Relatórios (linhas "Início" e "Relatórios") | Parcial (G2a, testado em desenvolvimento): falta a jornada com login (J1) e a homologação |
| Financeiro | Contas a pagar, DRE, previsão, repasses | — (a tela mostra "indisponível") | Modelos ainda não existem | — | — | Não iniciado (L7b, L8) |
| Pagamentos | Maquininhas e conciliação manual | `/pagamentos/maquininhas`, `/pagamentos/conciliacao` | `terminais`, `venda_pagamentos` (liquidação, valor líquido, referência) | `terminal.gerir`, `pagamento.conciliar` | `packages/banco/src/pagamentos-conciliacao.test.ts` | Parcial (L7a): manual; extrato e API da adquirente não |
| Início | Pendências, atalhos e painéis de vendas do período, nas visões da rede, da loja e do vendedor | `/inicio` | Contagens por tabela; `public.vendas_painel` (vendas, mix, lojas e vendedores), `public.financeiro_painel` (recebimentos e gaveta), `public.ranking_nomes` (nomes do ranking) e, desde o G2a, `public.margem_painel` (margem bruta, só com `custo.ver`) | Cada bloco só com a permissão dele: `venda.ver_todas`, `venda.ver_unidade` ou `venda.ver_propria`; gaveta com `caixa.conferir`; ranking com `ranking.ver` | `packages/banco/src/vendas-painel.test.ts`, `lib/inicio/painel.test.ts`, `app/inicio/inicio.test.ts`, `componentes/escala.test.ts` | Parcial (G1 e G2a, testado em desenvolvimento): faltam metas (G4), ranking para o vendedor (decisão P3) e a jornada com login (J1, depende de A1) |
| Relatórios | Evolução, margem, ticket, descontos, lojas e mix | `/relatorios` e `/relatorios/exportar` (G2a) | `public.vendas_painel`, `public.financeiro_painel`, `public.margem_painel` e `public.margem_itens` | `venda.ver_unidade` (loja do turno) ou `venda.ver_todas` (rede, com filtro de loja); margem e detalhe com `custo.ver`, perguntado na loja do turno e conferido pelo banco loja a loja | `packages/banco/src/margem-painel.test.ts`, `lib/margem/painel.test.ts`, `lib/relatorios/painel.test.ts`, `app/relatorios/relatorios.test.ts` | Parcial (G2a, testado em desenvolvimento): faltam chips e ativações por dia (G4), estoque parado (G3), metas (G4) e a jornada com login (J1) |
| Vendas | Lista e comprovante | `/vendas`, `/vendas/[id]` | `vendas`, `venda_itens`, `venda_pagamentos` | Vendedor: as próprias; gerência: a loja | `vendas.test.ts`, `lib/vendas/lista.test.ts` | Parcial (homologação com perfis de teste) |
| PDV | Carrinho, cliente, desconto, pagamento misto | `/vender` | RPCs `criar_venda` … `concluir_venda` | `venda.registrar`, `desconto.*` | `packages/banco/src/vendas.test.ts`, `pdv-l6.test.ts`, E2E | Parcial (L6a) |
| Caixa | Abrir, suprir, sangrar, fechar, conferir | `/caixa` | `caixas`, `caixa_movimentos` | `caixa.abrir`, `caixa.conferir` | Testes do banco | Testado (PAY-004/006) |
| Estoque | Consulta por IMEI/ICCID, saldo, "onde tem" e transferências | `/estoque`, `/transferencias` | `itens_serializados`, `estoque_*`, `transferencias` | `estoque.*` | `catalogo-estoque.test.ts`, `integridade-estoque.test.ts`, `transferencias.test.ts` | Parcial: painéis no G3 |
| Estoque | Entrada de mercadoria e inventário | `/estoque/entrada`, `/estoque/inventario` | `fornecedores`, `entradas_estoque`, `entrada_itens`, `inventarios`, `inventario_itens` | `estoque.receber`, `estoque.conferir`; custo da entrada só com `custo.ver` (R1) | `entrada-estoque.test.ts`, `inventario.test.ts` | Parcial (L4a, L4b, R1) |
| Catálogo | Produtos, variações, preços, campanhas e fotos | `/catalogo`, `/produtos`, `/produtos/precos` | `produtos`, `variantes`, `precos`, `custos`, `fotos_produto` | `catalogo.gerir`, `preco.alterar`, `catalogo.fotos`; custo só com `custo.ver` | `catalogo-cadastro.test.ts`, `precos.test.ts`, `fotos-produto.test.ts` | Parcial (L3a, L3b) |
| Importação por planilha (Rein) | Prévia, conferência integral, aprovação por outra pessoa e desfazer | `/produtos/importar` | `importacoes`, `importacao_linhas` | `importacao.executar`, `importacao.aprovar` | `importacao.test.ts`, `importacao-correcoes.test.ts` | Parcial (L3c, R2): estoque inicial por arquivo (DEC-U24) e arquivo real da Rein (B1) faltam |
| Lojas | Cadastro e configuração das lojas | `/lojas` | `unidades`, `unidade_configuracoes` | `unidades.gerir` | `lojas.test.ts` | Parcial (L2) |
| Aprovações, notas, auditoria | Filas e trilha | `/aprovacoes`, `/notas`, `/auditoria` | `aprovacoes_desconto`, `notas_pedidos`, `auditoria` | `desconto.aprovar`, `nota.aprovar`, `auditoria.ver` | Testes do banco e de telas | Testado/parcial |
| Ora Connect | Ativação, recarga, portabilidade | `/connect` | `connect_operacoes`, `connect_producao` e worker | `connect.*`; segredos só no worker | `connect.test.ts`, `connect-lote2.test.ts` e testes do worker | Parcial: Nogle real depende de C1/C2; painéis no G4 |
| Equipe | Usuários, convites, bloqueios | `/equipe` | `vinculos`, `convites` e worker de identidade | `usuarios.gerir` | `acesso-equipe.test.ts` | Parcial: depende de A1/A2; gráfico por papel no G5 |
| Metas e comissões | Painéis e ranking | — | — | `metas.gerir`, `metas.ver_unidade`, `metas.ver_propria` | — | Não iniciado (G4; valores e regras são decisão do proprietário) |
| CRM | Clientes, funil, agenda, duplicados e segmentos | `/clientes`, `/clientes/duplicados`, `/clientes/segmentos`, `/crm`, `/crm/agenda` | `clientes`, `oportunidades`, `atividades`, `cliente_consentimentos` | `cliente.*`, `crm.atender`, `crm.gerir` | `clientes.test.ts`, `clientes-mesclagem.test.ts`, `crm.test.ts` | Parcial (L5a, L5b, L5c) |
| WhatsApp | Conversas e campanhas | — | — | — | — | Não iniciado (depende de contrato oficial) |
| Assistência | Ordens de serviço | — | — | `os.*` | — | Não iniciado |
| Canais online | Loja e marketplaces | — | — | — | — | Não iniciado |
