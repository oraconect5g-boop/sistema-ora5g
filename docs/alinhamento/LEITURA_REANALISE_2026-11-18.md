# Leitura da reanálise do Codex de 18/11/2026 e a reconciliação com o HEAD

**Data:** 18/11/2026 · **Por:** Claude Code (programador) · **Para:** o proprietário e o Codex (revisor)

**Pacote lido:** `docs/analises/reanalise-2026-11-18/`, na branch `docs/auditoria-planejamento-20261117` da PR #104 (commits `d0eea97` e `b5ab7b8`), sem merge. O pacote confere com o próprio `SHA256SUMS.txt` (os 18 arquivos listados).

**Corte da reanálise:** `27b4f6eeb9b4b456b2283d9b365ebecc0901f6ef` (o lote VEL-b). **HEAD na hora da reconciliação:** o mesmo `27b4f6e`, sem commit novo na `main`. As conclusões valem como estão.

## 1. O que foi lido por inteiro

| Arquivo | Como |
|---|---|
| `README.md`, `RELATORIO.md`, `ORIENTACAO_CLAUDE.md`, `SOLUCOES_PARA_AVALIACAO.md` | por inteiro |
| `evidencias/README.md`, `auditoria-20261118.test.ts`, `auditoria-planilha-real.test.ts`, `ci-resumo.txt`, `testes-dirigidos-app.log`, `testes-dirigidos-banco.log`, `testes-regressao-novos.log`, `advisors-resumo.json`, `dominio.json`, `SHA256SUMS.txt` | por inteiro |
| `evidencias/runtime-consolidado.json` | por inteiro: as contagens, o estoque por unidade, os papéis, as transferências, as rotinas e os registros de 24 h. A lista das 109 migrations foi conferida contra o banco, não linha a linha |
| `AGENTS.md`, `README.md` (raiz), `CLAUDE.md`, `docs/alinhamento/ANALISE_DO_PLANO.md` | por inteiro. `ESTADO_ATUAL_E_PASSAGEM.md` e `PEDIDO_DE_REVISAO_CODEX.md` são escritos pelo Claude Code a cada lote: conferidos nos trechos que mudam |

## 2. O que foi conferido por programa, sem leitura linha a linha

| Arquivo | O que foi conferido |
|---|---|
| `MATRIZ_179.json` e `.md` | As 179 entradas, campo a campo: a nota, o estado e a evidência são idênticos ao `status-requisitos.json` no corte (0 diferenças); o requisito, o critério e a prioridade são os do `backlog.json` (0 diferenças); nenhuma entrada traz comentário próprio da auditoria (o conteúdo dela está no `RELATORIO.md`); nenhuma está marcada como homologada |
| `ARQUIVOS_ALTERADOS.csv` | Os 281 caminhos são exatamente os de `git diff 03123d0 27b4f6e` |
| `INVENTARIO_ARQUIVOS.csv` | Os 1.336 caminhos e os blobs são exatamente os de `git ls-tree -r 27b4f6e` (0 diferenças) |

## 3. O que ainda falta ler por inteiro (sem dar por lido)

Os registros `LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md` (seção 3) e `LEITURA_AUDITORIA_2026-11-17.md` listam as fontes históricas que não foram lidas por inteiro:

| Fonte | Tamanho | Quando |
|---|---:|---|
| PR #97: as matrizes da execução do prompt 86, a verificação e as versões do PR de `APIS_E_HABILITACOES_NECESSARIAS.md` e `VARIAVEIS_DE_AMBIENTE.md` | cerca de 450 KB | antes do lote das integrações (a tabela por API) e do lote da base operacional |
| `INVENTARIO_ARQUIVOS_E_FUNCOES.md` (pacote de 16/11) | 312 KB | por diretório, no lote que mexer nele |
| PR #85, #81, #77, #68, #66, #67 e #33 | cerca de 1,6 MB | por tema, conferindo contra a `main` (muitos são versões antigas de arquivos vivos) |

## 4. Os achados no HEAD

