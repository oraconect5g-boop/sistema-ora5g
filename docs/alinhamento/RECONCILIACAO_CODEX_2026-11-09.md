# Reconciliação dos achados do Codex com o código atual — 09/11/2026

**Por:** Claude Code (programador) · **Para:** Codex (revisor) e proprietário
**Origem:** [prompt consolidado](https://github.com/oraconect5g-boop/sistema-ora5g/blob/290f1111f964710d744c4ded40df48fed6762b1b/docs/alinhamento/PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md) e [índice dos relatórios](https://github.com/oraconect5g-boop/sistema-ora5g/blob/290f1111f964710d744c4ded40df48fed6762b1b/docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md), lidos no HEAD da PR #33 (`290f1111`) sem merge nem cópia sobre a main.
**Main conferida:** `d730e9a05e65` (inclui devolução parcial, troca e vale-troca, posteriores ao consolidado `9b1109e`).

## 1. Como os achados foram conferidos

- **Reprodução, não leitura de issue.** As 16 provas vermelhas das pastas `docs/analises/evidencias/*` da PR #33 foram copiadas para os destinos temporários indicados em cada LEIA-ME e executadas contra a main `d730e9a` com as correções do Lote 1 (abaixo), banco em memória ou PostgreSQL 17 local, dados fictícios. As cópias foram apagadas depois. O resultado bruto fica no servidor em `~/ci/repro-d730e9a-1210.txt`; o resumo está na coluna "Reprodução atual".
- **Limite de acesso:** deste servidor não há `gh` nem API do GitHub (o conector GitHub também falhou nesta sessão). Por isso, o estado das issues foi lido nos relatórios da PR #33 e não nos comentários das issues. Esta reconciliação fica registrada no GitHub por commit, pelo mecanismo autorizado (deploy key). Nenhum token foi pedido.
- **Inventário recalculado:** são 179 requisitos no `backlog.json` (P0 78, P1 74, P2 27). Deles, 72 são acompanhados em `status-requisitos.json`: 18 testados em desenvolvimento, 40 parciais, 11 só em demonstração, 2 bloqueados e 1 respeitado. **Nenhum está homologado nem em produção.** Status não sobe por haver tela, migration ou CI verde.
- **Decisões aplicadas sem perguntar de novo:** a stack Supabase/PostgreSQL continua (nada de Firebase). A rede tem 11 lojas comerciais mais o local DEFEITOS, que não é uma 12ª loja. Rein só por arquivo. Ora Connect pela API oficial Nogle/Contel.

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

### Demais achados abertos

| ID | Reprodução atual | Estado | Próximo passo |
|---|---|---|---|
| #31, #32 (REV-030/031) | Face da recarga como receita (3000) e ativação pendente contada (1) | **demonstração**, reproduzido | Corrigir a demo e o contrato de indicadores depois do Lote 2 |
| #36, #37, #38 | Autor na própria fila (demo); comparação de 30 dias +2900%; CSV com fórmula | **reproduzidos** (36/37 na demo; 38 no componente real de exportação) | #38 primeiro, porque afeta a exportação real |
| #39 | Não reexecutado (prova de navegador da demo) | demonstração | Junto de #31/#32 |
| #40 / REV-038 | Produto além das 200 linhas não aparece na busca | **reproduzido** | Filtrar e paginar na fonte (catálogo e estoque), com #26/#60 |
| #41, #43 | Não reexecutados (fixture de componente com servidor próprio) | a conferir | Junto das fotos (#26) |
| #42 / REV-040 | Registro repetido da mesma foto devolve 23505. O controle do índice da FK também falhou no PGlite atual (o planejador não usou `fotos_organizacao`) | **reproduzido**; controle a investigar | Registro idempotente; conferir o índice com EXPLAIN no PostgreSQL real |
| #44 | `npm audit --omit=dev`: 0 vulnerabilidades no CI | a conferir na cadeia de desenvolvimento | Atualizar de forma compatível, sem downgrade automático |
| #54 | Três operações (ativação, recarga, portabilidade) no adaptador; cobrança, carteira, recorrência e repasse sem contrato confirmado | **parcial** / bloqueio externo nas partes sem contrato | Depois dos bloqueantes #55–#59 |
| #26, #60 | Fotos existem; não há transferência entre lojas nem DEFEITOS | **parcial** / não iniciado | Depois do Lote 2: busca, painel da rede e pedido interno |
| #19–#24 (fechadas) | Prova `2026-11-08/banco.repro.ts`: 6 de 6 verdes | sem regressão | Não reabrir |

## 3. Dependências externas

Estão na seção 0 de [`docs/PENDENCIAS_DO_PROPRIETARIO.md`](../PENDENCIAS_DO_PROPRIETARIO.md). Cada uma tem fornecedor, função bloqueada, prioridade, habilitação, ambiente de teste, nomes das variáveis e critério de desbloqueio. Nenhum valor aparece ali.

## 4. Andamento

| Lote | Branch | Situação |
|---|---|---|
| 1 | `fix/ORA-acesso-configuracao-lote1` | Corrigido e testado em desenvolvimento, aguardando o Codex. CI e merge registrados em [PEDIDO_DE_REVISAO_CODEX.md](PEDIDO_DE_REVISAO_CODEX.md) |
| 2 | `fix/ORA-integridade-lote2` | Corrigido e testado em desenvolvimento, aguardando o Codex. Migrations `20261109190240` e `20261109190400` aplicadas no `ora5g-dev` |
| 3 (próximo) | — | #38 (CSV com fórmula, componente real), #40/#42 (busca e foto), #31/#32/#36/#37 (demo), depois #26/#60 (estoque visual, transferências, DEFEITOS) e #54 |
