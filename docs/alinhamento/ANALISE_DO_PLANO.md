# Análise completa do plano × estado real

> **Atualização de 10/11/2026:** a rede tem 11 lojas comerciais e o local DEFEITOS, que guarda itens com problema e não vende (decisão do proprietário de 09/11/2026); a meta é chegar a 14 lojas. As menções a 14 lojas abaixo são do plano de 07/11. Estado atual: [ESTADO_ATUAL_E_PASSAGEM.md](../ESTADO_ATUAL_E_PASSAGEM.md); achados do Codex e correções: [RECONCILIACAO_CODEX_2026-11-09.md](RECONCILIACAO_CODEX_2026-11-09.md).

> **Prioridade atualizada pelo proprietário, 08/11/2026:** concluir as pendências da revisão e priorizar **vendas, pagamentos/caixa e Ora Connect reais**, com catálogo/estoque/acesso íntegros como dependências, para substituir a Rein por transição homologada. Depois, avançar o restante do escopo. Execução e critérios em [PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md](PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md). Consolidar APIs/habilitações necessárias para o proprietário, preservando as decisões de negócio e aprovações de produção pendentes.

> **Adendo do proprietário, 08/11/2026:** fotos obrigatórias por produto/variante visual e exibição no catálogo, busca, estoque e PDV (ORA-CAT-011, P0). Inventário atual: **179 requisitos** (173 + ORA-OS-001 a 006, assistência técnica, formalizados em 09/11 sem contar como feitos); recorte piloto: **71**. [Especificação e aceite](FOTOS_DOS_PRODUTOS_2026-11-08.md), issue [#26](https://github.com/oraconect5g-boop/sistema-ora5g/issues/26). Os totais de 172 abaixo preservam a base histórica de 07/11; a rastreabilidade gerada mostra a contagem atual.

**Data:** 07/11/2026 · **Autor:** Claude Code (programador) · **Revisor:** Codex · **Aprovação:** proprietário
**Para que serve:** ser a referência única de alinhamento entre o Claude Code e o Codex. Mostra o que o plano pede, o que já existe de verdade, o que falta, o que está bloqueado e onde os documentos se contradizem.

> Ordem de leitura para qualquer agente: `docs/ESTADO_ATUAL_E_PASSAGEM.md` → **este documento** → `docs/alinhamento/RASTREABILIDADE.md` → ADRs → documento do módulo da tarefa.

---

## 1. O que foi lido (integralmente, em 07/11/2026)

| Grupo | Arquivos |
|---|---|
| Regras e estado | `README.md`, `CLAUDE.md`, `AGENTS.md`, `PARA_COLAR_NO_CLAUDE.md`, `docs/ESTADO_ATUAL_E_PASSAGEM.md` |
| Pacote original | `docs/00` a `docs/13` (14 documentos), `backlog.json` (172 requisitos, conferidos 1:1 com `docs/01`) |
| Etapa 0 e 1 | `docs/etapa-0/ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md`, `ETAPA_0_BASE_CONSOLIDADA.md`, `ETAPA_0_DECISOES_2026-11-06.md`, `docs/etapa-1/PLANO_DE_INICIO_DA_IMPLEMENTACAO.md` |
| Decisões técnicas | `docs/adr/ADR-001` (infraestrutura) e `ADR-002` (acesso), `docs/integracoes/VARIAVEIS_DE_AMBIENTE.md`, `.env.example`, `docs/operacao/CONECTAR_CLAUDE_CODE_SSH_WINDOWS.md` |
| Histórico | `originais/research/pesquisa_1`, `_2` e `_3_plano_mestre.md`, `originais/historico/conversa_inicial_colada.md` |
| Visual | `referencias_visuais/guia_design.md`, `prototipo.html` (texto e estilos das 10 telas). Os PNGs e o vídeo mostram as mesmas 10 telas do protótipo |

**Arquivo citado e ausente:** `ORA5G_DOSSIE_MESTRE_UNIFICADO.md` (citado no `README.md`). Segundo a Etapa 0, era só a concatenação dos demais; não faz falta, mas o README precisa deixar de citá-lo.

---

## 2. O plano em uma página

**Objetivo:** plataforma própria (CRM + ERP + PDV + Ora Connect + omnichannel) para 14 lojas, piloto na **Santa Cândida**, ondas 1 → 3 → 7 → 14, depois online nacional. Vendedor faz tudo pelo celular.

**Os 10 invariantes** (ETAPA_0_BASE_CONSOLIDADA §2), que valem mais que qualquer tela:
1. Uma operação comercial, muitos itens de naturezas diferentes (aparelho, acessório, chip, ativação, recarga, serviço…).
2. Toda operação tem loja e vendedor.
3. Cada fato gera exatamente um efeito (IMEI sai uma vez, pagamento confirma uma vez, comissão nasce uma vez).
4. Venda ≠ pagamento ≠ recebimento ≠ conciliação ≠ receita ≠ comissão.
5. Nada é apagado; correções são registros compensatórios.
6. Nada externo é confirmado sem prova (Pix, maquininha, nota, Nogle ficam "pendentes").
7. Permissão por loja e perfil no servidor e no banco.
8. Todo número do painel leva ao fato de origem.
9. Terceiros só por adaptadores (Rein por arquivo; o resto por contrato oficial verificado).
10. O vendedor faz tudo pelo celular.

**Plano de 6 meses** (ETAPA_0_DECISOES §4):

| Mês | Entregas | Portão de saída |
|---|---|---|
| 1 (nov–dez) | Login, lojas com CNPJ, vendedor em várias lojas, perfis, permissões testadas, catálogo com código de barras, importador do CSV da Rein (com estoque), estoque/IMEI | Estoque da Santa Cândida importado e conferido em homologação |
| 2 (dez–jan) | PDV no celular, pagamento misto, caixa, desconto com limite e aprovação, fila de notas com aviso | Venda completa no celular em homologação |
| 3 (jan–fev) | Piloto paralelo (Rein oficial), relatório diário Rein × Ora, turnos e desempenho, metas, painéis, Ordem de Serviço, adaptador Nogle | 2–4 semanas de fechamentos batendo |
| 4 (fev–mar) | Emissão fiscal pela Ora, Nogle ativação/recarga, conciliação PicPay/PagSeguro, desligar a Rein na piloto | Go/no-go assinado |
| 5 (mar–abr) | Ondas 3 → 7 → 14 lojas; Mercado Livre | 14 lojas operando |
| 6 (abr–mai) | TikTok Shop, loja virtual básica, WhatsApp oficial, backups testados | Operação estável |

**Recorte do piloto:** cerca de 70 dos 172 requisitos (BASE_CONSOLIDADA §5; marcados "Piloto: sim" na rastreabilidade).

---

## 3. O que existe de verdade (07/11/2026)

| Entrega | Onde | Prova |
|---|---|---|
| Esqueleto do monorepo (Next.js 16, TypeScript estrito, ESLint, Vitest, Playwright, versões fixas) e página `/saude` | `apps/plataforma`, `packages/config` | CI + testes E2E em 360 px e 1280 px |
| CI no GitHub Actions + detector de segredos próprio + validação de variáveis na inicialização | `.github/workflows/ci.yml`, `packages/config` | 32 testes de unidade; teste E2E de inicialização sem configuração; testes de mutação |
| Primeira migration do acesso (ADR-002): 10 tabelas, RLS, auditoria imutável, CNPJ validado | `packages/banco` | 33 testes de permissão (T1–T3, T6–T10) em PostgreSQL em memória; mutações derrubam os testes; aplicada no Supabase `ora5g-dev` com impressão digital idêntica |
| Projeto Supabase de desenvolvimento | `ora5g-dev` (São Paulo, gratuito) | migrations `fundacao_acesso` e `indices_chaves_estrangeiras` aplicadas |
| Regras de negócio puras (dinheiro, IMEI/ICCID, desconto por margem, pagamento misto e financiado, produção por categoria) | `packages/dominio` | testes de unidade |
| Versão de demonstração (telas com dados fictícios, identificadas) | `apps/plataforma/src/app/demo` | E2E de navegação em celular e computador |

**Situação dos 172 requisitos:** veja o resumo e a tabela completa em `RASTREABILIDADE.md`. Em resumo: a fundação de acesso e qualidade está adiantada; **nenhum fluxo operacional real** (venda, estoque, caixa, nota, chip) existe ainda no banco. As telas da demonstração **não contam como requisito entregue**.

---

## 4. O que falta, mês a mês

### Mês 1 — fundação (prazo do plano: 04/12/2026)

| Tarefa | Situação | Depende de |
|---|---|---|
| ORA-001 ADRs 001/002 aceitos | ✅ aceitos em 07/11 | — |
| ORA-002 esqueleto | ✅ | — |
| ORA-003 CI, variáveis, segredos | ✅ | Proteção da `main` (proprietário) para valer como bloqueio |
| ORA-004/005 migration de acesso + RLS | ✅ em dev | Homologação |
| Auditoria automática de mudanças em vínculos/perfis/papéis (ORA-ORG-005) | ⬜ **falta** | — |
| ORA-006 login, recuperação de senha, sessão por turno, escolha de loja | 🟡 login por senha, `/conta` pelo RLS e renovação de sessão prontos; faltam recuperação, escolha da loja na sessão, turno e teste com usuário real | SMTP para recuperação de senha; usuário de teste (criar exige a chave secreta ou o painel do Supabase) |
| **ADR-003** operação comercial, tipos de item, ledger de estoque | ⬜ **falta e bloqueia catálogo/estoque** | Revisão do Codex + aceite do proprietário |
| ORA-007 catálogo (produto, variação, tipo, código de barras, custo, preço com histórico, publicar online) | ⬜ | ADR-003 |
| ORA-008 telas de catálogo, lojas e usuários (AppShell real) | 🖼️ só demonstração | ORA-006, ORA-007 |
| ORA-009 importador do CSV da Rein (prévia) | ⬜ | **CSV de exemplo** (proprietário) e ADR-003 |
| ORA-010 estoque, IMEI, reserva com bloqueio, teste de concorrência | ⬜ | ADR-003 |
| ORA-011 consulta e conferência de estoque no celular | 🖼️ só demonstração | ORA-010 |
| ORA-012 homologação na VPS | 🟡 aplicação pronta para rodar no servidor; publicação depende do proprietário (opção A) | Proprietário: subdomínio no cPanel, proxy e AutoSSL |

### Mês 2 — PDV e caixa

PDV no celular (rascunho → pagamento → conclusão idempotente), pagamento misto, caixa (abertura, sangria, suprimento, fechamento), motor de aprovação genérico (`approval_requests`), fila de notas com aviso. **Nada iniciado no banco**; regras puras de desconto e pagamento prontas. Precisa de **ADR-004** (pagamentos e caixa) e da matriz de aprovação (margem mínima e teto por categoria: valores ainda não definidos pelo proprietário).

### Meses 3 a 6

Ordem de Serviço (DEC-U44/U47), turnos e desempenho (DEC-U40), metas e incentivos (DEC-U45), adaptador Nogle, emissão fiscal, conciliação PicPay/PagSeguro, ondas de implantação, Mercado Livre, TikTok Shop, loja virtual, WhatsApp oficial, backups testados. **Nada iniciado** (só telas de demonstração). Os pré-requisitos externos estão na seção 5.

---

## 5. Bloqueios que só o proprietário ou terceiros resolvem

| # | O que falta | Trava | Prazo sugerido |
|---|---|---|---|
| B1 | `SUPABASE_SECRET_KEY` e `DATABASE_URL` no `.env.local` do servidor | **Não travam o login** (que usa só endereço e chave pública, já configurados). Travam worker, scripts de banco e criação de usuários pelo sistema (correção apontada pelo Codex em 07/11) | antes do ORA-008 |
| B2 | E-mail de envio (SMTP da HostGator, caixa `nao-responda@ora5g.com.br`) | Recuperação de senha, envio de nota e OS | 20/11 |
| B3 | CSV de estoque da Rein (anonimizado) | Importador (ORA-009) e catálogo real | 20/11 |
| B4 | Lista das 14 lojas com CNPJ e endereço | Cadastro real das unidades | 20/11 |
| B5 | Vendedores (nome, e-mail, lojas) | Usuários de homologação | 27/11 |
| B6 | Margem mínima e teto de desconto por categoria | Motor de desconto em produção | antes do mês 2 |
| B7 | P3 ranking (nomes dos colegas ou só posição própria) e P5 técnico (login próprio? funcionário ou terceiro?) | Metas e OS | mês 3 |
| B8 | P7 portal e tipo de nota, contador, emissor fiscal por API e certificado A1 | Toda a parte fiscal | fim do mês 2 |
| B9 | P8 repasse das financeiras; P9 tipo da chave Nogle | Financeiro e Ora Connect | mês 3 |
| B10 | P10 loja online (CNPJ emissor, estoque, transportadora, domínio) | Canal online | mês 4 |
| B11 | P13 resumo da conversa com o ChatGPT | Alinhamento histórico | quando possível |
| B12 | Proteção da `main`, subdomínio `hml-app` no cPanel, verificação da empresa na Meta, cadastros de desenvolvedor (Mercado Livre, TikTok Shop, Shopee) | Governança e canais | mês 1 |
| B13 | Acesso de leitura ao GitHub (token só de leitura de Actions/PRs, guardado no servidor) | Claude Code ver o resultado do CI antes de integrar | opcional |

---

## 6. Divergências entre documentos (e qual vale)

Regra: decisão explícita mais recente do proprietário > ADR aceito > requisito > pesquisa > referência visual > inferência de agente.

| # | Divergência | Fontes | Resolução |
|---|---|---|---|
| D1 | Papéis "podem alternar por issue" | `AGENTS.md` (responsabilidades complementares), `docs/11`, pesquisas 2 e 3 | **Vale a decisão de 06/11:** Claude programa, Codex revisa. Os trechos antigos devem ser lidos à luz dela |
| D2 | Plano de início atribui ORA-002, 006, 008 e 011 ao Codex | `PLANO_DE_INICIO` §5 | Idem D1: o Claude implementa todas; o Codex revisa |
| D3 | ORA-012 descreve Ubuntu, Docker e Caddy; plano §1 fala em "só 3 portas (22, 80, 443)" | `PLANO_DE_INICIO` §1 e §5 | **Vale o ADR-001 opção A (07/11):** RHEL 9 com cPanel, Apache como entrada, Node por processo do usuário, SSH na 22022, portas do cPanel abertas. ORA-012 precisa ser reescrita |
| D4 | "Supabase CLI para banco local de testes" | `PLANO_DE_INICIO` §4 | O servidor não tem Docker. Testes de banco usam PostgreSQL em memória (PGlite); a CLI fica só para enviar migrations ao projeto remoto |
| D5 | Rein "somente produtos e preços" | `CLAUDE.md`, `README.md`, DEC-U04 | **Vale DEC-U24 (06/11):** o CSV da Rein traz também o **estoque**. Continua sem API |
| D6 | Perfis: 8 a 12 nos documentos antigos | `docs/01` ORG-003, `docs/05`, guia de design | **Vale o ADR-002 aceito:** 5 papéis hoje; os demais por migration quando existirem pessoas nessas funções |
| D7 | Nomes de tabelas em inglês | `docs/03`, pesquisas | **Vale P6 (07/11):** português |
| D8 | "Todas as notas passam por aprovação" × "aprovação interna não pode bloquear obrigação legal" | DEC-U20 × `docs/05`, guia | Ambos: fila com aprovação + alerta de tempo desde a venda; o contador define o prazo máximo |
| D9 | "PR sem CI verde não libera merge" × merges diretos pelo Claude Code | ORA-QUAL-001 × decisão de 07/11 | O Claude roda a sequência completa do CI antes de integrar; o proprietário confere a aba Actions. Risco registrado (R3) |
| D10 | E-mail corporativo no login do protótipo | `prototipo.html` | Vendedores têm e-mail próprio (DEC-U33): login por e-mail pessoal |
| D11 | Lojas "Centro/Batel/Portão · Curitiba" no protótipo | `prototipo.html` | Dados ilustrativos; não usar como fato (C-14). A demonstração usa "Santa Cândida (piloto)" e "Loja 02…14" |
| D12 | Dinheiro em `numeric(14,2)` + biblioteca decimal | BASE_CONSOLIDADA §3 | Compatível: banco em `numeric(14,2)`; no TypeScript, centavos inteiros (`packages/dominio/src/dinheiro.ts`) |
| D13 | Integrações em Edge Functions × worker na VPS | pesquisa 2 × `docs/02` | Worker na VPS (C-04), a confirmar no ADR de integrações |
| D14 | Porta 3100 usada pelos testes E2E e reservada à homologação | ORA-002 × ADR-001 | Testes passam a usar 3180 (registrada no ADR-001) |
| D15 | `README.md` cita `ORA5G_DOSSIE_MESTRE_UNIFICADO.md` | `README.md` | Arquivo não existe no repositório; corrigir o README |

---

## 7. Riscos principais

| # | Risco | Mitigação |
|---|---|---|
| R1 | Prazo de 6 meses com fiscal, Nogle e canais dependendo de terceiros | Pedir já os itens B2–B10; regras puras e adaptadores com simulador enquanto isso |
| R2 | Demonstração ser confundida com sistema pronto | Selo fixo "Demonstração — dados fictícios", desligada em produção, sem gravação, rastreabilidade separa "demonstração" de "feito" |
| R3 | Merge sem CI visível para o Claude | Sequência completa do CI rodada antes de cada merge; token de leitura (B13); proteção da `main` quando o fluxo de PR voltar |
| R4 | Catálogo e estoque começarem sem ADR-003 | ADR-003 é a próxima entrega técnica; nenhuma tabela de venda/estoque antes dele |
| R5 | Auditoria de mudanças de acesso incompleta (ORG-005) | Gatilhos de auditoria em vínculos/perfis na próxima migration |
| R6 | Desconto por margem sem parâmetros reais | Valores da demonstração são exemplos; motor real só com B6 |
| R7 | Aplicação de homologação rodando como processo do usuário `dev`, sem systemd | `crontab` de reinício ligado em 07/11 (boot e a cada 5 minutos, testado); migrar para serviço systemd quando o proprietário puder (root) |
| R8 | Plano gratuito do Supabase (pausa por inatividade, sem backup com recuperação pontual) | Suficiente para dev; Pro antes do piloto real (custo a aprovar) |

---

## 8. Regras de alinhamento Claude Code × Codex

1. **Fonte única:** estado em `docs/ESTADO_ATUAL_E_PASSAGEM.md`, análise e rastreabilidade em `docs/alinhamento/`. Toda entrega atualiza `status-requisitos.json` e regenera a rastreabilidade no mesmo commit.
2. **Status honestos:** só "feito" com teste rodando; "demonstração" nunca vira "feito".
3. **Revisão do Codex:** depois de cada merge, o Codex revisa os commits novos da `main` e registra os achados em `docs/alinhamento/REVISOES_CODEX.md` (ou issues do GitHub), com ID do requisito, arquivo, gravidade e sugestão. Achado de segurança, permissão ou dinheiro **bloqueia** a próxima entrega até ser corrigido.
4. **Correções:** o Claude corrige em commits novos citando o achado; o Codex só corrige diretamente ajustes pequenos.
5. **Decisões estruturais** (tabela nova de domínio, estado de venda, integração) só com ADR; o Codex revisa o ADR antes do código.
6. **Sem invenção:** nenhuma rota de Nogle, PicPay, fiscal ou marketplace sem documentação oficial; nenhum valor de negócio (margem, teto, comissão) sem decisão do proprietário — usar parâmetros configuráveis marcados "exemplo".

O pedido de revisão atual está em `docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md`. A revisão do Codex de 07/11 está em `docs/alinhamento/REVISOES_CODEX.md` e `docs/analises/ANALISE_SISTEMAS_2026-11-07.md`; as respostas do Claude, achado por achado, em `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md`.
