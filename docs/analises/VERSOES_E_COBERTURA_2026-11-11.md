# Versões e cobertura da revisão de 11/11/2026

Base `953b21e0b90f4823759de9bba8f38452dd6769e8`; comparação com `0b6b45e`. A tabela documenta inventário, recuperação e confronto por versão; não declara auditoria linha a linha de cada arquivo histórico. [Parecer e achados](REVISAO_INTEGRAL_CLAUDE_2026-11-11.md).

## Coleções

556 arquivos atuais, 544 textos com hash conferido, 109 Markdown, 28 migrations; 12 ativos visuais inventariados. Foram recuperados 67 corpos de issues/PRs e 71 comentários, sem atingir a página de 100 e com contagem cruzada. Nove PRs; 62 branches. O pacote da [PR #67](https://github.com/oraconect5g-boop/sistema-ora5g/pull/67) conserva o índice das 108 fontes Markdown anteriores, 138 referências a variantes de PRs, 41 links Markdown e 98 conteúdos históricos distintos recuperados. O relatório Web original permanece nele.

Não substituir a leitura dos relatórios pelos seus títulos. Fontes iguais por blob foram reconciliadas com a leitura anterior; fontes diferentes exigem confronto. Novos conteúdos em outra sessão devem ser acrescentados. Os 28 arquivos SQL são observados no Git e aplicados no banco local de teste; não se declara nova conferência do banco remoto.

## Branches

| Branch | Head | Comparação com main | Commits exclusivos |
|---|---|---|---:|
| `docs/adr-002-acesso` | `21f4f7c` | behind | 0 |
| `docs/analise-sistemas-2026-11-07` | `173fd5c` | behind | 0 |
| `docs/auditoria-claude-code-2026-11-08` | `f472635` | behind | 0 |
| `docs/configuracao-e-transicao-2026-11-07` | `5f4dec7` | behind | 0 |
| `docs/crontab-ligado` | `3c950ed` | behind | 0 |
| `docs/dominio-principal-no-ar` | `bb14add` | behind | 0 |
| `docs/dominio-principal-temporario` | `6fc3102` | behind | 0 |
| `docs/estado-pos-publicacao` | `b8ae443` | ancestral_na_listagem_main | 0 |
| `docs/execucao-integral-20261110` | `d8c1bc6` | diverged | 1 |
| `docs/homologacao-0fa1546` | `a74cb6e` | ancestral_na_listagem_main | 0 |
| `docs/homologacao-8f7a458` | `3a40417` | ancestral_na_listagem_main | 0 |
| `docs/homologacao-3157e70` | `b2fea55` | ancestral_na_listagem_main | 0 |
| `docs/passo0-reconciliacao-pr33` | `0146f4d` | ancestral_na_listagem_main | 0 |
| `docs/plano-inicio-implementacao` | `29e9e61` | behind | 0 |
| `docs/prompt-financeiro-real-20261110` | `9216f92` | diverged | 1 |
| `docs/reconciliacao-lotes-1-a-5` | `2b92423` | ancestral_na_listagem_main | 0 |
| `docs/resultado-publicacao` | `0bdb47f` | behind | 0 |
| `docs/revisao-web-nogle-2026-11-08` | `290f111` | diverged | 6 |
| `docs/skill-engenheiro-senior-ora5g-2026-11-10` | `c643b9a` | ancestral_na_listagem_main | 0 |
| `docs/variaveis-de-ambiente` | `a28a493` | behind | 0 |
| `feature/ORA-002-esqueleto-monorepo` | `e4d386f` | behind | 0 |
| `feature/ORA-003-ambiente-e-segredos` | `85adb92` | behind | 0 |
| `feature/ORA-004-005-banco-acesso` | `eb3710d` | behind | 0 |
| `feature/ORA-006-acesso-equipe` | `ee2de08` | ancestral_na_listagem_main | 0 |
| `feature/ORA-008-frontend-moderno` | `78fccce` | behind | 0 |
| `feature/ORA-65-financeiro-real` | `dc775b0` | ancestral_na_listagem_main | 0 |
| `feature/ORA-ADR-004-vendas` | `a5092a8` | ancestral_na_listagem_main | 0 |
| `feature/ORA-CAT-011-fotos` | `ce7b446` | ancestral_na_listagem_main | 0 |
| `feature/ORA-CONNECT-adaptador` | `8253c65` | ancestral_na_listagem_main | 0 |
| `feature/ORA-FISC-fila` | `f125805` | ancestral_na_listagem_main | 0 |
| `feature/ORA-INV-tela-estoque` | `1d479e6` | ancestral_na_listagem_main | 0 |
| `feature/ORA-L2-lojas` | `9a884ad` | ancestral_na_listagem_main | 0 |
| `feature/ORA-L3-catalogo-cadastro` | `da56f5f` | ancestral_na_listagem_main | 0 |
| `feature/ORA-L3b-precos` | `3ce8d53` | ancestral_na_listagem_main | 0 |
| `feature/ORA-L3c-importador` | `bcd2dd8` | ancestral_na_listagem_main | 0 |
| `feature/ORA-L4a-entrada-estoque` | `e226581` | ancestral_na_listagem_main | 0 |
| `feature/ORA-POS-012-devolucao-troca` | `2e6097c` | ancestral_na_listagem_main | 0 |
| `feature/ORA-connect-nogle` | `ff67f14` | behind | 0 |
| `feature/ORA-implantacao-piloto` | `cb7bfe9` | behind | 0 |
| `feature/ORA-nogle-respostas` | `ba9587c` | ancestral_na_listagem_main | 0 |
| `feature/ORA-telas-reais-consistentes` | `14b0f8a` | ancestral_na_listagem_main | 0 |
| `feature/ORA-transferencias-defeitos-lote5` | `7a8a47c` | ancestral_na_listagem_main | 0 |
| `feature/ORA-visual-azul` | `de7d6fb` | ancestral_na_listagem_main | 0 |
| `feature/demonstracao-e-alinhamento` | `d0616c8` | behind | 0 |
| `fix/ORA-65-redirecionamento-financeiro` | `4ce6997` | ancestral_na_listagem_main | 0 |
| `fix/ORA-acesso-configuracao-lote1` | `bf450d9` | ancestral_na_listagem_main | 0 |
| `fix/ORA-busca-csv-fotos-lote3` | `77de9e9` | ancestral_na_listagem_main | 0 |
| `fix/ORA-demo-lote4` | `0a695d5` | ancestral_na_listagem_main | 0 |
| `fix/ORA-integridade-estoque` | `283532c` | ancestral_na_listagem_main | 0 |
| `fix/ORA-integridade-lote2` | `82e1d88` | ancestral_na_listagem_main | 0 |
| `fix/ORA-nome-nogle` | `f77b0df` | ancestral_na_listagem_main | 0 |
| `fix/homologacao-trava` | `7430b7a` | behind | 0 |
| `fix/homologacao-vigia` | `1b20bdd` | behind | 0 |
| `fix/polimento-apresentacao` | `fbabeb9` | behind | 0 |
| `fix/raiz-atras-do-apache` | `0ab7ad7` | behind | 0 |
| `fix/raiz-atras-do-apache-https` | `021bdc7` | behind | 0 |
| `fix/residuos-codex-2026-11-07` | `5775f60` | behind | 0 |
| `fix/revisao-codex-2026-11-07` | `6850b20` | behind | 0 |
| `fix/usuarios-teste-gerente-20261110` | `c6480d5` | ancestral_na_listagem_main | 0 |
| `integra/pr64-gerente-de-teste` | `2ac6a25` | ancestral_na_listagem_main | 0 |
| `main` | `953b21e` | identical | 0 |
| `test/ORA-QUAL-autorizacao-funcoes` | `7911a22` | ancestral_na_listagem_main | 0 |

Só #33, #66 e #67 divergem; são branches documentais. Em #33 há provas TypeScript já reconciliadas na main; não fazer merge integral só para fechar a PR. Nenhuma feature branch estava à frente da main na coleta. Branch antiga existir não significa código duplicado ativo.

## PRs

| PR | Estado | Head | Merge |
|---|---|---|---|
| [#67](https://github.com/oraconect5g-boop/sistema-ora5g/pull/67) | open | `d8c1bc6` | não integrada |
| [#66](https://github.com/oraconect5g-boop/sistema-ora5g/pull/66) | open | `9216f92` | não integrada |
| [#64](https://github.com/oraconect5g-boop/sistema-ora5g/pull/64) | closed | `c6480d5` | 2026-11-10T23:54:59Z |
| [#61](https://github.com/oraconect5g-boop/sistema-ora5g/pull/61) | closed | `c643b9a` | 2026-11-10T13:50:38Z |
| [#33](https://github.com/oraconect5g-boop/sistema-ora5g/pull/33) | open | `290f111` | não integrada |
| [#25](https://github.com/oraconect5g-boop/sistema-ora5g/pull/25) | closed | `f472635` | 2026-11-08T20:18:23Z |
| [#15](https://github.com/oraconect5g-boop/sistema-ora5g/pull/15) | closed | `5f4dec7` | 2026-11-08T12:48:42Z |
| [#8](https://github.com/oraconect5g-boop/sistema-ora5g/pull/8) | closed | `173fd5c` | 2026-11-07T15:10:46Z |
| [#1](https://github.com/oraconect5g-boop/sistema-ora5g/pull/1) | closed | `e4d386f` | 2026-11-07T13:50:16Z |

As coleções de reviews formais estavam vazias; análises em documentos/comentários foram consideradas. L2–L4a têm branches/merges, sem PRs próprias nessa coleção.

## Todos os Markdown atuais

| Fonte | Blob | Confronto nesta revisão |
|---|---|---|
| [.claude/skills/engenheiro-senior-ora5g/SKILL.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/SKILL.md) | `fdc7c34a05627d9b724a8d9533e0e623b72f01ce` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/auditoria/github-2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/auditoria/github-2026-11-09.md) | `b16b976d9c6f73a3b8f1d3e4074d906dc548f1cf` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/contexto-atual.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/contexto-atual.md) | `828cb652d304b68ea5126d1e8f4a882c3debb417` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/fluxos-e-dominio.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/fluxos-e-dominio.md) | `2fb174821573f92f8be48906f201fa5430bb9252` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/historico/conversas-e-decisoes.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/historico/conversas-e-decisoes.md) | `7c53f4d2187dd2b38a36b2c5fa9519466cbfa810` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/historico/dossie-mestre-legado.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/historico/dossie-mestre-legado.md) | `3eb0816a0f77e80aefd62ff45c7b1ac95deb1d68` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/historico/originais/conversa_inicial_colada.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/historico/originais/conversa_inicial_colada.md) | `1b04717d75de8cf36caf6d699ad826646efedd84` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_1_plano_mestre.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_1_plano_mestre.md) | `07b2646ee84790cc8b12d4af0b59284e0891b36d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_2_plano_mestre.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_2_plano_mestre.md) | `f5b7c5a1f431f8cded54bbf4744bc3079f3fa60d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_3_plano_mestre.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_3_plano_mestre.md) | `f5e727478da543af5db5cdfeafc3d29e3138f40e` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.claude/skills/engenheiro-senior-ora5g/references/roteiro-engenharia.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.claude/skills/engenheiro-senior-ora5g/references/roteiro-engenharia.md) | `77b453df91ba042a3e15eb598ee64b3c8a8c28c0` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.github/ISSUE_TEMPLATE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.github/ISSUE_TEMPLATE.md) | `f3e44400f4156f9ec9ab2a6600b5c98e7f658829` | mesmo blob da base anterior; leitura histórica reconciliada |
| [.github/PULL_REQUEST_TEMPLATE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/.github/PULL_REQUEST_TEMPLATE.md) | `f69e6bd21959dadfcc2847bdd06a11af73b2a0de` | mesmo blob da base anterior; leitura histórica reconciliada |
| [AGENTS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/AGENTS.md) | `05846eeb088368ed9abdee9de40eab1f93483277` | mesmo blob da base anterior; leitura histórica reconciliada |
| [CLAUDE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/CLAUDE.md) | `2fd164e6bcda15c66354ab61d9eaa380dba21bf1` | mesmo blob da base anterior; leitura histórica reconciliada |
| [PARA_COLAR_NO_CLAUDE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/PARA_COLAR_NO_CLAUDE.md) | `5498a65577e7268ed4e2a6b248107b21fdbdbbc5` | mesmo blob da base anterior; leitura histórica reconciliada |
| [README.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/README.md) | `0a11b93d0c885ed7723a9003d89dedf24db158be` | mesmo blob da base anterior; leitura histórica reconciliada |
| [apps/plataforma/README.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/README.md) | `0fb88011378dc67ca0c1adc7c19b049ab3077388` | mesmo blob da base anterior; leitura histórica reconciliada |
| [deploy/homologacao/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/deploy/homologacao/LEIA-ME.md) | `0ad0a4680158447c74f0ad351ecea1eac6b7024b` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/00_CONTEXTO_E_DECISOES.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/00_CONTEXTO_E_DECISOES.md) | `95eabb66ce9cbdddafc0d109d19d4332fab9c16d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/01_REQUISITOS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/01_REQUISITOS.md) | `8d2cf132642889b1dc21b48bda1814ac755d5fec` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/02_ARQUITETURA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/02_ARQUITETURA.md) | `42a5545bb0a071b500b00d3c6254711ef3eec3c6` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/03_DADOS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/03_DADOS.md) | `dd3f7d24ee7a780ec911c269d61c6aa06547d5ec` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/04_FLUXOS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/04_FLUXOS.md) | `d5b267f58d8dbe3a6f0569e5f91aad05d528e87f` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/05_PERMISSOES.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/05_PERMISSOES.md) | `2754575e01737ef5d03cc928e458b63857700694` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/06_INTEGRACOES.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/06_INTEGRACOES.md) | `412f1b22045af7c718cff43d760011c4475aae62` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/07_ROADMAP.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/07_ROADMAP.md) | `bc7bd50b0b4662f91bd1d6a3769727c329ef5b10` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/08_DESIGN_E_TELAS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/08_DESIGN_E_TELAS.md) | `5e0e8d992961ac61bc57b38cda28f8dfb6942c06` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/09_TESTES_E_ACEITE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/09_TESTES_E_ACEITE.md) | `61b7d1c144f1db0a8891e07b6ccacf64710d6e7e` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/10_DECISOES_PENDENTES.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/10_DECISOES_PENDENTES.md) | `a2444c9c438dfaf05ea43052e1a1671b512a9417` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/11_OPERACAO_DOS_AGENTES.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/11_OPERACAO_DOS_AGENTES.md) | `b0fe6eff9bac2511d36bc1212fa51c54ba71338b` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/12_HISTORICO_E_PROVENIENCIA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/12_HISTORICO_E_PROVENIENCIA.md) | `695508e998a360a455acd97df51863480824d859` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/13_PROMPTS_POR_FASE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/13_PROMPTS_POR_FASE.md) | `980adbd80bc040955dcb6ad16f14f4ec92bfe28d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/ESTADO_ATUAL_E_PASSAGEM.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/ESTADO_ATUAL_E_PASSAGEM.md) | `6107539a4412917587a8248b3461345d18887b43` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/PENDENCIAS_DO_PROPRIETARIO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/PENDENCIAS_DO_PROPRIETARIO.md) | `c8cd87aeb1aca044d8e03fbefd551e355c24a830` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-001-infraestrutura-ipv4-portas-e-ambientes.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-001-infraestrutura-ipv4-portas-e-ambientes.md) | `f454c6532d8ab33579e5236e1ee2ac1326ab7bb3` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-002-empresa-unidades-perfis-e-permissoes.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-002-empresa-unidades-perfis-e-permissoes.md) | `2aec42fd20d57bf0b02313928104c7d9d16e40bc` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md) | `afc1c1ecc8d6dd05a14e13fbbc935376b2b24d19` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-004-vendas-pagamentos-e-caixa.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-004-vendas-pagamentos-e-caixa.md) | `7a53083f5f763ac7a80d41a3fb22e7826f81b751` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-005-ora-connect-operacoes.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-005-ora-connect-operacoes.md) | `5345d1b2255a89641bddc9ccb7b57f0e487b2fa4` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-006-fila-fiscal-interna.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-006-fila-fiscal-interna.md) | `5bb3ee12533bbaa3b1b47e85fd10ab47c97478cb` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/adr/ADR-007-transferencias-e-defeitos.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/adr/ADR-007-transferencias-e-defeitos.md) | `40021bc1fa0e0a086e2f530d49248f11da428eb5` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md) | `6bf27ed611ffa7a57554194c4e01af5312efb084` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/ANALISE_DO_PLANO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/ANALISE_DO_PLANO.md) | `2a1c5a62266d85952bdc078ec72a2b8409146e17` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md) | `b47c449aabee7794460cbd317745237a2f95f62f` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/CONFERENCIA_DAS_CORRECOES_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/CONFERENCIA_DAS_CORRECOES_2026-11-07.md) | `3e69592f85c03e381890200d06fbcb9a209f3d33` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md) | `1f1c4f79fe16dd443e6fc93c6572387efacd2fe4` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md) | `d59293a07e4d91983d22bb882d7c9b5722652f6a` | added |
| [docs/alinhamento/FILA_DE_EXECUCAO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/FILA_DE_EXECUCAO.md) | `b33bd54173d355d11abb1111a91c94c1663729b5` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md) | `f049ab1d7bf608b24877105101c23b24c2e5cc71` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md) | `9ae994f29df4d8f4c68047fcfed314c983f9c633` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/MATRIZ_DEMO_REAL.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/MATRIZ_DEMO_REAL.md) | `ed90862eb2c15e3aec100f7dfb1d682ecfda6a66` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md) | `5ff45132b1acd40d4a341676b32f5ba34a5f66ff` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md) | `386e6de5518bed387c22accad96f5b1f7d6599d0` | modified |
| [docs/alinhamento/PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md) | `a0038e79f96dc9009caa282229dd11ad012ae9d4` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md) | `bf41cda3dd389492b1ac7a6ae5bf005dbe3b2c52` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/RASTREABILIDADE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/RASTREABILIDADE.md) | `91cf0db68f52ea64b33dbf9f930f3c56c3b05764` | modified |
| [docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md) | `5c1b771aa3831a224557f2ecf063ad458a89282e` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md) | `b5654d3bba3bf58f01c566cbe8e80ec2efc62bf6` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-08.md) | `02d51b114c5e689827679231c9cbe9a3b327d21a` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/REVISAO_DO_PLANEJAMENTO_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/REVISAO_DO_PLANEJAMENTO_2026-11-08.md) | `6196c3175916b54850ad53741fd434e174f75de5` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/REVISAO_FRONTEND_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/REVISAO_FRONTEND_2026-11-07.md) | `7428a09c6506db047a18369ed718e2ee1acf6aad` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/alinhamento/REVISOES_CODEX.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/REVISOES_CODEX.md) | `5202ebbbaa8383e5dc2fa60b730634e43a8f6da7` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/ANALISE_SISTEMAS_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/ANALISE_SISTEMAS_2026-11-07.md) | `817171ae773dd4d93121d789373dbb360f85bfa1` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/ARQUIVOS_DO_LOTE_55D10AF_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/ARQUIVOS_DO_LOTE_55D10AF_2026-11-08.md) | `f9ba5ef1ea3cc9191a9b4c7710da96e7644a1e5a` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md) | `22cbcee0d2e3287fafc663fb1cd43fb29a4dd284` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md) | `5d467d6be114f95350c76554a6c989e8a00838e0` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md) | `e833419b2bfdd6bc71673c4377c29e9fb478b382` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md) | `88d0224cb0ee2016832ce5e5726b3fe3226915f8` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md) | `8288deaf1a19162f31ca06b3348aa29ab6b1a1fa` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md) | `db452e648de90b7cb32f5b203072706427eb375c` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md) | `cc7ca63ff496dc89528aeb8add9ab303899a6ed1` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md) | `d9afc86a8c634b7ef3710fce2cea0db0fefc4093` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md) | `7ced5de59fb2d67513c05e42d9d2003616ca7951` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md) | `f6c4f1af7b8174e23c2556630b6ad6411841fea8` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/TESTES_E_ANALISE_POR_SETOR_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/TESTES_E_ANALISE_POR_SETOR_2026-11-08.md) | `a469aec33d7d02b6eae81709c21ae0666dd946ee` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-08-fotos/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-08-fotos/LEIA-ME.md) | `9e2967146dd0374fa39728aea7244d31c0be1083` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-08-setores/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-08-setores/LEIA-ME.md) | `6d0f7b6623148834b3cb97d1992498bcee049034` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-08-vendas/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-08-vendas/LEIA-ME.md) | `22a1cba338d49eb686e3fcceb7e86bc317699a27` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-08-web/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-08-web/LEIA-ME.md) | `c9dc86279ea79fec8377ca657503e8b922b35300` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-08/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-08/LEIA-ME.md) | `00c2f4b5f07c25e167fde1ff9e1a58b035b6bce8` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-09-merges-e-nogle/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-09-merges-e-nogle/LEIA-ME.md) | `412c76e28f9cc7e1000f31fac15daba0dba7ff5a` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/analises/evidencias/2026-11-09-nogle-9b1109/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/analises/evidencias/2026-11-09-nogle-9b1109/LEIA-ME.md) | `d7672ce0dd4cc721359b954864f6a9ed2fa359a6` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/etapa-0/ETAPA_0_BASE_CONSOLIDADA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/etapa-0/ETAPA_0_BASE_CONSOLIDADA.md) | `b12647145aa1ac97d95cf10df4ebf694ed409626` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md) | `803014d1a28701034a8d3a90b70ddecf961c9745` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/etapa-0/ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/etapa-0/ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md) | `a33f807d76d423789c512f613db94b3df18dae9a` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/etapa-1/PLANO_DE_INICIO_DA_IMPLEMENTACAO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/etapa-1/PLANO_DE_INICIO_DA_IMPLEMENTACAO.md) | `ef3490772adbf3591a241f8162ec0f5d487d9d78` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md) | `18944dbe55e2ec7a7f2c999a41e1e94ff98afef5` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/integracoes/NOGLE_API_REFERENCIA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/integracoes/NOGLE_API_REFERENCIA.md) | `5279fc7cd86b52282570f34b6137653f486fd393` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md) | `291b9d1f8dc2bf2c03131c6ab488c6e480108993` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/integracoes/VARIAVEIS_DE_AMBIENTE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/integracoes/VARIAVEIS_DE_AMBIENTE.md) | `233162ef3cbf99825e25d8931375ef1f0f0c4a0a` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/operacao/CONECTAR_CLAUDE_CODE_SSH_WINDOWS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/operacao/CONECTAR_CLAUDE_CODE_SSH_WINDOWS.md) | `ef4eb922a213500a52f6a5a9096c844b3664efac` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md) | `094208049f1c0fe6fe2b19ee204649c51bb377d6` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/prototipos/estoque-por-loja-2026-11-09/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/prototipos/estoque-por-loja-2026-11-09/LEIA-ME.md) | `b6eab3fafeac8001aef781da086470f4593f9e3c` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/skills/engenheiro-senior-ora5g/AUDITORIA_GITHUB_2026-11-09.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/skills/engenheiro-senior-ora5g/AUDITORIA_GITHUB_2026-11-09.md) | `b16b976d9c6f73a3b8f1d3e4074d906dc548f1cf` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/skills/engenheiro-senior-ora5g/MANIFESTO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/skills/engenheiro-senior-ora5g/MANIFESTO.md) | `5e9aec2e07d7db36be64fe161c47554a8a67ac9a` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/skills/engenheiro-senior-ora5g/PROMPT_LEITURA_E_RECONCILIACAO_2026-11-10.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/skills/engenheiro-senior-ora5g/PROMPT_LEITURA_E_RECONCILIACAO_2026-11-10.md) | `f9f4e9440ee226e106ff787e1387250670031651` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/skills/engenheiro-senior-ora5g/PROMPT_PARA_CLAUDE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/skills/engenheiro-senior-ora5g/PROMPT_PARA_CLAUDE.md) | `774d3a5281e18a62253487176506743df4feefd0` | mesmo blob da base anterior; leitura histórica reconciliada |
| [docs/skills/engenheiro-senior-ora5g/README_INSTALACAO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/skills/engenheiro-senior-ora5g/README_INSTALACAO.md) | `1f16452bdc63a283115c2052ecf14d1ec58282f6` | mesmo blob da base anterior; leitura histórica reconciliada |
| [originais/historico/conversa_inicial_colada.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/originais/historico/conversa_inicial_colada.md) | `1b04717d75de8cf36caf6d699ad826646efedd84` | mesmo blob da base anterior; leitura histórica reconciliada |
| [originais/research/pesquisa_1_plano_mestre.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/originais/research/pesquisa_1_plano_mestre.md) | `07b2646ee84790cc8b12d4af0b59284e0891b36d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [originais/research/pesquisa_2_plano_mestre.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/originais/research/pesquisa_2_plano_mestre.md) | `f5b7c5a1f431f8cded54bbf4744bc3079f3fa60d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [originais/research/pesquisa_3_plano_mestre.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/originais/research/pesquisa_3_plano_mestre.md) | `f5e727478da543af5db5cdfeafc3d29e3138f40e` | mesmo blob da base anterior; leitura histórica reconciliada |
| [packages/banco/README.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/README.md) | `514eced6f73c91485528733cd390349d058f791d` | mesmo blob da base anterior; leitura histórica reconciliada |
| [packages/banco/supabase/semente/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/semente/LEIA-ME.md) | `55cfe62b1496b2db65618138dd437ed2bd2ea8d0` | modified |
| [packages/dominio/README.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/dominio/README.md) | `44478102e0f08c3629a26012445dcebe07785569` | mesmo blob da base anterior; leitura histórica reconciliada |
| [referencias_visuais/guia_design.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/referencias_visuais/guia_design.md) | `8a63363d14198b06578317677d5d04c8c7a11655` | mesmo blob da base anterior; leitura histórica reconciliada |
| [templates/ISSUE_TEMPLATE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/templates/ISSUE_TEMPLATE.md) | `f3e44400f4156f9ec9ab2a6600b5c98e7f658829` | mesmo blob da base anterior; leitura histórica reconciliada |
| [templates/PULL_REQUEST_TEMPLATE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/templates/PULL_REQUEST_TEMPLATE.md) | `f69e6bd21959dadfcc2847bdd06a11af73b2a0de` | mesmo blob da base anterior; leitura histórica reconciliada |

