# Execução integral — checkpoint do programa

**Atualizado em:** 10/11/2026, Claude Code. **Pedido:** concluir funcionalmente todas as áreas (PR #67, `docs/execucao-integral-20261110`, commit `d8c1bc6`); o refinamento visual fica para o fim.
**Complemento legível por programa:** [`execucao-integral-status.json`](execucao-integral-status.json) (179 IDs com estado, lote, bloqueio externo e revisão).

> **Ao retomar** (nova sessão ou contexto resumido): ler este arquivo e o JSON, conferir `git log origin/main` e o rodapé/`/saude` do site, e seguir para o **próximo item executável da fila** (seção 5). Não reiniciar o projeto, não refazer o financeiro lote 1, não reabrir as decisões da seção 3.

## 1. Base e publicação

| | Commit | Observação |
|---|---|---|
| `main` | `0ecb2f2` | Financeiro lote 1 (`0b6b45e`), correção do 307 do `/financeiro` (`38fc068`), PR #64 (`2ac6a25`) e **L2 lojas** (`0ecb2f2`, CI completo verde em `9a884ad`) |
| Homologação (`ora5g.com.br`) | `0b6b45e` | Publicada em 10/11 às 20:45, com autorização; conferida no rodapé e em `/saude` em aba anônima |
| Falta publicar | `38fc068`, `2ac6a25`, `0ecb2f2` | Correção do 307, semente do gerente de teste (só desenvolvimento) e L2; publicar exige autorização a cada vez e, no caso do L2, a migration aplicada antes |
| Banco `ora5g-dev` | 24 migrations | `20261110224537_financeiro_painel` aplicada em 10/11 (md5 do arquivo = md5 gravado) |
| Falta aplicar no `ora5g-dev` | `…_lojas_cadastro_e_configuracao` (L2) | O conector do Supabase ficou fora do ar em 10/11 à noite; aplicar, renomear para a versão gravada e registrar o md5 **antes de qualquer publicação** que leve o L2 |

## 2. Cobertura de leitura (10/11/2026)

**Pacote da PR #67, lido inteiro:** LEIA-ME, PROMPT_MESTRE (314 linhas), ESTADO_VERIFICADO (82), RELATORIO_CLAUDE_WEB_RECEBIDO (149). REQUISITOS_179 (1.450): os 179 blocos percorridos por programa e lidos; as notas são idênticas às de `status-requisitos.json` (0 divergências). INDICE_DE_FONTES (475): seções e tabelas percorridas (108 Markdown, 138 variantes, 42 referências, 67 issues/PRs, 71 comentários, fontes fora do alcance).

**MANIFESTO_FONTES.json (7.548 linhas):** percorrido por programa: 507 arquivos da main analisada com o blob de cada um; **comparado com a `main` de hoje: 0 novos, 0 alterados, 0 removidos**. Fontes novas desde então: só `apps/plataforma/src/app/financeiro/layout.tsx` e `e2e/acesso-real.spec.ts` (correção 307, desta sessão).

**Lidos por lote:** L3 — corpos integrais das issues #26, #38, #40, #41, #42 e #43 (catálogo, fotos e CSV) e o ADR-003 inteiro.

**FONTES_GITHUB_01 a 05 (~305 KB):** lidos na íntegra os corpos e comentários de #54, #60, #62, #63, #64, #65, #66 e os comentários de 09–10/11 (inclusive o relatório integral da #65, já lido como `PARIDADE_DEMO_REAL…`). Issues anteriores (#2 a #53, #55 a #59): títulos, estados e a conciliação por achado em `RECONCILIACAO_CODEX_2026-11-09.md`; **o corpo integral de cada uma ainda não foi relido nesta sessão** e será lido junto do lote do domínio correspondente, antes de mexer nele.

**Documentos do repositório lidos nesta sessão** (além dos de cada lote já entregue): CLAUDE.md, ESTADO_ATUAL_E_PASSAGEM, PENDENCIAS_DO_PROPRIETARIO, 10_DECISOES_PENDENTES (D-020), MATRIZ_DEMO_REAL, deploy/homologacao/LEIA-ME, packages/banco/README, ADR-004 (via migrations), migrations de acesso, vendas/pagamentos/caixa, devolução/troca e integridade de vendas. **Ainda a ler na íntegra, por lote:** docs 00–13 restantes, ADR-001/002/003/005/006/007, ANALISE_DO_PLANO, FILA_DE_EXECUCAO, relatórios do Codex por domínio, pesquisas originais. Registro aqui à medida que cada lote os usar.

## 3. Decisões em vigor (não perguntar de novo)

11 lojas comerciais + DEFEITOS (nomes em `docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json`; DEFEITOS não vende); Rein só por arquivos (produtos, preços e estoque inicial); assistência/OS no escopo (seis requisitos); Ora Connect pela API oficial da Nogle (Contel não é outra integração); cancelamento não repõe estoque sozinho; cinco papéis do ADR-002; visual azul aprovado (D-020 parcial); stack TypeScript/Next.js/Supabase; publicar só com autorização; segredos administrativos e Nogle só no worker; conta de dono de teste do proprietário (#63) preservada.

## 4. Reconciliação de PRs e issues (10/11)

- **PR #64 (gerente de teste):** integrada em `2ac6a25` (merge de `c6480d5`), CI completo verde (195 E2E).
- **PR #33:** conteúdo útil trazido em 10/11 (passo 0); falta só fechá-la.
- **PR #66 e #67:** documentação; lidas por Git, sem merge (a leitura não exige).
- **#62 (publicação):** resolvida — o site serve `0b6b45e` e o procedimento de conferência existe (`conferir-publicacao.sh`).
- **#63 (primeiro acesso):** dono de teste vinculado pelo Codex; faltam as três contas fictícias no Auth (A1) e a prova E2E autenticada (#11).
- **#65 (financeiro):** lote 1 entregue e publicado; continua aberta para as próximas fatias (margem, contas, conciliação, DRE, repasses).
- **#54 (Nogle):** depende de C1/C2; o que é local continua (L11).

## 5. Fila de lotes (próximo executável primeiro)

| Lote | Requisitos | Situação | Próximo passo / dependência concreta |
|---|---|---|---|
| L1 | ORG-002, QUAL-002 (PR #64) | feito (`2ac6a25`) | Falta criar as três contas fictícias no Auth (A1) e rodar o vínculo no `ora5g-dev` |
| L2 | ORG-001, ORG-008 (lojas) | **na `main`** (`0ecb2f2`) | Tela `/lojas`, 6 funções, configuração com vigência, inativação com pendências e bloqueio de movimento (OR019). Falta: aplicar no `ora5g-dev` (conector do Supabase fora do ar em 10/11 à noite), revisão do Codex e publicação autorizada. CNPJ/endereço reais chegam por B2. ORG-003 segue a decisão dos cinco papéis do ADR-002 (papéis novos por migration quando houver pessoa na função) |
| L3a | CAT-001, CAT-005 | **implementado e testado na branch** `feature/ORA-L3-catalogo-cadastro` | Tela `/produtos`: categorias, marcas, produtos e variações com motivo e auditoria; política de desconto da categoria (P14) por quem altera preço. Falta: CI, merge e aplicação no `ora5g-dev` |
| L3b | CAT-004, CAT-007 | próximo | Preço por loja/canal pela tela (`preco.alterar`), mudança agendada e campanha com início e fim, cancelamento sem reescrever o passado |
| L3c | CAT-002, CAT-010 | depois do L3b | Lote de importação com prévia, validação, aprovação e aplicação idempotente; o formato das colunas da Rein espera o arquivo de exemplo (B1, ADR-003 §3) |
| L4 | INV-005, 008, 009, 010, 012 | pronto | Inventário cíclico com aprovação, compras/recebimento com custo de entrada, condição de unidade, rotina de vencimento de reservas no worker |
| L5 | CRM-001 a 010 | pronto | Cliente compartilhado com finalidade e identificador protegido; ligação a vendas, linhas e OS; funil e atividades; consentimento |
| L6 | POS-008, 009, 011, 014, 015, 016 | pronto (depois de L5) | Cliente na venda, pendências, POS-011 × FISC-001 (reconciliar, não duplicar), campanhas, contingência, câmera |
| L7 | PAY-001, 003, 005, 007, 008, 011, 012 | pronto | Terminais/NSU por loja, estados de pagamento, saída autorizada, conciliação manual por comprovante |
| L8 | FIN-002 a 010, REPORT-001, 003, 004, 006, 007 | pronto | Margem (custo.ver), contas a receber (baixa/aging) e a pagar, repasses, XLSX/PDF, previsão com premissas; painéis reais |
| L9 | PERF-001 a 009 | pronto | Evento de produção único por fato confirmado, metas, regras versionadas, reversões, fechamento |
| L10 | FISC-005, 006, 009 | pronto (manual) | FISC-003/004/007 esperam D1 (contador e emissor) |
| L11 | CONNECT-003, 007, 008, 009, 011 | parcial | Estruturas locais e reconciliação; operações reais esperam C1/C2 |
| L12 | OS-001 a 006 | pronto | P5 (técnico com login próprio?) define só o acesso do técnico; o restante segue |
| L13–L17 | ONLINE, MKTPL, WHATS, META, AI | estruturas locais | Contas, contratos e habilitações na lista única de dependências |
| Transversal | QUAL-005, 006, 008, 012, 013, 014 | pronto | Ensaio de restauração, observabilidade, contingência, carga, incidentes, dependências |

Cada lote: branch própria, CI completo em instalação limpa, merge, atualização deste checkpoint, do JSON, da rastreabilidade e do pedido de revisão ao Codex. Publicação quando autorizada.