| Achado | No HEAD (`27b4f6e`) | O que se fez | Prova |
|---|---|---|---|
| **F18-01:** a célula numérica `0.625` do Excel virava 625 na carga | Reproduzido: no código da `main`, a prova da auditoria falha com `expected 625 to be null` | **Lote AUD-b.** A planilha guarda quais células eram número no Excel (`Planilha.numericas`). A quantidade e o dinheiro leem pela origem: o número do Excel é o próprio número; o texto segue a planilha brasileira, com o contrato de cada forma. A fração vai para conferir, nunca arredondada. O mesmo defeito existia no preço e no custo (`12.345` virava R$ 12.345,00) e foi corrigido junto | `lib/importacao/auditoria-20261118.test.ts` (a prova, sem mudança); `lib/estoque/carga.test.ts` e `lib/importacao/catalogo.test.ts` (os contratos de cada origem) |
| **F18-02:** a última linha incompleta com EAN e preço saía como total | Reproduzido: no código da `main`, a prova falha com a linha classificada como rodapé | **Lote AUD-b.** Rodapé **comprovado** (o rótulo "Total", ou números com pelo menos uma soma que confere e nenhum campo do item preenchido) sai sozinho; **candidato** (sem soma que confira, ou com o EAN) vai à prévia, com o aviso, e só sai quando quem envia marca "deixar de fora a última linha": a decisão fica gravada na prévia, com outra impressão digital | a mesma prova; `catalogo.test.ts`, `carga.test.ts` e `app/produtos/importar/importar.test.ts` |
| **F18-03:** físico maior que o disponível entra inteiro na carga | Confirmado na função `estoque_carga_previa` (classifica como `entrar`) | **Lote REIN-c:** a linha fica para conferir, com a pendência; a carga com pendência sem decisão é recusada (OR042); quem importa ou aprova decide cada linha com o motivo (lançar só o disponível, lançar o físico conferido na loja ou deixar de fora), e aplicar lança a quantidade decidida. Nenhuma reserva é inventada | `packages/banco/src/estoque-carga.test.ts` (os casos F18-03); `apps/plataforma/src/app/estoque/carga/carga.test.ts` |
| **F18-04:** o checkpoint e a tela de entregas um lote atrás | Confirmado | **Lote AUD-b:** a tela `/entregas` mostra o lote sem a publicação registrada como "Nesta versão (commit); o registro da publicação entra no próximo lote", porque os dados dela vêm do checkpoint do mesmo commit; o checkpoint registra o VEL-b no ar; a lista de dependências foi corrigida (extratos, Meta e marketplaces por arquivo; Web Push com aceite; a planilha já entregue, falta a cópia privada ao servidor) | `lib/entregas/entregas.test.ts`; os documentos deste lote |
| **F18-05:** a transferência deve reduzir o disponível ao pedir | Confirmado: pedir não reserva | **Lote TRF-c:** o pedido reserva na origem na mesma transação, com a trava da venda; a remessa é tudo ou nada; no aparelho e no chip, a reserva pela quantidade vira a de cada IMEI na separação, sem contar duas vezes; enviar baixa o físico uma vez. A D-049 fica decidida pela orientação do proprietário de 18/11 | `packages/banco/src/transferencias.test.ts`, `transferencia-remessa.test.ts` e `concorrencia.test.ts` (o pedido e a venda disputando a última capa, nas duas ordens; a mesma remessa duas vezes) |
| **F18-06:** o aviso assinado do pagamento confirma sem reconsultar o provedor | Confirmado em `apps/worker/src/cobranca/cobranca.ts` (o adaptador está desligado) | **Lote PAY-b:** confirmar só depois da reconsulta | a fazer |

## 5. A ordem dos lotes daqui em diante

1. **AUD-b:** F18-01, F18-02 e F18-04. No ar desde 18/11 (`bf5eaf5`, build 10:31).
2. **REIN-c:** F18-03, a diferença entre o físico e o disponível como pendência de reconciliação na carga. No ar desde 18/11 (`488844b`, build 11:14).
3. **TRF-c:** F18-05, a transferência que reserva no pedido.
4. **PAY-b:** F18-06, o contrato do pagamento antes de ligar.
5. **INTEG-d:** a tabela de uma linha por API, com todas as colunas que a orientação pede, depois da leitura da PR #97.
6. **Na sequência:** a base operacional e as jornadas, que dependem da chave secreta do Supabase, da cópia da planilha ao servidor e dos CNPJs. Depois as integrações por contrato, a loja, os gráficos, a demonstração e o VEL-c, cada uma no ponto em que não depende de terceiros.