## Arquivos do intervalo

16 commits; 69 arquivos, 49 novos, 20 alterados, nenhum removido; +10.163/−64 linhas. Inventário detalhado não equivale a teste de todos os ramos.

| Arquivo | Situação | + | − |
|---|---|---:|---:|
| [apps/plataforma/e2e/acesso-real.spec.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/e2e/acesso-real.spec.ts) | modified | 15 | 1 |
| [apps/plataforma/src/app/estoque/entrada/FormularioEntrada.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/estoque/entrada/FormularioEntrada.tsx) | added | 128 | 0 |
| [apps/plataforma/src/app/estoque/entrada/acoes.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/estoque/entrada/acoes.ts) | added | 82 | 0 |
| [apps/plataforma/src/app/estoque/entrada/entrada.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/estoque/entrada/entrada.test.ts) | added | 141 | 0 |
| [apps/plataforma/src/app/estoque/entrada/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/estoque/entrada/page.tsx) | added | 118 | 0 |
| [apps/plataforma/src/app/estoque/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/estoque/page.tsx) | modified | 5 | 3 |
| [apps/plataforma/src/app/financeiro/layout.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/financeiro/layout.tsx) | added | 10 | 0 |
| [apps/plataforma/src/app/lojas/acoes.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/lojas/acoes.ts) | added | 81 | 0 |
| [apps/plataforma/src/app/lojas/lojas.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/lojas/lojas.test.ts) | added | 186 | 0 |
| [apps/plataforma/src/app/lojas/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/lojas/page.tsx) | added | 304 | 0 |
| [apps/plataforma/src/app/produtos/acoes.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/acoes.ts) | added | 99 | 0 |
| [apps/plataforma/src/app/produtos/importar/EscolherColunas.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/importar/EscolherColunas.tsx) | added | 55 | 0 |
| [apps/plataforma/src/app/produtos/importar/acoes.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/importar/acoes.ts) | added | 49 | 0 |
| [apps/plataforma/src/app/produtos/importar/enviar/route.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/importar/enviar/route.ts) | added | 63 | 0 |
| [apps/plataforma/src/app/produtos/importar/importar.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/importar/importar.test.ts) | added | 168 | 0 |
| [apps/plataforma/src/app/produtos/importar/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/importar/page.tsx) | added | 201 | 0 |
| [apps/plataforma/src/app/produtos/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/page.tsx) | added | 305 | 0 |
| [apps/plataforma/src/app/produtos/precos/acoes.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/precos/acoes.ts) | added | 55 | 0 |
| [apps/plataforma/src/app/produtos/precos/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/precos/page.tsx) | added | 229 | 0 |
| [apps/plataforma/src/app/produtos/precos/precos.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/precos/precos.test.ts) | added | 162 | 0 |
| [apps/plataforma/src/app/produtos/produtos.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/produtos.test.ts) | added | 146 | 0 |
| [apps/plataforma/src/componentes/Icone.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/componentes/Icone.tsx) | modified | 4 | 2 |
| [apps/plataforma/src/componentes/MoldeReal.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/componentes/MoldeReal.tsx) | modified | 3 | 3 |
| [apps/plataforma/src/lib/acesso/menu.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/acesso/menu.test.ts) | modified | 16 | 2 |
| [apps/plataforma/src/lib/acesso/menu.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/acesso/menu.ts) | modified | 13 | 6 |
| [apps/plataforma/src/lib/catalogo/cadastro.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/catalogo/cadastro.test.ts) | added | 96 | 0 |
| [apps/plataforma/src/lib/catalogo/cadastro.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/catalogo/cadastro.ts) | added | 158 | 0 |
| [apps/plataforma/src/lib/catalogo/precos.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/catalogo/precos.test.ts) | added | 81 | 0 |
| [apps/plataforma/src/lib/catalogo/precos.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/catalogo/precos.ts) | added | 137 | 0 |
| [apps/plataforma/src/lib/estoque/entrada.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/estoque/entrada.test.ts) | added | 70 | 0 |
| [apps/plataforma/src/lib/estoque/entrada.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/estoque/entrada.ts) | added | 121 | 0 |
| [apps/plataforma/src/lib/importacao/catalogo.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/importacao/catalogo.test.ts) | added | 53 | 0 |
| [apps/plataforma/src/lib/importacao/catalogo.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/importacao/catalogo.ts) | added | 115 | 0 |
| [apps/plataforma/src/lib/importacao/csv.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/importacao/csv.test.ts) | added | 56 | 0 |
| [apps/plataforma/src/lib/importacao/csv.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/importacao/csv.ts) | added | 116 | 0 |
| [apps/plataforma/src/lib/importacao/regras.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/importacao/regras.ts) | added | 71 | 0 |
| [apps/plataforma/src/lib/lojas/regras.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/lojas/regras.test.ts) | added | 150 | 0 |
| [apps/plataforma/src/lib/lojas/regras.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/lojas/regras.ts) | added | 279 | 0 |
| [apps/plataforma/src/lib/supabase/tipos-banco.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/lib/supabase/tipos-banco.ts) | modified | 651 | 1 |
| [apps/plataforma/src/proxy.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/proxy.ts) | modified | 1 | 1 |
| [docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md) | added | 65 | 0 |
| [docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md) | modified | 35 | 0 |
| [docs/alinhamento/RASTREABILIDADE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/RASTREABILIDADE.md) | modified | 15 | 15 |
| [docs/alinhamento/execucao-integral-status.json](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/execucao-integral-status.json) | added | 1645 | 0 |
| [docs/alinhamento/status-requisitos.json](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/docs/alinhamento/status-requisitos.json) | modified | 39 | 14 |
| [packages/banco/src/autorizacao-funcoes.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/autorizacao-funcoes.test.ts) | modified | 108 | 5 |
| [packages/banco/src/catalogo-cadastro.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/catalogo-cadastro.test.ts) | added | 181 | 0 |
| [packages/banco/src/catalogo-estoque.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/catalogo-estoque.test.ts) | modified | 4 | 0 |
| [packages/banco/src/concorrencia.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/concorrencia.test.ts) | modified | 52 | 2 |
| [packages/banco/src/entrada-estoque.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/entrada-estoque.test.ts) | added | 173 | 0 |
| [packages/banco/src/importacao.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/importacao.test.ts) | added | 195 | 0 |
| [packages/banco/src/lojas.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/lojas.test.ts) | added | 298 | 0 |
| [packages/banco/src/precos.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/precos.test.ts) | added | 174 | 0 |
| [packages/banco/src/semente.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/src/semente.test.ts) | modified | 20 | 3 |
| [packages/banco/supabase/aplicadas-dev.json](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/aplicadas-dev.json) | modified | 6 | 1 |
| [packages/banco/supabase/migrations/20261111132503_lojas_cadastro_e_configuracao.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111132503_lojas_cadastro_e_configuracao.sql) | added | 489 | 0 |
| [packages/banco/supabase/migrations/20261111132621_catalogo_cadastro.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111132621_catalogo_cadastro.sql) | added | 401 | 0 |
| [packages/banco/supabase/migrations/20261111133804_precos_e_campanhas.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111133804_precos_e_campanhas.sql) | added | 315 | 0 |
| [packages/banco/supabase/migrations/20261111135906_importacao_catalogo.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111135906_importacao_catalogo.sql) | added | 573 | 0 |
| [packages/banco/supabase/migrations/20261111141337_entrada_estoque.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111141337_entrada_estoque.sql) | added | 396 | 0 |
| [packages/banco/supabase/reversao/20261111132503_lojas_cadastro_e_configuracao.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/reversao/20261111132503_lojas_cadastro_e_configuracao.sql) | added | 19 | 0 |
| [packages/banco/supabase/reversao/20261111132621_catalogo_cadastro.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/reversao/20261111132621_catalogo_cadastro.sql) | added | 22 | 0 |
| [packages/banco/supabase/reversao/20261111133804_precos_e_campanhas.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/reversao/20261111133804_precos_e_campanhas.sql) | added | 46 | 0 |
| [packages/banco/supabase/reversao/20261111135906_importacao_catalogo.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/reversao/20261111135906_importacao_catalogo.sql) | added | 11 | 0 |
| [packages/banco/supabase/reversao/20261111141337_entrada_estoque.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/reversao/20261111141337_entrada_estoque.sql) | added | 15 | 0 |
| [packages/banco/supabase/semente/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/semente/LEIA-ME.md) | modified | 17 | 1 |
| [packages/banco/supabase/semente/vincular-usuarios-de-teste.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/semente/vincular-usuarios-de-teste.sql) | modified | 15 | 3 |
| [packages/dominio/src/identificadores.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/dominio/src/identificadores.test.ts) | modified | 22 | 1 |
| [packages/dominio/src/identificadores.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/dominio/src/identificadores.ts) | modified | 19 | 0 |

O inventário JSON acompanha cada arquivo, SHA, branch e referência. Corpos/comentários do levantamento anterior estão no arquivo da PR #67; o novo comentário e a própria #67 são recuperados no GitHub pelos links, não omitidos como inexistentes.
