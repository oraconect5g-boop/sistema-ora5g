# Fontes obrigatórias para a continuidade

Ler o estado atual e os relatórios aplicáveis; comparar cada referência histórica com o código/teste. Arquivo antigo não é ordem de reverter a implementação. A lista abaixo inventaria os 111 Markdown da main e as 7 PRs documentais abertas. Os arquivos preservados reaproveitam revisões anteriores; não se declara releitura de cada linha histórica nesta rodada.

## Precedência

Pedido recente do usuário → decisões vigentes validadas → implementação/testes como evidência (sem substituir aceite) → backlog atual → histórico/pesquisas/mockups. Em D-014, o modelo atual é bônus por meta; referências antigas a comissão não recriam uma regra abandonada.

## PRs e relatórios fora da main

| PR | Branch / SHA | O que ler e o cuidado |
|---|---|---|
| [#85](https://github.com/oraconect5g-boop/sistema-ora5g/pull/85) | `docs/planejamento-bugs-config-20261113` / `c4a07c589dd9a97d2e2bc964c0a120413b11c9cd` | Relatório de 13/11: 179 requisitos, cinco bugs, configurações, tipos/schema, fontes e roteiro. As cinco falhas foram retestadas no novo corte; atualizar 51 para 53 migrations e a regra D-014. |
| [#81](https://github.com/oraconect5g-boop/sistema-ora5g/pull/81) | `docs/auditoria-diretorios-real-20261112` / `fe2b8bb99e7db974b13c971bc7d96244179fdf33` | Auditoria dos diretórios/merges e inventário. Conclusões sobre build antiga e três gráficos foram superadas; #78/#79/#80 permanecem. |
| [#77](https://github.com/oraconect5g-boop/sistema-ora5g/pull/77) | `docs/clientes-nota-whatsapp-20261112` / `6b71bb0a927993ade46da50f276f5b013b552190` | Cadastro rápido, e-mail opcional, endereço fiscal e nota por WhatsApp. Decisão do usuário ainda precisa de código. |
| [#68](https://github.com/oraconect5g-boop/sistema-ora5g/pull/68) | `docs/revisao-integral-claude-20261111` / `df4eba7da36faac6a8d0062d20baef83fad0dcdd` | Auditoria dos lotes e reproduções REV-NOV. Distinguir bugs corrigidos por R1/R2 das falhas atuais; IDs corretos no prompt. |
| [#67](https://github.com/oraconect5g-boop/sistema-ora5g/pull/67) | `docs/execucao-integral-20261110` / `d8c1bc6c80646df2153290ea567237a17df20885` | Pacote mestre de execução integral, 179 IDs, manifesto/fontes GitHub e relatório original Claude Web. Atualizar decisões e estado, sem reiniciar. |
| [#66](https://github.com/oraconect5g-boop/sistema-ora5g/pull/66) | `docs/prompt-financeiro-real-20261110` / `9216f9247c376c1dbe6b26a409c0daf131d93a33` | Paridade financeira e plano completo. Os painéis já foram ampliados no real; usar lacunas atuais. |
| [#33](https://github.com/oraconect5g-boop/sistema-ora5g/pull/33) | `docs/revisao-web-nogle-2026-11-08` / `290f1111f964710d744c4ded40df48fed6762b1b` | Consolidação histórica Nogle/merges, 11 lojas, transferências e perguntas API. Conteúdo foi incorporado por outros commits; não aplicar código antigo em massa. |

GitHub e leitura de branch são fontes; não é preciso mesclar um pacote documental para lê-lo. Ausência do gh/MCP não justifica inferir os números das issues nem ignorar relatórios acessíveis por Git.

## Todos os Markdown da main

| Caminho | Título | SHA do blob |
|---|---|---|
| `.claude/skills/engenheiro-senior-ora5g/SKILL.md` | Skill de engenharia sênior — Ora 5G | `fdc7c34a05627d9b724a8d9533e0e623b72f01ce` |
| `.claude/skills/engenheiro-senior-ora5g/references/auditoria/github-2026-11-09.md` | Auditoria técnica do GitHub — Sistema Ora 5G | `b16b976d9c6f73a3b8f1d3e4074d906dc548f1cf` |
| `.claude/skills/engenheiro-senior-ora5g/references/contexto-atual.md` | Contexto de negócio e decisões prevalentes — Ora 5G | `828cb652d304b68ea5126d1e8f4a882c3debb417` |
| `.claude/skills/engenheiro-senior-ora5g/references/fluxos-e-dominio.md` | Fluxos transacionais e mapa de domínios da Ora 5G | `2fb174821573f92f8be48906f201fa5430bb9252` |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/conversas-e-decisoes.md` | Conversas e decisões — transferência para Claude Code | `7c53f4d2187dd2b38a36b2c5fa9519466cbfa810` |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/dossie-mestre-legado.md` | ORA 5G — DOSSÍE MESTRE UNIFICADO PARA CLAUDE | `3eb0816a0f77e80aefd62ff45c7b1ac95deb1d68` |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/conversa_inicial_colada.md` | Sem H1 | `1b04717d75de8cf36caf6d699ad826646efedd84` |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_1_plano_mestre.md` | Plano mestre de desenvolvimento da plataforma Ora 5G | `07b2646ee84790cc8b12d4af0b59284e0891b36d` |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_2_plano_mestre.md` | Plano mestre de desenvolvimento da plataforma Ora 5G | `f5b7c5a1f431f8cded54bbf4744bc3079f3fa60d` |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_3_plano_mestre.md` | Plano mestre de desenvolvimento da plataforma Ora 5G | `f5e727478da543af5db5cdfeafc3d29e3138f40e` |
| `.claude/skills/engenheiro-senior-ora5g/references/roteiro-engenharia.md` | Roteiro de desenvolvimento e governança | `77b453df91ba042a3e15eb598ee64b3c8a8c28c0` |
| `.github/ISSUE_TEMPLATE.md` | ORA-XXX-000 — [Título] | `f3e44400f4156f9ec9ab2a6600b5c98e7f658829` |
| `.github/PULL_REQUEST_TEMPLATE.md` | Pull Request — Ora 5G | `f69e6bd21959dadfcc2847bdd06a11af73b2a0de` |
| `AGENTS.md` | AGENTS.md — Orientação para Codex e quaisquer outros agentes | `05846eeb088368ed9abdee9de40eab1f93483277` |
| `CLAUDE.md` | CLAUDE CODE — INSTRUÇÕES PERMANENTES DO PROJETO ORA 5G | `2fd164e6bcda15c66354ab61d9eaa380dba21bf1` |
| `PARA_COLAR_NO_CLAUDE.md` | PROMPT INICIAL PARA O CLAUDE / CLAUDE CODE | `5498a65577e7268ed4e2a6b248107b21fdbdbbc5` |
| `README.md` | ORA 5G — PACOTE DE TRANSFERÊNCIA PARA CLAUDE CODE E CODEX | `0a11b93d0c885ed7723a9003d89dedf24db158be` |
| `apps/plataforma/AGENTS.md` | Sem H1 | `af3b7c84114bafeee578bf1adff2ef74af2cc6a2` |
| `apps/plataforma/README.md` | Plataforma Ora 5G | `0fb88011378dc67ca0c1adc7c19b049ab3077388` |
| `deploy/homologacao/LEIA-ME.md` | Homologação no servidor (opção A do ADR-001: cPanel + Apache + processo do usuário `dev`) | `0ad0a4680158447c74f0ad351ecea1eac6b7024b` |
| `docs/00_CONTEXTO_E_DECISOES.md` | 00 — Contexto, objetivo, escopo e decisões | `95eabb66ce9cbdddafc0d109d19d4332fab9c16d` |
| `docs/01_REQUISITOS.md` | 01 — Requisitos rastreáveis da Ora 5G | `8d2cf132642889b1dc21b48bda1814ac755d5fec` |
| `docs/02_ARQUITETURA.md` | 02 — Arquitetura e contratos internos | `42a5545bb0a071b500b00d3c6254711ef3eec3c6` |
| `docs/03_DADOS.md` | 03 — Modelo conceitual de dados (para desenho físico posterior) | `dd3f7d24ee7a780ec911c269d61c6aa06547d5ec` |
| `docs/04_FLUXOS.md` | 04 — Jornadas, estados, exceções e trilhas de auditoria | `d5b267f58d8dbe3a6f0569e5f91aad05d528e87f` |
| `docs/05_PERMISSOES.md` | 05 — Perfis, permissões e aprovações | `2754575e01737ef5d03cc928e458b63857700694` |
| `docs/06_INTEGRACOES.md` | 06 — Integrações externas e políticas de adaptação | `412f1b22045af7c718cff43d760011c4475aae62` |
| `docs/07_ROADMAP.md` | 07 — Roadmap por ciclos, etapas, entregáveis e gates | `bc7bd50b0b4662f91bd1d6a3769727c329ef5b10` |
| `docs/08_DESIGN_E_TELAS.md` | 08 — Referência de front-end, experiência e telas | `5e0e8d992961ac61bc57b38cda28f8dfb6942c06` |
| `docs/09_TESTES_E_ACEITE.md` | 09 — Estratégia de testes, rastreabilidade e definição de pronto | `61b7d1c144f1db0a8891e07b6ccacf64710d6e7e` |
| `docs/10_DECISOES_PENDENTES.md` | 10 — Decisões em aberto: não inferir silenciosamente | `bfe4b20c907e93e91e05181bd6058dcb9589ed8d` |
| `docs/11_OPERACAO_DOS_AGENTES.md` | 11 — Coordenação Claude Code × OpenAI Codex | `b0fe6eff9bac2511d36bc1212fa51c54ba71338b` |
| `docs/12_HISTORICO_E_PROVENIENCIA.md` | 12 — Origem, citações do proprietário e mudanças de rumo | `695508e998a360a455acd97df51863480824d859` |
| `docs/13_PROMPTS_POR_FASE.md` | 13 — Prompts operacionais prontos para dividir o trabalho | `980adbd80bc040955dcb6ad16f14f4ec92bfe28d` |
| `docs/ESTADO_ATUAL_E_PASSAGEM.md` | Estado atual do projeto e passagem de contexto | `d829ee682f9c3e953961c68ac388ceeb5d4b1378` |
| `docs/PENDENCIAS_DO_PROPRIETARIO.md` | O que depende do proprietário | `c8cd87aeb1aca044d8e03fbefd551e355c24a830` |
| `docs/adr/ADR-001-infraestrutura-ipv4-portas-e-ambientes.md` | ADR-001 — Infraestrutura: servidor só IPv4, mapa de portas, domínios e ambientes | `f454c6532d8ab33579e5236e1ee2ac1326ab7bb3` |
| `docs/adr/ADR-002-empresa-unidades-perfis-e-permissoes.md` | ADR-002 — Empresa, unidades, perfis e permissões (fundação do acesso) | `2aec42fd20d57bf0b02313928104c7d9d16e40bc` |
| `docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md` | ADR-003 — Catálogo, preço, custo e estoque com IMEI/ICCID | `afc1c1ecc8d6dd05a14e13fbbc935376b2b24d19` |
| `docs/adr/ADR-004-vendas-pagamentos-e-caixa.md` | ADR-004 — Vendas, pagamentos e caixa | `7a53083f5f763ac7a80d41a3fb22e7826f81b751` |
| `docs/adr/ADR-005-ora-connect-operacoes.md` | ADR-005 — Ora Connect: operações telecom persistentes e adaptador Nogle no servidor | `5345d1b2255a89641bddc9ccb7b57f0e487b2fa4` |
| `docs/adr/ADR-006-fila-fiscal-interna.md` | ADR-006 — Fila fiscal interna (pedido, aprovação e registro da nota) | `5bb3ee12533bbaa3b1b47e85fd10ab47c97478cb` |
| `docs/adr/ADR-007-transferencias-e-defeitos.md` | ADR-007 — Pedidos internos de transferência e local DEFEITOS (#60) | `40021bc1fa0e0a086e2f530d49248f11da428eb5` |
| `docs/adr/ADR-008-cliente-compartilhado-e-dados-pessoais.md` | ADR-008 — Cliente compartilhado da rede e proteção dos dados pessoais (lote L5a) | `77996a6dcb2a65f6f4290ff7b2bdcf0eb6371772` |
| `docs/alinhamento/ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md` | Adendo ao prompt do Claude — relatório Web e Nogle | `6bf27ed611ffa7a57554194c4e01af5312efb084` |
| `docs/alinhamento/ANALISE_DO_PLANO.md` | Análise completa do plano × estado real | `2a1c5a62266d85952bdc078ec72a2b8409146e17` |
| `docs/alinhamento/BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md` | Busca por produto, lojas e pedidos internos de transferência | `b47c449aabee7794460cbd317745237a2f95f62f` |
| `docs/alinhamento/CONFERENCIA_DAS_CORRECOES_2026-11-07.md` | Conferência das correções do Claude e orientação para a próxima implementação | `3e69592f85c03e381890200d06fbcb9a209f3d33` |
| `docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md` | Configuração por fase e transição do mockup para o sistema real | `1f1c4f79fe16dd443e6fc93c6572387efacd2fe4` |
| `docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md` | Execução integral — checkpoint do programa | `892f1e524fa95937824c11f5578999a6a66083f4` |
| `docs/alinhamento/FILA_DE_EXECUCAO.md` | Fila de execução — núcleo para sair da Rein | `b33bd54173d355d11abb1111a91c94c1663729b5` |
| `docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md` | Fotos obrigatórias dos produtos — ORA-CAT-011 | `f049ab1d7bf608b24877105101c23b24c2e5cc71` |
| `docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md` | Índice dos relatórios Codex e ordem de leitura | `9ae994f29df4d8f4c68047fcfed314c983f9c633` |
| `docs/alinhamento/MATRIZ_DEMO_REAL.md` | Matriz demonstração × aplicação real | `96684ea300fbdb13f9268ccb7bb4b7b8495fd5b9` |
| `docs/alinhamento/NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md` | Nogle: registro oficial, venda, recorrência e desempenho | `5ff45132b1acd40d4a341676b32f5ba34a5f66ff` |
| `docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md` | Pedido de revisão ao Codex | `b4e0244591dd16d40838dbeee12ba0593f0774aa` |
| `docs/alinhamento/PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md` | Prompt completo — Claude Code: da revisão ao funcionamento real | `a0038e79f96dc9009caa282229dd11ad012ae9d4` |
| `docs/alinhamento/PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md` | Claude Code — execução prioritária da plataforma Ora 5G | `bf41cda3dd389492b1ac7a6ae5bf005dbe3b2c52` |
| `docs/alinhamento/RASTREABILIDADE.md` | Rastreabilidade dos 179 requisitos | `a2f46b53d712cfff5f7f8acb6be83cfaed5106b8` |
| `docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md` | Reconciliação dos achados do Codex com o código atual — 09/11/2026 | `5c1b771aa3831a224557f2ecf063ad458a89282e` |
| `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md` | Respostas do Claude Code à revisão do Codex — 07/11/2026 | `b5654d3bba3bf58f01c566cbe8e80ec2efc62bf6` |
| `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-08.md` | Respostas à auditoria do Codex de 08/11/2026 | `02d51b114c5e689827679231c9cbe9a3b327d21a` |
| `docs/alinhamento/REVISAO_DO_PLANEJAMENTO_2026-11-08.md` | Revisão do planejamento — 08/11/2026 | `6196c3175916b54850ad53741fd434e174f75de5` |
| `docs/alinhamento/REVISAO_FRONTEND_2026-11-07.md` | Revisão do front-end e novo visual da demonstração | `7428a09c6506db047a18369ed718e2ee1acf6aad` |
| `docs/alinhamento/REVISOES_CODEX.md` | Revisões do Codex — análise de sistemas e alinhamento | `5202ebbbaa8383e5dc2fa60b730634e43a8f6da7` |
| `docs/analises/ANALISE_SISTEMAS_2026-11-07.md` | Análise de sistemas, aderência ao escopo e andamento — 07/11/2026 | `817171ae773dd4d93121d789373dbb360f85bfa1` |
| `docs/analises/ARQUIVOS_DO_LOTE_55D10AF_2026-11-08.md` | Arquivos do lote 7f5fd41 → 55d10af | `f9ba5ef1ea3cc9191a9b4c7710da96e7644a1e5a` |
| `docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md` | Auditoria do Claude Code — requisitos, código e Supabase — 08/11/2026 | `22cbcee0d2e3287fafc663fb1cd43fb29a4dd284` |
| `docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md` | Auditoria funcional — front-end, backend, migrations e Supabase | `5d467d6be114f95350c76554a6c989e8a00838e0` |
| `docs/analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md` | Matriz dos 172 requisitos — revisão de 08/11/2026 | `e833419b2bfdd6bc71673c4377c29e9fb478b382` |
| `docs/analises/PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md` | Nogle/Contel: operações, gateway e repasses da Ora Connect | `88d0224cb0ee2016832ce5e5726b3fe3226915f8` |
| `docs/analises/REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md` | Conferência do catálogo real e fotos — aebbdcc — 08/11/2026 | `8288deaf1a19162f31ca06b3348aa29ab6b1a1fa` |
| `docs/analises/REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md` | Revisão das alterações do Claude e do relatório de navegação — 08/11/2026 | `db452e648de90b7cb32f5b203072706427eb375c` |
| `docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md` | Revisão minuciosa das alterações recentes do Claude | `cc7ca63ff496dc89528aeb8add9ab303899a6ed1` |
| `docs/analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md` | Merges, duplicidades e versões antigas — 09/11/2026 | `d9afc86a8c634b7ef3710fce2cea0db0fefc4093` |
| `docs/analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md` | Revisão consolidada — Nogle, merges, estoque e escopo atual | `7ced5de59fb2d67513c05e42d9d2003616ca7951` |
| `docs/analises/REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md` | Revisão independente: vendas, pagamentos e caixa reais | `f6c4f1af7b8174e23c2556630b6ad6411841fea8` |
| `docs/analises/TESTES_E_ANALISE_POR_SETOR_2026-11-08.md` | Rodada de testes e análise por setor — 08/11/2026 | `a469aec33d7d02b6eae81709c21ae0666dd946ee` |
| `docs/analises/evidencias/2026-11-08-fotos/LEIA-ME.md` | Evidências da revisão de fotos — aebbdcc | `9e2967146dd0374fa39728aea7244d31c0be1083` |
| `docs/analises/evidencias/2026-11-08-setores/LEIA-ME.md` | Evidências dos testes por setor — 08/11/2026 | `6d0f7b6623148834b3cb97d1992498bcee049034` |
| `docs/analises/evidencias/2026-11-08-vendas/LEIA-ME.md` | Evidências locais — vendas, pagamentos e caixa — 371cef0 | `22a1cba338d49eb686e3fcceb7e86bc317699a27` |
| `docs/analises/evidencias/2026-11-08-web/LEIA-ME.md` | Evidências da revisão do relatório Web — 08/11/2026 | `c9dc86279ea79fec8377ca657503e8b922b35300` |
| `docs/analises/evidencias/2026-11-08/LEIA-ME.md` | Reproduções independentes — 08/11/2026 | `00c2f4b5f07c25e167fde1ff9e1a58b035b6bce8` |
| `docs/analises/evidencias/2026-11-09-merges-e-nogle/LEIA-ME.md` | Evidências — merges e prontidão Nogle — 09/11/2026 | `412c76e28f9cc7e1000f31fac15daba0dba7ff5a` |
| `docs/analises/evidencias/2026-11-09-nogle-9b1109/LEIA-ME.md` | Evidências da revisão Nogle — 9b1109e | `d7672ce0dd4cc721359b954864f6a9ed2fa359a6` |
| `docs/etapa-0/ETAPA_0_BASE_CONSOLIDADA.md` | Etapa 0 — Base consolidada do projeto (leitura integral) | `b12647145aa1ac97d95cf10df4ebf694ed409626` |
| `docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md` | Etapa 0 — Decisões do proprietário (06/11/2026), contrato Nogle parcial e plano de 6 meses | `803014d1a28701034a8d3a90b70ddecf961c9745` |
| `docs/etapa-0/ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md` | Entendimento confirmado, pontos em aberto e proposta da Etapa 0 | `a33f807d76d423789c512f613db94b3df18dae9a` |
| `docs/etapa-1/PLANO_DE_INICIO_DA_IMPLEMENTACAO.md` | Plano de início da implementação — Ora 5G Platform | `ef3490772adbf3591a241f8162ec0f5d487d9d78` |
| `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md` | APIs, acessos e habilitações necessárias | `18944dbe55e2ec7a7f2c999a41e1e94ff98afef5` |
| `docs/integracoes/NOGLE_API_REFERENCIA.md` | API NOGLE — referência completa para a Ora Connect | `5279fc7cd86b52282570f34b6137653f486fd393` |
| `docs/integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md` | Perguntas para o responsável pela API Nogle | `291b9d1f8dc2bf2c03131c6ab488c6e480108993` |
| `docs/integracoes/VARIAVEIS_DE_AMBIENTE.md` | Variáveis de ambiente e credenciais — Ora 5G Platform | `233162ef3cbf99825e25d8931375ef1f0f0c4a0a` |
| `docs/operacao/CONECTAR_CLAUDE_CODE_SSH_WINDOWS.md` | Conectar o Claude Code (Windows) ao servidor por SSH | `ef4eb922a213500a52f6a5a9096c844b3664efac` |
| `docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md` | Go/no-go da loja piloto e critérios para sair da Rein | `094208049f1c0fe6fe2b19ee204649c51bb377d6` |
| `docs/prototipos/estoque-por-loja-2026-11-09/LEIA-ME.md` | Proposta visual — produto, lojas e transferência | `b6eab3fafeac8001aef781da086470f4593f9e3c` |
| `docs/skills/engenheiro-senior-ora5g/AUDITORIA_GITHUB_2026-11-09.md` | Auditoria técnica do GitHub — Sistema Ora 5G | `b16b976d9c6f73a3b8f1d3e4074d906dc548f1cf` |
| `docs/skills/engenheiro-senior-ora5g/MANIFESTO.md` | Proveniência, integridade e limites — Skill Ora 5G | `5e9aec2e07d7db36be64fe161c47554a8a67ac9a` |
| `docs/skills/engenheiro-senior-ora5g/PROMPT_LEITURA_E_RECONCILIACAO_2026-11-10.md` | Prompt de leitura e reconciliação — Claude Code / Ora 5G | `f9f4e9440ee226e106ff787e1387250670031651` |
| `docs/skills/engenheiro-senior-ora5g/PROMPT_PARA_CLAUDE.md` | Prompt inicial para Claude Code (copiar e colar) | `774d3a5281e18a62253487176506743df4feefd0` |
| `docs/skills/engenheiro-senior-ora5g/README_INSTALACAO.md` | Instalação da habilidade Claude Code — Engenheiro Sênior Ora 5G | `1f16452bdc63a283115c2052ecf14d1ec58282f6` |
| `originais/historico/conversa_inicial_colada.md` | Sem H1 | `1b04717d75de8cf36caf6d699ad826646efedd84` |
| `originais/research/pesquisa_1_plano_mestre.md` | Plano mestre de desenvolvimento da plataforma Ora 5G | `07b2646ee84790cc8b12d4af0b59284e0891b36d` |
| `originais/research/pesquisa_2_plano_mestre.md` | Plano mestre de desenvolvimento da plataforma Ora 5G | `f5b7c5a1f431f8cded54bbf4744bc3079f3fa60d` |
| `originais/research/pesquisa_3_plano_mestre.md` | Plano mestre de desenvolvimento da plataforma Ora 5G | `f5e727478da543af5db5cdfeafc3d29e3138f40e` |
| `packages/banco/README.md` | Banco de dados (Supabase) | `3a84f6ea753f180ae2970a4619fa81b90d4805ba` |
| `packages/banco/supabase/semente/LEIA-ME.md` | Semente do banco de desenvolvimento | `55cfe62b1496b2db65618138dd437ed2bd2ea8d0` |
| `packages/dominio/README.md` | Regras de negócio puras | `44478102e0f08c3629a26012445dcebe07785569` |
| `referencias_visuais/guia_design.md` | Ora 5G — Guia inicial de design para desenvolvimento | `8a63363d14198b06578317677d5d04c8c7a11655` |
| `templates/ISSUE_TEMPLATE.md` | ORA-XXX-000 — [Título] | `f3e44400f4156f9ec9ab2a6600b5c98e7f658829` |
| `templates/PULL_REQUEST_TEMPLATE.md` | Pull Request — Ora 5G | `f69e6bd21959dadfcc2847bdd06a11af73b2a0de` |

## Tickets obrigatórios e estado

Ler #76–#85 em conjunto com os anexos/provas. #78/#79/#80/#82/#83 continuam reproduzíveis neste corte. #84 acompanha validação do ambiente, não falta presumida de migrations. A aplicação das 53 é registro do programador com hashes conferidos; o Codex não consultou o banco remoto. #69–#75 têm correções R1/R2 e não devem ser marcadas como defeitos persistentes apenas pelo estado aberto.

Mapa correto: REV-NOV-004 → #71, REV-NOV-005 → #72, REV-NOV-006 → #73, REV-NOV-007 → #74. R1: #69/#71/#72 e entradas da #75; R2: #70/#73/#74 e importação da #75.

As 85 issues/PRs e 86 comentários foram recuperados nesta rodada. Nenhuma fonte inacessível foi inventada. O link privado do projeto ChatGPT anteriormente abriu sem conteúdo legível; as decisões disponíveis nesta conversa e no GitHub foram consideradas.
