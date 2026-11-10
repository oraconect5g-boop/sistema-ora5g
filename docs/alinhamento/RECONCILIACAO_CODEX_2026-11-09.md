# Reconciliação dos achados do Codex com o código atual — 09/11/2026

**Por:** Claude Code (programador) · **Para:** Codex (revisor) e proprietário
**Origem:** [prompt consolidado](PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md) e [índice dos relatórios](INDICE_RELATORIOS_CODEX_2026-11-09.md), lidos no HEAD da PR #33 (`290f1111`) sem merge nem cópia sobre a main; os dois foram trazidos para a main no passo 0 (seção 5).
**Main conferida:** `d730e9a05e65` (inclui devolução parcial, troca e vale-troca, posteriores ao consolidado `9b1109e`).

## 1. Como os achados foram conferidos

- **Reprodução, não leitura de issue.** As 16 provas vermelhas das pastas `docs/analises/evidencias/*` da PR #33 foram copiadas para os destinos temporários indicados em cada LEIA-ME e executadas contra a main `d730e9a` com as correções do Lote 1 (abaixo), banco em memória ou PostgreSQL 17 local, dados fictícios. As cópias foram apagadas depois. O resultado bruto fica no servidor em `~/ci/repro-d730e9a-1210.txt`; o resumo está na coluna "Reprodução atual".
- **Limite de acesso:** deste servidor não há `gh` nem API do GitHub (o conector GitHub também falhou nesta sessão). Por isso, o estado das issues foi lido nos relatórios da PR #33 e não nos comentários das issues. Esta reconciliação fica registrada no GitHub por commit, pelo mecanismo autorizado (deploy key). Nenhum token foi pedido.
- **Inventário recalculado:** são 179 requisitos no `backlog.json` (P0 78, P1 74, P2 27). Deles, 72 são acompanhados em `status-requisitos.json`: 18 testados em desenvolvimento, 40 parciais, 11 só em demonstração, 2 bloqueados e 1 respeitado. **Nenhum está homologado nem em produção.** (Atualização de 10/11: com o lote 5, ORA-INV-007 passou a testado: 73 acompanhados e 19 testados; o ORA-CONNECT-009 entrou como não iniciado, vindo da PR #33.) Status não sobe por haver tela, migration ou CI verde.
- **Decisões aplicadas sem perguntar de novo:** a stack Supabase/PostgreSQL continua (nada de Firebase). A rede tem 11 lojas comerciais mais o local DEFEITOS, que não é uma 12ª loja. Rein só por arquivo. Ora Connect pela API oficial Nogle.

## 2. Matriz

Legenda do estado: **corrigido** (com prova nesta rodada) · **reproduzido** (o defeito existe na main atual) · **parcial** · **demonstração** (só na demo) · **bloqueio externo** · **não reexecutado** (com o motivo).

### Lote 1 — acesso e configuração (branch `fix/ORA-acesso-configuracao-lote1`)

| ID | Regra | SHA auditado | Código atual (antes) | Reprodução atual | Estado | Correção / aceite | Dependência | Evidência |
|---|---|---|---|---|---|---|---|---|
| #55 / REV-052 | Web recebe só a configuração pública; segredos Nogle e chave secreta ficam no worker | 9b1109e | `publicar.sh` removia só segredos Supabase/banco | Prova da PR barra em "filtro de publicação mudou" porque o filtro foi trocado. Adaptei a prova ao contrato novo | **corrigido** | Lista de nomes permitidos (`deploy/homologacao/ambiente-web.sh`): `APP_ENV`, `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY`, `NEXT_PUBLIC_*`, gravada com permissão 600. Publicação, republicação e retorno ensaiados com valores fictícios na porta 3190 | — | `packages/config/src/ambiente-web.test.ts` (3). Ensaio: web NOGLE=0 SECRETA=0, worker NOGLE=2 SECRETA=1, `/saude` 200, segunda publicação "já está no ar". Nenhum valor exibido |
| #27 / REV-026 | Bloquear o perfil exige autoridade sobre todas as organizações da pessoa | 55d10af | `alterar_situacao_pessoa` só olhava a organização do ator | A prova da PR agora termina em **42501** (antes bloqueava). Ela esperava retorno booleano | **corrigido** | Recusa com 42501 e orienta a encerrar o vínculo na própria equipe. Controle positivo: pessoa só da própria rede é bloqueada | — | `correcoes-acesso.test.ts` (#27) |
| #28 / REV-027 | Ninguém se convida, nem pelo e-mail novo do Auth | 55d10af | Conferia só o e-mail do perfil | Prova termina recusada | **corrigido** | `convidar_pessoa` também confere o e-mail do Auth do ator. `identidade_concluir_convite` recusa quando a pessoa do Auth é quem convidou e cancela o convite (retorna `recusado`) | — | `correcoes-acesso.test.ts` (#28, 2 casos); worker `identidade.test.ts` |
| #29 / REV-028 | Ao menos um dono ativo, também com duas conexões | 55d10af | Sem trava por organização | A prova da PR espera a segunda transação sem soltar a primeira e cai no `lock_timeout` (55P03). Ela comprova a espera, mas não chega ao 23514 | **corrigido** | Trava consultiva por organização (`equipe_donos`) em `encerrar_vinculo` e no bloqueio de dono, com a conferência feita depois da espera. A segunda transação recebe 23514 | — | `concorrencia.test.ts` "dois donos encerrando…" (PostgreSQL 17, duas conexões, espera verificada em `pg_stat_activity`) |
| #30 / REV-029 | Convite de quem perdeu a autoridade não vira vínculo | 55d10af | Worker processava sem reconferir | Prova recebe 22023 "não está em processamento": o convite foi cancelado antes do e-mail, com 0 vínculos | **corrigido** | `privado.pessoa_gere_equipe` confere a autoridade sem sessão. O convite é cancelado antes do e-mail e recusado na conclusão. Controle: autor válido conclui | — | `correcoes-acesso.test.ts` (#30) |
| #45 / REV-043 | Leitura da aprovação própria só com perfil, vínculo, sessão e turno vigentes | 371cef0 | Ramo `solicitado_por = auth.uid()` sem acesso vigente | **passa** (bloqueio e sessão revogada: 0 linhas) | **corrigido** | Policy `aprovacoes_ler` exige `unidade_id in unidades_visiveis()` | — | `correcoes-acesso.test.ts` (#45) e prova da PR verde |
| #56 / REV-053 | Vendedor sem `custo.ver` não obtém o débito da carteira por tabela, evidência, evento ou tela | 9b1109e | Coluna `valor_debitado_centavos` legível e exibida | **passa** (a coluna saiu da tabela: 42703, 0 linhas) | **corrigido** | Tabela `connect_operacoes_custos` com RLS `custo.ver`. O débito sai da evidência e dos eventos. A tela só consulta com `custo.ver` | — | `correcoes-acesso.test.ts` (#56); `ponta-a-ponta.test.ts` do worker |
| #11 / REV-009 | Login SSR, renovação, cookies, saída, revogação e segunda visita com usuário real de teste | 8e1625d | Sem teste com usuário real | Não reproduzível sem usuário | **bloqueio externo** | E2E pronto para rodar assim que existir o usuário de teste fictício. O login usa só a chave pública | Usuário de teste no `ora5g-dev`: o proprietário cria pelo painel, ou grava `SUPABASE_SECRET_KEY` no worker e o Claude cria | Lista única, linha A1 |

Migration do lote: `20261109150526_correcoes_acesso_lote1.sql`, aplicada no `ora5g-dev`. A md5 registrada (`0db66893…`) confere com o arquivo, e a reversão foi ensaiada pelo teste de reversão. Os tipos foram gerados de novo.

### Lote 2 — dinheiro, estoque e Ora Connect (branch `fix/ORA-integridade-lote2`, commit `163c44b`)

Antes da correção, todos se reproduziam na main `d730e9a` mais o Lote 1 (`~/ci/repro-d730e9a-1210.txt`). Depois da correção, as provas da PR #33 foram rodadas de novo no `163c44b` (`~/ci/repro-163c44b-1606.txt`). Nas provas de vendas e da Nogle, os casos que agora dão erro aparecem como 25P02: o savepoint da prova fica fora da troca de papel e o erro real é mascarado. Por isso elas rodaram também com **só o harness adaptado**, com o savepoint dentro da sessão e nenhuma asserção mudada (`~/ci/repro-163c44b-adaptada.txt`).

| ID | Regra | SHA auditado | Antes (d730e9a) | Depois (163c44b) | Estado | Regressão permanente |
|---|---|---|---|---|---|---|
| #46 / REV-044 | Entrada Pix/cartão de financiamento exige comprovante | 371cef0 | 4 de 4 concluíam | 4 de 4 dão **OR009** | **corrigido** | `integridade-lote2.test.ts`; `regras.test.ts` (tela) |
| #47 / REV-045 | Estorno de entrada em dinheiro não deixa o caixa negativo | 371cef0 | saldo −R$ 200,00 | **23514**, saldo 0 | **corrigido** | caixa com 1 centavo a menos recusa e nada muda |
| #48 / REV-046 | Financiamento não gera troco; banco = domínio | 371cef0 | banco aceitava | banco **OR009** = domínio inválido | **corrigido** | 7 vetores comuns SQL × TypeScript |
| #49 / REV-047 | Estorno devolve o recebido líquido | 371cef0 | devolvia 20000 de 19900 retidos | o cenário da prova não se monta mais (a venda com financiamento acima do preço é recusada pelo #48) | **corrigido** | cenário válido: troco de linha em dinheiro e entrada em dinheiro; devolve exatamente o retido (29.900) |
| #50 / REV-048 | Pix/cartão: estorno pedido ≠ confirmado | 371cef0 | `estornado` com data | `estorno_pendente`, sem data | **corrigido** | confirmação só com comprovante, com autor; UPDATE e DELETE diretos recusados; financiada; devolução parcial |
| #51 / REV-049 | Cancelamento não repõe estoque sem conferência | 371cef0 | aparelho e chip `disponivel` | `vendido`, fora do estoque | **corrigido** | retorno conferido por IMEI/ICCID e condição; "não voltou"; chip com ativação viva (OR013) |
| #52 / REV-050 | Valor inválido não vira zero | 371cef0 | 3 de 3 chegavam como 0 | prova 4 de 4 verde (nenhuma RPC) | **corrigido** | `valores-invalidos.test.ts` (vazio também é recusado) |
| #53 / REV-051 | Mesma ordem de travas venda/aprovação | 371cef0 | 40P01 | a prova continua dando 40P01: ela trava a APROVAÇÃO à mão antes de chamar a função, simulando a ordem antiga que a função não usa mais | **corrigido** | `concorrencia.test.ts`: as duas ordens reais (cada função trava primeiro a venda), sem 40P01 |
| #34 / REV-032 | Repetição confere o conteúdo inteiro | aebbdcc | 3 casos aceitos | prova 9 de 9 verde | **corrigido** | `integridade-lote2.test.ts` |
| #35 / REV-033 | Um ICCID por chip | aebbdcc | aceito | prova 22 de 22 verde | **corrigido** | `venda.test.ts` |
| #57 / REV-054 | LINK não cobra serviço pago no caixa | 9b1109e | aceito | **22023** | **corrigido** | `connect-lote2.test.ts`; regra da tela |
| #58 / REV-055 | Chave confere o titular, com privacidade | 9b1109e | devolvia a operação antiga | **OR004** | **corrigido** | também depois do descarte do pedido; normalização; segredo ilegível |
| #59 / REV-056 | Uma evidência confirma uma recarga só | 9b1109e | 2 produções | **0** produções (conferência da gerência) | **corrigido** | o controle da prova confirma sem as datas da recarga, o que agora não confirma de propósito; com a evidência completa, como o worker envia, conta uma vez |

### Lote 3 — CSV, busca e fotos (branch `fix/ORA-busca-csv-fotos-lote3`)

| ID | Regra | SHA auditado | Antes | Depois | Estado | Regressão permanente |
|---|---|---|---|---|---|---|
| #38 / REV-036 | CSV não exporta fórmula | aebbdcc | `=1+1` saía como célula | prova da PR 1 de 1 verde | **corrigido** | `ExportarCsv.test.ts`: `=`, `+`, `-`, `@`, tabulação e retorno ganham apóstrofo; número e valor em reais negativos ficam iguais |
| #40 / REV-038 | Busca acha produto além do limite | aebbdcc | 2 de 3 falhavam | a prova da PR dá `TypeError: ilike is not a function`: o simulador dela não aplica filtro, e o filtro agora vai ao banco | **corrigido** | `catalogo/busca.test.ts` (7), com simulador que aplica `ilike`/`in`/`limit` na ordem do PostgREST; nome, SKU e nome da variante; `%` não vira curinga. Estoque com a mesma correção |
| #41 / REV-039 | Foto quebrada volta com URL nova | aebbdcc | falhava | fixture do Codex verde (360 e 1280 px) | **corrigido** | a falha vale só para a URL que falhou |
| #42 / REV-040 | Repetir registro não duplica | aebbdcc | 23505; nova tentativa reenviava o arquivo | banco 2 de 2 e fixture verdes | **corrigido** | `fotos-lote3.test.ts`; a tela guarda o caminho enviado e só repete o registro; migration `20261109191416_fotos_idempotentes_lote3` |
| #43 / REV-041 | Descartar libera o mesmo arquivo | aebbdcc | campo retinha o arquivo | fixture verde | **corrigido** | descartar e concluir limpam a escolha |
| índice das fotos | Não manter índice redundante só para o aviso 0001 | aebbdcc | controle do Codex falhava (o planejador usava o índice redundante criado em 20261108233711) | controle verde | **corrigido** | o índice redundante saiu; o aviso 0001 do advisor fica aceito, como o Codex pediu |

Fixture dos componentes (`docs/analises/evidencias/2026-11-08-fotos/fixture` da PR #33, copiada e apagada depois): 12 de 12 verdes; antes eram 6 de 12. Resultado no servidor em `~/ci/fixture-fotos-resultado.txt`.

### Lote 4 — demonstração (branch `fix/ORA-demo-lote4`)

As correções valem só para a demonstração (`/demo`). As telas reais já seguiam estas regras: face da recarga fora da receita, produção só com evidência, autoaprovação recusada no banco e saldo da carteira na Nogle.

| ID | Regra | Antes | Depois | Regressão permanente |
|---|---|---|---|---|
| #31 / REV-030 | Valor de face da recarga não é receita da Ora | 3000 no faturamento | 0; controle: acessório conta | `src/demo/revisao-demo-lote4.test.ts` |
| #32 / REV-031 | "Só confirmadas" não conta ativação pendente | 1 | 0; controle: confirmada conta | idem |
| #36 / REV-034 | Quem pediu não entra na própria fila | aparecia | não aparece; controle: outro gerente vê | idem |
| #37 / REV-035 | Período comparado com período anterior do mesmo tamanho | 30 dias × 1 dia (+2900%) | sem comparação quando não há período anterior completo; 7 e 14 dias continuam comparando | `relatorios/comparacao.test.ts` (prova da PR) |
| #39 / REV-037 | Carteira simulada não fica negativa | −R$ 51,28 e botão ativo | botão trava com aviso de saldo insuficiente | `e2e/carteira-demo.spec.ts` (prova do Codex com o laço "até o botão travar") |

### Demais achados abertos

| ID | Reprodução atual | Estado | Próximo passo |
|---|---|---|---|
| #44 | Produção (`npm audit --omit=dev`): 0. Desenvolvimento: 8 moderadas, todas de `minimatch` 10.2.6 (GHSA-g3hv-75wg-m249, faixa ≥7.0.0 <11.0.1) via `typescript-eslint` ← `eslint-config-next`. Conferido em 09/11: a versão mais nova do `@typescript-eslint/typescript-estree` (8.72.2) ainda pede `minimatch ^10.2.2` | **bloqueio externo** (sem atualização compatível) | Não aplicar o "fix" do npm (downgrade de versão maior do `eslint-config-next` para 15.5.29) nem forçar `minimatch` 11 contra a faixa declarada. Risco só no lint dos arquivos do próprio repositório. Reconferir quando o `typescript-eslint` publicar a dependência corrigida |
| #54 | Respostas da Nogle de 10/11 (estoque de PDV, transferências de chip, extrato, relatórios, consulta pelo uuid) registradas na referência §3.1; confirmação pelo uuid implementada e desligada até a rota ser liberada. Três operações (ativação, recarga, portabilidade) no adaptador; cobrança, carteira, recorrência e repasse sem contrato confirmado | **parcial** / bloqueio externo nas partes sem contrato | Partes com contrato documentado primeiro |
| #60 | Pedido interno e DEFEITOS: **implementados** em desenvolvimento (ADR-007, branch `feature/ORA-transferencias-defeitos-lote5`, migration `20261109193043`), com o painel "onde tem" e a tela de transferências | **parcial**: falta o cadastro real das 11 lojas e do DEFEITOS (linha B2) e a conciliação dos totais da imagem | Homologar com as lojas de origem e destino |
| #26 | Fotos obrigatórias, busca na fonte e painel da rede prontos | **parcial** | Pendências de foto da importação Rein, quando chegar o arquivo |
| #19–#24 (fechadas) | Prova `2026-11-08/banco.repro.ts`: 6 de 6 verdes | sem regressão | Não reabrir |

## 3. Dependências externas

Estão na seção 0 de [`docs/PENDENCIAS_DO_PROPRIETARIO.md`](../PENDENCIAS_DO_PROPRIETARIO.md). Cada uma tem fornecedor, função bloqueada, prioridade, habilitação, ambiente de teste, nomes das variáveis e critério de desbloqueio. Nenhum valor aparece ali.

## 4. Andamento

| Lote | Branch | Situação |
|---|---|---|
| 1 | `fix/ORA-acesso-configuracao-lote1` | Integrado na main (`b967870`), aguardando o Codex |
| 2 | `fix/ORA-integridade-lote2` | Integrado na main (`c071968`), aguardando o Codex. Migrations `20261109190240` e `20261109190400` aplicadas no `ora5g-dev` |
| 3 | `fix/ORA-busca-csv-fotos-lote3` | Integrado na main (`596b046`), aguardando o Codex. Migration `20261109191416` aplicada no `ora5g-dev` |
| 4 | `fix/ORA-demo-lote4` | Integrado na main (`11e4e48`), aguardando o Codex |
| 5 | `feature/ORA-transferencias-defeitos-lote5` | #60 (ADR-007): pedido interno de transferência, DEFEITOS e "onde tem", integrado na main (`1f55af9`), aguardando o Codex |
| 6 (próximo) | — | #54 nas partes com contrato documentado, #44 e cadastro das 11 lojas quando chegar a linha B2 |
| Passo 0 (10/11) | `docs/passo0-reconciliacao-pr33` | Skill da PR #61 e conteúdo da PR #33, seção 5 |
| Prioridade 1 (10/11, em andamento) | `test/ORA-QUAL-autorizacao-funcoes` | Inventário de autorização feito (48 funções, 528 tentativas recusadas); falta o teste de navegador com usuários de teste (linha A1) |

## 5. Passo 0 (10/11/2026): skill da PR #61 e conteúdo da PR #33

Autorizado pelo proprietário em 10/11, depois do diagnóstico somente leitura da `main` `9579398` (CI completo em clone limpo: 593 testes, 2 pendentes de propósito, 143 E2E; aviso do Supabase com 48 funções `SECURITY DEFINER` chamáveis por usuário logado).

**PR #61 (skill `engenheiro-senior-ora5g`):** integrada sem alteração em `34f631f`, depois da sequência do CI no head `c643b9a`. São 17 arquivos novos em `.claude/skills/engenheiro-senior-ora5g/` e `docs/skills/engenheiro-senior-ora5g/`. A auditoria dela é uma fotografia da `0292c69` (09/11); depois entraram a migration 22 (consulta pelo uuid, desligada) e a homologação na `8f7a458`.

**PR #33 (Codex, head `290f1111`), trazida pela branch `docs/passo0-reconciliacao-pr33`, sem merge da PR (que estava divergente):**

| O quê | Como entrou |
|---|---|
| Relatórios do Codex (`docs/analises/`, 8 arquivos), índice, prompt consolidado, adendo, registro oficial da Nogle, busca e transferências | Iguais aos da PR, só com o link do arquivo de perguntas renomeado |
| Provas (`docs/analises/evidencias/2026-11-0*`) e protótipo `docs/prototipos/estoque-por-loja-2026-11-09` | Iguais. Ficam fora do CI: as provas falham de propósito na base antiga e a matriz da seção 2 diz onde cada uma virou teste permanente |
| `REVISOES_CODEX.md` | Versão da PR (a main não tinha mudado o arquivo desde a base comum `9b1109e`) |
| `docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json` | Igual: nomes dos 12 locais (11 lojas + DEFEITOS) e totais da imagem, sem CNPJ nem endereço (linha B2) |
| Perguntas à Nogle | Renomeado para `docs/integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md` (pedido do proprietário: não existe integração "Contel"); links ajustados |
| `packages/dominio/src/desconto-propriedades.test.ts` e `apps/plataforma/e2e/setores-e-exportacoes.spec.ts` | Entraram na suíte normal, como o Codex pretendia. Antes de entrar: o de desconto (1.000 casos determinísticos) passou, e o de navegador passou nos 42 casos (21 cenários × 2 tamanhos). Junto, a planilha da carteira na demonstração deixou de se chamar "extrato-contel" e passou a "extrato-nogle" (o teste acompanha) |
| Notas do `status-requisitos.json` | Estados atuais mantidos. Os achados que levaram o Codex a rebaixar POS-006, POS-007, PAY-004, INV-003 e CONNECT-002/004/006/010 foram corrigidos nos lotes 1 e 2; cada nota agora cita o achado e o lote, aguardando a conferência do Codex. Guardada a conferência do Codex de 08/11 (INV-002 e INV-003). ORA-CONNECT-009 entrou como não iniciado. Notas que tinham ficado velhas foram acertadas (ORG-004, INV-002, INV-005, PAY-002, CAT-011) |

**Não trazido, com motivo:**

- **"14" trocado por "11" em todo lugar, inclusive nas ondas (3 → 7 → 11).** A decisão vigente é 11 lojas comerciais + DEFEITOS hoje e **meta de 14**. Assim foram corrigidos `CLAUDE.md`, `AGENTS.md`, `README.md`, `backlog.json` (ORA-ORG-001 e ORA-REPORT-001), `01_REQUISITOS.md`, go/no-go, estado e pendências (inclusive os e-mails prontos). Documentos históricos (`00_CONTEXTO_E_DECISOES.md`, `ANALISE_DO_PLANO.md`, `PARA_COLAR_NO_CLAUDE.md`, ADR-002 e prompts antigos) ganharam só uma faixa ou um adendo.
- **Versões da PR de `ESTADO_ATUAL_E_PASSAGEM.md`, `status-requisitos.json` e `RASTREABILIDADE.md`:** a main é mais nova (lotes 1 a 5). A rastreabilidade foi gerada de novo.
- **Omissão do IP, da impressão digital SSH e do identificador do projeto Supabase no estado:** não são segredos. O IP é público pelo DNS, a impressão digital serve para conferir o servidor na primeira conexão e o identificador já vai ao navegador no endereço público. Se o proprietário preferir omitir, a troca é feita em todos os documentos de uma vez.
- **Faixas de prioridade da PR** em `ANALISE_DO_PLANO`, `FILA_DE_EXECUCAO`, `PROMPT_CLAUDE_EXECUCAO_PRIORITARIA` e `APIS_E_HABILITACOES`: as prioridades de 09/11 já foram cumpridas; entraram faixas novas com o estado de hoje.

**Telas reais:** a página inicial e a de entrada diziam "14 lojas"; agora dizem "11 lojas". A demonstração continua com a rede fictícia de 14 lojas (só dados fictícios); muda só se o proprietário pedir. Nada foi publicado na homologação.

**Para fechar a PR #33** (o Claude não acessa a API do GitHub; quem fecha é o proprietário ou o Codex), comentário sugerido:

> Conteúdo integrado na main pelo merge da branch `docs/passo0-reconciliacao-pr33` (10/11/2026), sem merge desta PR, que estava divergente. O que entrou e o que não entrou, com o motivo: `docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md`, seção 5.
