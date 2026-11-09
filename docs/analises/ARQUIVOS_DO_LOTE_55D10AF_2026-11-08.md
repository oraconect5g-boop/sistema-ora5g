# Arquivos do lote 7f5fd41 → 55d10af

Complemento da [revisão](REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md). São **78 caminhos**, incluindo documentação incorporada do próprio Codex. A tabela registra a função e a evidência aplicável, sem transformar arquivo gerado, fixture ou tela simulada em entrega operacional.

| Arquivo | Natureza / conferência |
|---|---|
| `.env.example` | Nome NOGLE_SECONDARY_KEY adicionado; exemplo não prova configuração de credenciais |
| `apps/plataforma/e2e/acesso-real.spec.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `apps/plataforma/e2e/connect.spec.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `apps/plataforma/src/app/auth/confirmar/route.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/conta/senha/acoes.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/conta/senha/page.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/demo/connect/_abas/ChipsConnect.tsx` | Correção eSIM conferida em Playwright 360/1280; #23 encerrada |
| `apps/plataforma/src/app/demo/connect/_abas/RecargaConnect.tsx` | Correção LINK conferida em Playwright 360/1280; #24 encerrada; regras financeiras ilustrativas não homologadas |
| `apps/plataforma/src/app/entrar/CampoSenha.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/entrar/acoes.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/entrar/page.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/entrar/recuperar/acoes.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/entrar/recuperar/page.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/equipe/acoes.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/equipe/page.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/escolher-loja/acoes.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/escolher-loja/page.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/inicio/page.tsx` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/app/sair/route.ts` | Acesso real/UI/Server Action revisados; autorização final em RPC; sem sessão real homologada |
| `apps/plataforma/src/lib/acesso/redirecionar.ts` | Regras/decisão de sessão; validações e separação erro/ausência cobertas; dependem das correções de RPC |
| `apps/plataforma/src/lib/acesso/regras.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `apps/plataforma/src/lib/acesso/regras.ts` | Regras/decisão de sessão; validações e separação erro/ausência cobertas; dependem das correções de RPC |
| `apps/plataforma/src/lib/acesso/sessao.ts` | Regras/decisão de sessão; validações e separação erro/ausência cobertas; dependem das correções de RPC |
| `apps/plataforma/src/lib/definir-chave.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `apps/plataforma/src/lib/supabase/servidor.ts` | SSR tipado/roteamento; tipos/build/E2E verdes; #11 segue sem prova real de renovação |
| `apps/plataforma/src/lib/supabase/tipos-banco.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `apps/plataforma/src/lib/supabase/tipos-banco.ts` | Artefato gerado de schema; tipos/contrato com migrations conferidos; runtime/centavos ainda exigem validação |
| `apps/plataforma/src/proxy.ts` | SSR tipado/roteamento; tipos/build/E2E verdes; #11 segue sem prova real de renovação |
| `apps/worker/eslint.config.mjs` | Configuração do workspace worker; lint/tipos/testes existentes aprovados |
| `apps/worker/package.json` | Workspaces/dependências do worker e PostgreSQL de teste; npm ci, tipos, testes e build aprovados |
| `apps/worker/src/executar-identidade.ts` | Worker de identidade e adaptador Auth; quatro testes verdes; conclusão de convite exige REV-027/029 |
| `apps/worker/src/identidade.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `apps/worker/src/identidade.ts` | Worker de identidade e adaptador Auth; quatro testes verdes; conclusão de convite exige REV-027/029 |
| `apps/worker/src/supabase.ts` | Worker de identidade e adaptador Auth; quatro testes verdes; conclusão de convite exige REV-027/029 |
| `apps/worker/tsconfig.json` | Configuração do workspace worker; lint/tipos/testes existentes aprovados |
| `apps/worker/vitest.config.ts` | Configuração do workspace worker; lint/tipos/testes existentes aprovados |
| `backlog.json` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `deploy/homologacao/LEIA-ME.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `deploy/homologacao/definir-chave.sh` | Leitura/gravação do exemplo de ambiente; 13 casos do @next/env verdes; nenhum segredo real lido |
| `deploy/homologacao/publicar.sh` | Separação de ambiente web/worker inspecionada e bash -n aprovado; sem publicação remota pelo Codex |
| `deploy/homologacao/worker-identidade.sh` | Separação de ambiente web/worker inspecionada e bash -n aprovado; sem publicação remota pelo Codex |
| `docs/01_REQUISITOS.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/ESTADO_ATUAL_E_PASSAGEM.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/PENDENCIAS_DO_PROPRIETARIO.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/adr/ADR-002-empresa-unidades-perfis-e-permissoes.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/ANALISE_DO_PLANO.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/FILA_DE_EXECUCAO.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/alinhamento/RASTREABILIDADE.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-08.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/REVISOES_CODEX.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/alinhamento/status-requisitos.json` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/analises/evidencias/2026-11-08/LEIA-ME.md` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/analises/evidencias/2026-11-08/banco.repro.ts` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/analises/evidencias/2026-11-08/telas.repro.ts` | Documento/evidência anterior do Codex incorporado pelo PR25; preservar a base histórica |
| `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md` | Planejamento/status/contrato/documentação: confrontado com decisões e limitações descritas na revisão; não comprova função real |
| `package-lock.json` | Workspaces/dependências do worker e PostgreSQL de teste; npm ci, tipos, testes e build aprovados |
| `packages/banco/package.json` | Workspaces/dependências do worker e PostgreSQL de teste; npm ci, tipos, testes e build aprovados |
| `packages/banco/src/acesso-equipe.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `packages/banco/src/banco-de-teste.ts` | Infraestrutura de fixture/Auth e PostgreSQL local; dados sintéticos; não é evidência de usuário real |
| `packages/banco/src/cenario-catalogo.ts` | Infraestrutura de fixture/Auth e PostgreSQL local; dados sintéticos; não é evidência de usuário real |
| `packages/banco/src/cenario.ts` | Infraestrutura de fixture/Auth e PostgreSQL local; dados sintéticos; não é evidência de usuário real |
| `packages/banco/src/concorrencia.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `packages/banco/src/integridade-estoque.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `packages/banco/src/migrations.test.ts` | Teste/regressão; suíte existente verde; limitações dos pulados e novos cenários na revisão |
| `packages/banco/src/postgres-real.ts` | Infraestrutura de fixture/Auth e PostgreSQL local; dados sintéticos; não é evidência de usuário real |
| `packages/banco/src/supabase-simulado.sql` | Infraestrutura de fixture/Auth e PostgreSQL local; dados sintéticos; não é evidência de usuário real |
| `packages/banco/supabase/aplicadas-dev.json` | Histórico versionado: oito migrations desta base iguais às correspondentes no remoto; nona de fotos ainda fora da main |
| `packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql` | Migration de estoque revisada; provas originais + regressões + concorrência real verdes |
| `packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql` | Migration de sessão/equipe revisada; testes existentes verdes; quatro achados novos REV-026–029 |
| `packages/banco/supabase/reversao/20261108195850_integridade_estoque.sql` | Reversão local coberta pela suíte de migrations; não executada em banco remoto |
| `packages/banco/supabase/reversao/20261108202654_acesso_sessao_e_equipe.sql` | Reversão local coberta pela suíte de migrations; não executada em banco remoto |
| `scripts/gerar-rastreabilidade.mjs` | Total dinâmico e requisito de fotos no piloto; gerador --conferir aprovado |

