# Arquivo de fontes do GitHub

Coleção de corpos e comentários obtidos na coleta de 10/11/2026. São fontes históricas e não ordens novas: decisões atuais e o PROMPT_MESTRE prevalecem. Dados potencialmente sensíveis foram suprimidos; comandos históricos com marcações não devem ser executados literalmente. As URLs originais e hashes preservam a referência.

## Issue #28 — [P1][REV-027] Convite permite autoconcessão quando e-mail do Auth diverge do perfil

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/28
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base auditada: [`55d10afe`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). Código: [packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql:430](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql#L430).

Requisitos: ORA-ORG-002/004/006; ADR-002 §2.4/§6 (administrador não vende e ninguém altera o próprio acesso).

O convite compara o e-mail apenas com `perfis_usuario.email`. A conclusão pelo worker valida o e-mail no Auth, mas não verifica `p_usuario = c.criado_por` nem reaplica a proibição de autoconcessão.

Prova independente local: simular alteração legítima do e-mail no Auth mantendo o perfil antigo; administrador convida o novo e-mail como gerente; worker resolve a conta existente e conclui; o próprio administrador recebe vínculo de gerente e passa a ter `venda.registrar`. Esperado false; obtido true. A alteração de e-mail é capacidade normal do usuário autenticado no Supabase; o teste usa apenas fixtures, sem acessar contas reais.

Corrigir por identidade imutável (UUID) no limite do worker e na criação do convite; sincronização/normalização de e-mail sozinha não substitui a checagem de identidade. Reaplicar hierarquia, escopo e ausência de autoconcessão antes do grant, na mesma transação.

Aceite: e-mail sincronizado e divergente, conta Auth existente, troca concorrente de e-mail, tentativa de dar-se gerente/vendedor, convite legítimo de terceiro e idempotência. Migration aplicada deve permanecer imutável.

Responsabilidade: Claude Code implementa; Codex revisa. Stack mantida: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase. Sem alterações no ambiente remoto nesta revisão. Evidência reproduzível será preservada em `docs/analises/evidencias/2026-11-08-web/`.

---

## Issue #29 — [P1][REV-028] Revogações concorrentes podem deixar a organização sem dono

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/29
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base auditada: [`55d10afe`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). Código: [packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql:276](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql#L276).

Requisitos: ORA-ORG-002/004; ADR-002 §6 promete que a organização nunca fica sem dono.

`encerrar_vinculo` trava somente o vínculo alvo e consulta outro dono sem serializar a decisão por organização. Duas transações podem encerrar vínculos diferentes após ambas confirmarem que existe outro dono.

Prova independente em PostgreSQL 17 real, duas conexões e dados fictícios: donos A e B; transação A encerra vínculo de B sem commit; transação B encerra vínculo de A; B e A fazem commit. Contagem final de donos vigentes = **0**. A regra de não alterar o próprio acesso continua atendida nas duas chamadas, portanto não evita a corrida.

Corrigir em migration nova com trava comum por organização, obtida antes das travas individuais, e revalidar ator/donos após a espera. Aplicar uma ordem consistente também aos outros caminhos que removem/inutilizam dono para evitar deadlock.

Aceite: concorrência real com duas conexões, preservando ao menos um dono utilizável; cenário sequencial; chamadas idempotentes; uma organização não deve bloquear a gestão de outra.

Responsabilidade: Claude Code implementa; Codex revisa. Stack mantida: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase. Sem alterações no ambiente remoto nesta revisão. Evidência reproduzível será preservada em `docs/analises/evidencias/2026-11-08-web/`.

---

## Issue #30 — [P2][REV-029] Worker conclui convite de autor bloqueado sem revalidar autoridade

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/30
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base auditada: [`55d10afe`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). Código: [packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql:540](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql#L540).

Requisitos: ORA-ORG-002/004/006; ADR-002 bloqueio imediato. Lacuna de revogação no processamento assíncrono, distinta da autoconcessão REV-027.

Prova local: dono cria convite para administrador; antes do processamento o perfil do emissor é bloqueado; worker retira o convite da fila e conclui normalmente; surge um novo vínculo de administrador (esperado nenhum no contrato de revogação, obtido 1).

O SQL só verifica situação do convite, correspondência do usuário Auth e papel ativo; não verifica autorização atual do emissor. O mesmo cuidado se aplica a vínculo encerrado ou papel alterado enquanto o convite aguarda.

Definir e implementar o efeito da revogação sobre convites pendentes: revalidar autoridade/escopo na conclusão ou cancelar/requerer nova aprovação auditada. Uma autorização irrevogável de convite precisaria ser decisão explícita; não foi localizada. Não depender apenas de checagem no frontend ou de o worker possuir service_role.

Aceite: bloqueio, encerramento e rebaixamento entre criação e conclusão; convite legítimo; cancelamento concorrente; trilha auditável e ausência de grant parcial. Implementar por migration nova.

Responsabilidade: Claude Code implementa; Codex revisa. Stack mantida: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase. Sem alterações no ambiente remoto nesta revisão. Evidência reproduzível será preservada em `docs/analises/evidencias/2026-11-08-web/`.

---

## Issue #31 — [P2][REV-030] Mockup soma valor de face da recarga à receita e mostra margem de 100%

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/31
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base auditada: [`55d10afe`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). Código: [apps/plataforma/src/demo/dados/vendas.ts:232](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/apps/plataforma/src/demo/dados/vendas.ts#L232).

Requisitos: ORA-CONNECT-006/009, ORA-PERF-001, ORA-REPORT-001; invariante 4 da base consolidada: valor de face de recarga não é receita própria.

`resumoDeVendas` soma `v.total` como faturamento; desempenho/margem e mix também incluem o valor integral. O catálogo da demo define recarga com custo zero e a tela Produtos calcula margem de 100%, inclusive na média.

Prova independente local: venda sintética contendo apenas recarga confirmada de 3.000 centavos => faturamento 3.000; esperado zero de receita própria na ausência de comissão comprovada. Defeito observado na demonstração, sem prova de prejuízo/transação real.

Separar valor vendido/face, recebimento local, pagamento à operadora, margem/comissão contratual e repasse conciliado. Preservar o valor de face na cobrança/transação; não zerar o total devido pelo cliente. Não adotar a proporção ilustrativa 80/20 como contrato. Compartilhar regras entre PDV, Connect, catálogo e relatórios; corrigir labels e média de margem.

Aceite: recarga pura e venda mista; LINK e SALDO; pendente/falha/cancelamento; recebimentos e carteira não duplicados; comissão desconhecida fica pendente, não receita inventada.

Responsabilidade: Claude Code implementa; Codex revisa. Stack mantida: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase. Sem alterações no ambiente remoto nesta revisão. Evidência reproduzível será preservada em `docs/analises/evidencias/2026-11-08-web/`.

---

## Issue #32 — [P2][REV-031] Indicador “só confirmadas” conta ativação pendente e ignora quantidade

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/32
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base auditada: [`55d10afe`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). Código: [apps/plataforma/src/demo/dados/vendas.ts:234](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/apps/plataforma/src/demo/dados/vendas.ts#L234).

Requisitos: ORA-CONNECT-009, ORA-PERF-001; DEC-U46 e invariante 6: telecom só entra na produção após confirmação da operadora.

`resumoDeVendas` usa `situacaoTelecom !== 'falhou'` e `.length`, enquanto o painel de gestão informa “Só as confirmadas pela operadora”. Assim aceita pendente/undefined e soma linhas, não quantidades. A função de domínio `producaoDaVenda` já faz o filtro correto para ativação, portabilidade e recarga.

Prova independente local: venda concluída com uma ativação pendente => telecom 1; esperado 0. O painel do vendedor filtra confirmadas, então os painéis podem divergir.

Usar contrato único de produção: chip físico vendido é fato comercial; ativação/portabilidade/recarga dependem de confirmação oficial; somar quantidades e deduplicar por evento. Separar chips de operações confirmadas na apresentação se necessário.

Aceite: pendente, confirmada, falhou, ausência de status, quantidade maior que um, mesma operação vista em PDV/Connect e reconsulta repetida. Não confundir venda concluída com sucesso telecom.

Responsabilidade: Claude Code implementa; Codex revisa. Stack mantida: TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase. Sem alterações no ambiente remoto nesta revisão. Evidência reproduzível será preservada em `docs/analises/evidencias/2026-11-08-web/`.

---

## PR #33 — Revisão Nogle e merges: 11 lojas, transferências e perguntas da API

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/pull/33
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Consolida a revisão do Claude e as decisões atuais do proprietário, preservando TypeScript/React/Next.js/Tailwind/Node.js/PostgreSQL/Supabase. A base mais recente examinada é **main 9b1109e**; esta branch a incorporou no head de revisão **adf62b71**; o head atual **290f1111** acrescenta o prompt e o índice de leitura.

## Escopo e entregáveis desta revisão

- **11 lojas comerciais + local de exceção DEFEITOS**, confirmados pelo proprietário em 09/11; corrige a premissa anterior de 14 lojas nos documentos de trabalho. Cadastro de referência, imagem conciliada e fluxo interno de transferência em #60.
- [Consolidado atual e ordem das correções](https://github.com/oraconect5g-boop/sistema-ora5g/blob/adf62b7161006e10986a7c211a28b99f13965f3a/docs/analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md).
- [51 perguntas prontas ao responsável pela API Nogle/Contel](https://github.com/oraconect5g-boop/sistema-ora5g/blob/adf62b7161006e10986a7c211a28b99f13965f3a/docs/integracoes/PERGUNTAS_PARA_CONTEL_NOGLE_2026-11-09.md), com prioridades de autenticação, duplicidade, cobrança, recorrência, transferência e repasse. A mensagem não foi enviada a terceiros.
- [Busca visual, disponibilidade e pedido interno](https://github.com/oraconect5g-boop/sistema-ora5g/blob/adf62b7161006e10986a7c211a28b99f13965f3a/docs/alinhamento/BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md) e [protótipo React/TypeScript isolado](https://github.com/oraconect5g-boop/sistema-ora5g/tree/adf62b7161006e10986a7c211a28b99f13965f3a/docs/prototipos/estoque-por-loja-2026-11-09). Testado em 360px e 1360px, sem movimentação real.
- [Revisão de merges e versões anteriores](https://github.com/oraconect5g-boop/sistema-ora5g/blob/adf62b7161006e10986a7c211a28b99f13965f3a/docs/analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md), complementada no consolidado: **149 commits, 43 merges, 81 árvores**. Sem restauração indevida comprovada de código removido; resoluções novas preservam estoque/Connect/notas. Reexport Nogle antigo aponta a implementação canônica do domínio.
- Documentação de passagem sanitizada: retiradas referências de infraestrutura privada. Sem valores de chaves, dados de clientes ou operação real.

## Bloqueantes encontrados

O adaptador/worker Nogle agora existe, com três tipos de operação; gateway completo, recorrência/carteira/repasse e homologação continuam #54. Novos achados reproduzidos:

- **#55 / REV-052:** filtro antigo de publicação deixa segredos Nogle na cópia web.
- **#56 / REV-053:** vendedor sem custo.ver lê custo debitado da carteira.
- **#57 / REV-054:** LINK aceita vínculo com serviço já pago no caixa.
- **#58 / REV-055:** chave de idempotência ignora mudança dos dados do cliente.
- **#59 / REV-056:** uma evidência de recarga confirma duas operações com timestamp igual.

Seis provas novas: um controle passou, cinco falharam por cinco causas, fora do CI normal. As issues e fontes delimitam que não houve Contel real e que a colisão temporal foi sintética. Os bloqueantes anteriores #27–#30 e #45–#53 continuam conforme suas evidências. #19–#24 encerradas após conferência anterior; fotos #26 permanecem parciais.

## Verificação e limites

- Suíte local da composição com o teste permanente anterior: **486 passaram, 2 TODO**. Lint, tipos, scanner, rastreabilidade e catálogo Nogle passaram.
- Banco local reconstruído: 14 migrations, 111 funções, nenhuma sobrecarga antiga; grafo 127 fontes/20 entradas reais sem caminho literal aos dados demo.
- Supabase somente leitura: 38 tabelas públicas com RLS, 14 migrations com novos MD5 conferidos; zero usuários/sessões/operações Connect. Nenhum upload, login real ou migração remota.
- Inventário atual: **179 requisitos / 71 no piloto / nenhum homologado**. Os 6 requisitos de assistência adicionados pelo Claude não são entregas implementadas.
- Preservados os testes permanentes anteriores: desconto com 1000 entradas e 21 cenários Playwright em 2 tamanhos (42 execuções).
- CI do head anterior 2bd58249 passou (429 testes +4 TODO, 176 E2E +10 pulados) para o corte 371cef0.
- **CI do head de revisão adf62b71: [42625031156](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42625031156), SUCESSO.** Head adf62b71; checkout f468484d39ba6ecf316dfa88a4421444aee54477, merge com main d0d36cc. **486 testes passaram, 2 TODO; 182 E2E passaram, 10 pulados.** Lint, tipos, build, scanners e audit de produção passaram (0 vulnerabilidades reportadas). A diferença entre 9b1109e e d0d36cc foi conferida: dois commits somente em docs/ESTADO_ATUAL_E_PASSAGEM.md, sem mudança operacional.

Esta PR acrescenta análise/evidências/protótipo e corrige planejamento/cadastro; não muda o código operacional nem corrige os bugs listados. Correções de produto voltam ao Claude, por migrations incrementais e regressões. Sem deploy, merge desta PR na main ou alteração da stack.

## Prompt completo para o Claude

[Prompt consolidado](https://github.com/oraconect5g-boop/sistema-ora5g/blob/290f1111f964710d744c4ded40df48fed6762b1b/docs/alinhamento/PROMPT_CLAUDE_CONSOLIDADO_2026-11-09.md) e [índice de todos os relatórios](https://github.com/oraconect5g-boop/sistema-ora5g/blob/290f1111f964710d744c4ded40df48fed6762b1b/docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md), preparados por solicitação do proprietário. Mantém Supabase/PostgreSQL e TypeScript/React/Next.js/Tailwind/Node.js; 11 lojas + DEFEITOS. O prompt anterior recebeu aviso de precedência para evitar instruções históricas conflitantes.

Main consultada: d730e9a, com devolução parcial/troca/vale-troca. O Claude deve conferir o estado atual, ler a PR mesmo sem integração, reproduzir os achados e implementar por prioridade. Commit 290f1111 apenas documental; não altera nem homologa funcionalidades.

---

## Issue #34 — [P2][REV-032] Idempotência aceita variante nula e omite condição/número de série

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/34
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base: [55d10af](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). [Código packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql:463](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql#L463).

Requisitos ORA-INV-002/003/005/006, CAT e QUAL. Revisão adicional dos limites da idempotência, complementar às correções já verificadas #20/#21.

Provas locais independentes:
1. Reservar acessório com uma chave e depois repetir a chave com p_variante=NULL devolve o mesmo ID, em vez de rejeitar o conteúdo incompleto. A comparação com <> resulta NULL e o IF não entra.
2. Registrar aparelho com condição novo e SERIE-1; repetir a chave com condição seminovo ou SERIE-2 também devolve sucesso. registrar_item_serializado não compara esses argumentos.

Três assertions falharam: erro esperado, mas nenhuma exceção foi emitida. Não foi criada reserva duplicada nem item órfão nesses casos; o defeito é aceitar como equivalente um payload diferente.

Corrigir por migration nova: validar argumentos obrigatórios antes de retornar repetição, usar comparação que trate NULL corretamente e cobrir os atributos relevantes do pedido normalizado. Preferir guardar o conteúdo/fingerprint original quando os dados do item forem mutáveis, para não comparar repetição com estado alterado depois.

Aceite: três casos recusados; payload idêntico retorna o mesmo ID; livro/itens/saldos inalterados no conflito; repetir concorrência. Manter os seis cenários antigos verdes.

Claude Code implementa e Codex revisa. Preservar TypeScript/Next.js/Node.js/PostgreSQL/Supabase. Evidências desta rodada serão adicionadas ao PR #33, fora da descoberta normal dos testes vermelhos.

---

## Issue #35 — [P2][REV-033] Validador de venda aceita dois chips com o mesmo ICCID

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/35
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base: [55d10af](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). [Código packages/dominio/src/venda.ts:46](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/packages/dominio/src/venda.ts#L46).

Requisitos ORA-CAT-005, INV-002, CONNECT-001 e POS. validarItem exige quantidade 1 para IMEI, mas a validação de chip apenas verifica o ICCID.

Prova independente: item tipo chip, quantidade 2, preço 1000 centavos e um único ICCID sintético válido retorna [] (sem erros). Esperado: rejeição, porque cada chip físico tem seu próprio identificador. A RPC de reserva já exige quantidade 1, criando divergência entre domínio e banco.

Corrigir o domínio TypeScript: item serializado por ICCID deve representar uma unidade; venda de múltiplos chips deve ter identidades distintas e validação de duplicidade no conjunto da venda. Não desativar a proteção do banco.

Aceite: chip q1 válido; q2/zero/fração inválidos; dois itens com ICCIDs diferentes; repetição de ICCID recusada no contrato da venda. O teste atual é de regra pura; não demonstra venda real duplicada no banco.

Claude Code implementa e Codex revisa. Preservar TypeScript/Next.js/Node.js/PostgreSQL/Supabase. Evidências desta rodada serão adicionadas ao PR #33, fora da descoberta normal dos testes vermelhos.

---

## Issue #36 — [P2][REV-034] Contrato da fila de aprovações não exclui pedido do próprio autor

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/36
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base: [55d10af](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). [Código apps/plataforma/src/demo/consultas.ts:124](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/apps/plataforma/src/demo/consultas.ts#L124).

Requisitos ORA-POS-006, FISC e QUAL; ADR-002: ninguém aprova a própria solicitação. aprovacoesVisiveis recebe pessoaId, mas filtra somente papel e loja. FilaDeAprovacoes também não bloqueia esse caso.

Prova local de contrato: usar uma solicitação fictícia existente com um contexto de gerente cujo pessoaId é o solicitante/vendedor dessa solicitação; ela continua aparecendo na própria fila (esperado false, recebido true).

Limite: os perfis fixos da demo não incluem necessariamente essa combinação; não foi demonstrada autoaprovação numa sessão real nem persistência de aprovação. A falha é no contrato compartilhado que promete a regra e pode ser reaproveitado no fluxo real.

Corrigir a demonstração e definir no modelo real solicitante_id separado do vendedor da venda; ocultar/bloquear ação própria na UX e rejeitar de forma autoritativa no banco, inclusive dono. Não confiar apenas no filtro.

Aceite: pedido próprio negado; pedido de terceiro no escopo permitido; fora do escopo negado; quem pediu nota/cancelamento pode ser diferente do vendedor da venda; rastreabilidade da decisão.

Claude Code implementa e Codex revisa. Preservar TypeScript/Next.js/Node.js/PostgreSQL/Supabase. Evidências desta rodada serão adicionadas ao PR #33, fora da descoberta normal dos testes vermelhos.

---

## Issue #37 — [P2][REV-035] Relatório de 30 dias compara contra apenas um dia

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/37
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base: [55d10af](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). [Código apps/plataforma/src/app/demo/relatorios/page.tsx:37](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/apps/plataforma/src/app/demo/relatorios/page.tsx#L37).

Requisitos ORA-REPORT-001/005 e qualidade dos indicadores. O histórico tem 30 dias anteriores. Para periodo=30, o atual usa 29 dias + hoje, mas o slice da comparação seleciona apenas o primeiro dia do histórico, mantendo o rótulo de período anterior de 30 dias.

Prova independente com receita diária constante de 1000 centavos: períodos de 7 e 14 dias dão variação 0; período de 30 dias dá fracao=29 (+2900%), apesar de os valores diários serem constantes.

Corrigir o contrato do histórico e o cálculo: obter dias suficientes para os dois períodos completos ou omitir/identificar comparação indisponível quando faltar histórico. Não comparar totais de durações diferentes nem preencher dias desconhecidos como zero. Aplicar a ranking, ticket, margem e CSV/labels conforme o indicador.

Aceite: 7/14/30 dias completos; histórico insuficiente; virada de mês; dia corrente parcial identificado; série constante sem crescimento artificial. Demonstração, sem afirmar divergência financeira real.

Claude Code implementa e Codex revisa. Preservar TypeScript/Next.js/Node.js/PostgreSQL/Supabase. Evidências desta rodada serão adicionadas ao PR #33, fora da descoberta normal dos testes vermelhos.

---

## Issue #38 — [P2][REV-036] Exportador CSV não neutraliza fórmulas em campos textuais

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/38
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base: [55d10af](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). [Código apps/plataforma/src/componentes/ExportarCsv.tsx:10](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/apps/plataforma/src/componentes/ExportarCsv.tsx#L10).

Requisitos ORA-FIN-009 e QUAL. O exportador escapa aspas, ponto e vírgula e quebras de linha, mas texto iniciado por =, +, - ou @ pode ser interpretado como fórmula ao abrir em Excel/planilha.

Prova local com payloads inofensivos: um nome =1+1 é gravado literalmente em uma nova linha CSV; o teste falha porque a célula não foi neutralizada. Nenhuma fórmula foi executada e nenhum arquivo foi enviado a terceiros.

Limite: as telas atuais usam fixtures; não foi demonstrada exploração com registro pessoal real. O componente já é compartilhado por nomes de cliente/produto/usuário e precisa estar seguro antes da ligação a dados editáveis/importados.

Corrigir a serialização de campos textuais conforme proteção de CSV formula injection; simples envolvimento em aspas não basta. Preservar valores numéricos legítimos e definir contrato de tipo/coluna quando necessário. Cobrir prefixos de controle, aspas, delimitadores e novas linhas sem corromper as colunas.

Aceite: entradas perigosas ficam texto; valores/negativos numéricos mantêm representação; cabeçalhos, BOM, filtros e restrição de custo do vendedor continuam corretos. Referência: https://owasp.org/www-community/attacks/CSV_Injection

Claude Code implementa e Codex revisa. Preservar TypeScript/Next.js/Node.js/PostgreSQL/Supabase. Evidências desta rodada serão adicionadas ao PR #33, fora da descoberta normal dos testes vermelhos.

---

## Issue #39 — [P2][REV-037] Ativação da demonstração permite carteira SALDO negativa

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/39
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base: [55d10af](https://github.com/oraconect5g-boop/sistema-ora5g/commit/55d10afec95a6a556546b2b2e1f439302a86bfff). [Código apps/plataforma/src/app/demo/connect/_abas/AtivarChip.tsx:83](https://github.com/oraconect5g-boop/sistema-ora5g/blob/55d10afec95a6a556546b2b2e1f439302a86bfff/apps/plataforma/src/app/demo/connect/_abas/AtivarChip.tsx#L83).

Requisitos ORA-CONNECT-002/004/005/009 e PAY. solicitar subtrai o custo ilustrativo sem verificar saldo; o botão Conferir e ativar também fica habilitado sem fundos. A recarga já possui uma guarda de saldo, então os fluxos são inconsistentes.

Prova Playwright local em celular e computador: partindo da carteira fictícia de R$1850, 34 ativações eSIM do plano de R$69,90, com débito ilustrativo R$55,92 cada, deixam saldo em -R$51,28 e permitem solicitar outra ativação. As execuções falharam nas assertions de bloqueio/ausência de saldo negativo.

Corrigir a simulação para não autorizar débito maior que o saldo e revalidar ao confirmar. No fluxo real, usar custo/carteira/estado oficiais e resultado desconhecido com reconsulta; não transportar a taxa fictícia de 80% como contrato nem confiar só no botão desabilitado.

Aceite: saldo menor/igual/maior que custo; zero; cliques repetidos; SALDO recusado preserva carteira; LINK não debita carteira; confirmação fica separada de sucesso telecom. Nenhuma ativação ou cobrança real foi feita.

Claude Code implementa e Codex revisa. Preservar TypeScript/Next.js/Node.js/PostgreSQL/Supabase. Evidências desta rodada serão adicionadas ao PR #33, fora da descoberta normal dos testes vermelhos.

---

## Issue #40 — [P2][REV-038] Busca do catálogo não encontra produtos após os primeiros 200

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/40
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: [aebbdcc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/aebbdcc82b3f5de800d41200674fd6910a23c855). [Código apps/plataforma/src/app/catalogo/page.tsx:34](https://github.com/oraconect5g-boop/sistema-ora5g/blob/aebbdcc82b3f5de800d41200674fd6910a23c855/apps/plataforma/src/app/catalogo/page.tsx#L34).

Requisitos ORA-CAT-001/006/011. O servidor limita produtos a 200 antes de aplicar a busca por nome/SKU em memória. A mensagem pede para usar a busca, mas ela não consegue alcançar produtos excluídos pelo limite.

Prova local com a função real da página e API simulada com 201 produtos: procurar o último por nome ou SKU mostra Nada encontrado. Um produto dentro das primeiras 200 linhas é encontrado. Duas assertions falharam e o controle positivo passou.

Aplicar busca autorizada no banco antes do limite, incluindo associação de SKU/variante, ou usar paginação completa adequada. A consulta de variantes/fotos/saldos também precisa de cobertura e paginação explícitas; ausência de linha por truncamento não pode virar estoque zero.

Aceite: catálogo com mais de 200 produtos e mais de 1000 variantes; busca por nome e SKU fora da primeira página; filtro de pendências; loja/organização autorizadas; paginação estável e indicação de resultados. Não trazer toda a base ilimitadamente para compensar.

Claude Code implementa; Codex revisa. Linguagens e stack preservadas. Evidências serão preservadas no PR #33 em docs/analises/evidencias/2026-11-08-fotos/.

---

## Issue #41 — [P2][REV-039] Foto não se recupera após erro mesmo recebendo URL nova

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/41
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: [aebbdcc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/aebbdcc82b3f5de800d41200674fd6910a23c855). [Código apps/plataforma/src/app/catalogo/FotoAmpliavel.tsx:11](https://github.com/oraconect5g-boop/sistema-ora5g/blob/aebbdcc82b3f5de800d41200674fd6910a23c855/apps/plataforma/src/app/catalogo/FotoAmpliavel.tsx#L11).

Requisito ORA-CAT-011 e recuperação de falhas. O estado quebrada fica true após onError e nunca é atualizado quando url muda. Uma renovação de URL assinada ou foto substituta continua mostrando placeholder no mesmo componente.

Prova Playwright com componente real em fixture local: URL inválida gera foto indisponível; alterar a prop para uma imagem válida mantém o botão Ampliar ausente. Reproduzido em 360 e 1280 px, sem erros JS. Imagem válida inicial amplia corretamente (controle positivo).

Vincular o erro à URL que falhou e permitir nova tentativa quando a URL mudar, ou reinicializar o estado de forma segura. Considerar atualização por router.refresh, que preserva estado de componentes. Não é necessário recarregar toda a aplicação.

Aceite: URL inválida → válida, expirada → renovada, foto substituída, nova falha e abertura/fechamento do modal. Fixture não usou Storage/credenciais reais.

Claude Code implementa; Codex revisa. Linguagens e stack preservadas. Evidências serão preservadas no PR #33 em docs/analises/evidencias/2026-11-08-fotos/.

---

## Issue #42 — [P2][REV-040] Retry de foto duplica upload e registro não é idempotente

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/42
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: [aebbdcc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/aebbdcc82b3f5de800d41200674fd6910a23c855). [Código apps/plataforma/src/app/catalogo/EnviarFoto.tsx:53](https://github.com/oraconect5g-boop/sistema-ora5g/blob/aebbdcc82b3f5de800d41200674fd6910a23c855/apps/plataforma/src/app/catalogo/EnviarFoto.tsx#L53).

Requisito ORA-CAT-011, idempotência/recuperação. Cada clique em Usar esta foto gera UUID novo e faz upload, mesmo quando o upload anterior foi confirmado e somente o registro falhou. Não há compensação/limpeza de órfão no fluxo. No banco, registrar_foto repetido com o mesmo caminho já registrado lança 23505, em vez de reconhecer a operação anterior.

Provas independentes:
- Componentes reais + serviços simulados: upload confirmado, registro falha; repetir registra dois uploads com caminhos diferentes para a mesma prévia. Esperado um. Reproduzido nos dois viewports.
- PGlite com nove migrations: arquivo fictício enviado e foto registrada; repetir a mesma RPC/caminho dá unique_violation 23505. Não foi acessado Storage real.

Manter identidade/caminho estáveis por prévia e fase de operação. Repetir registro sem novo upload; reconhecer confirmação anterior por consulta/idempotência. Para falha/timeout ambíguos, reconsultar antes de criar outro objeto. Definir limpeza segura de arquivos realmente órfãos, preservando imagens em uso e histórico.

Aceite: erro depois do upload, resposta do registro perdida, retry idêntico e conflitante, cliques rápidos, falha de rede e troca legítima. Um efeito lógico gera um objeto/registro conforme contrato e a foto anterior permanece utilizável até confirmação. Nova migration se mudar a RPC; não reescrever a aplicada.

Claude Code implementa; Codex revisa. Linguagens e stack preservadas. Evidências serão preservadas no PR #33 em docs/analises/evidencias/2026-11-08-fotos/.

---

## Issue #43 — [P2][REV-041] Descartar prévia não limpa seleção do arquivo

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/43
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: [aebbdcc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/aebbdcc82b3f5de800d41200674fd6910a23c855). [Código apps/plataforma/src/app/catalogo/EnviarFoto.tsx:88](https://github.com/oraconect5g-boop/sistema-ora5g/blob/aebbdcc82b3f5de800d41200674fd6910a23c855/apps/plataforma/src/app/catalogo/EnviarFoto.tsx#L88).

Requisito ORA-CAT-011, UX móvel. Descartar limpa o estado da prévia, mas não entrada.current.value; o input continua contendo o arquivo selecionado. Seleção nativa do mesmo arquivo pode não disparar change, prejudicando a tentativa de selecionar a mesma foto novamente.

Prova no componente real em Chromium, 360 e 1280: escolher PNG válido, ver prévia e descartar; input.value continua C:\\fakepath\\foto.png, em vez de vazio. Controles de imagem/tipo/upload válidos passaram. O teste prova estado nativo retido; não afirma teste de todos os seletores de câmera Android/iOS.

Limpar o input no momento apropriado após ler o File e/ou ao descartar/concluir, sem perder o Blob necessário ao envio. Conservar revogação de URL da prévia e liberar recursos ao sair.

Aceite: selecionar → descartar → selecionar o mesmo arquivo; selecionar outro; envio concluído; falha com nova tentativa; entrada cancelada; validar também em câmera/galeria móvel na homologação.

Claude Code implementa; Codex revisa. Linguagens e stack preservadas. Evidências serão preservadas no PR #33 em docs/analises/evidencias/2026-11-08-fotos/.

---

## Issue #44 — [P2][REV-042] Dependência de desenvolvimento minimatch mantém aviso de DoS

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/44
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: [aebbdcc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/aebbdcc82b3f5de800d41200674fd6910a23c855). [Código package-lock.json:1](https://github.com/oraconect5g-boop/sistema-ora5g/blob/aebbdcc82b3f5de800d41200674fd6910a23c855/package-lock.json#L1).

Requisitos ORA-QUAL-004/012. npm audit completo encontra oito alertas moderados na árvore de desenvolvimento, originados de um advisory de minimatch propagado pela cadeia TypeScript-ESLint/eslint-config-next. Não são oito falhas independentes da aplicação.

Versão afetada na cadeia: minimatch 10.2.6, advisory GHSA-g3hv-75wg-m249 (globparts amplification, >=7 <11.0.1). npm audit --omit=dev no CI retorna zero vulnerabilidades. Não foi demonstrada exploração de produção.

A sugestão automática de fix propõe eslint-config-next 15.5.29 com isSemVerMajor=true, em uma aplicação Next 16.4.5. Não executar npm audit fix --force nem aplicar downgrade para silenciar o relatório. Avaliar correção upstream/atualização transitiva compatível em branch, conferir Node/TypeScript/ESLint e rodar CI completo. Overrides só com análise de compatibilidade e lockfile consistente.

Aceite: análise rastreável do advisory e da cadeia; correção compatível ou exceção temporária documentada com revisão; preservar stack e não confundir pacote de desenvolvimento com dependência de produção.

Fonte: https://github.com/advisories/GHSA-g3hv-75wg-m249

Claude Code implementa; Codex revisa. Linguagens e stack preservadas. Evidências serão preservadas no PR #33 em docs/analises/evidencias/2026-11-08-fotos/.

---

## Issue #45 — [REV-043][P1] Aprovações próprias continuam legíveis após bloqueio ou revogação de sessão

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/45
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Revisão independente da main `371cef0c02affad30f6fe2ebd1468cbcec67009f`, ADR-004. Bloqueante de autorização para o piloto (ORA-ORG-006; ORA-POS-006).

A policy `aprovacoes_ler`, na migration `20261108233546_vendas_pagamentos_e_caixa.sql:279`, permite `solicitado_por = auth.uid()` sem exigir vínculo vigente, perfil ativo ou sessão Auth válida. Esse ramo ignora as guardas usadas nas vendas e caixas. A proteção de `/aprovacoes` não protege o SELECT direto da API.

Reprodução local, com todas as migrations e identidades fictícias: criar pedido como vendedor ativo; bloquear pela RPC oficial ou excluir a sessão Auth simulada; repetir SELECT sob o JWT antigo, papel `authenticated`, sem recriar sessão. Nos **dois casos ainda retorna uma linha**, quando deveria retornar zero. Nenhum usuário real ou banco remoto foi alterado.

Correção solicitada ao Claude: exigir autorização vigente também para o solicitante, respeitando organização, unidade, turno e sessão; preservar a leitura legítima pelo gerente/dono. Acrescentar regressões para bloqueio, revogação e término de vínculo, com controle positivo antes do bloqueio. Não basta ocultar a tela.

Evidência reproduzível será incluída na PR #33, `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`. Não aplicar migrations retroativamente; adicionar correção incremental. Manter TypeScript/PostgreSQL/Supabase.

---

## Issue #46 — [REV-044][P1] Entrada Pix/cartão de PayJoy/Aiva conclui venda sem comprovante

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/46
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base revisada: `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Bloqueante de confirmação de pagamento no piloto (ORA-POS-007; ADR-004 §5).

Em `packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql:913–927`, a exigência de comprovante considera só `pagamento.meio`. Quando esse campo é `payjoy`/`aiva`, a entrada pode usar Pix ou cartão sem passar pela mesma validação. A venda e o recebimento são confirmados sem código, embora a tela e o ADR exijam confirmação manual documentada para esses meios.

Prova local: aparelho de 149900 centavos; PayJoy com e-mail fictício, entrada 20000, `meio_entrada` igual a `pix_direto`, `pix_picpay`, `cartao_picpay` ou `cartao_pagseguro`, sem comprovante. **Os quatro casos concluíram sem erro**; deveriam rejeitar com OR009. Controle com comprovante válido passou. Sem API de pagamento, credencial ou dados reais.

Correção: validar o meio efetivo da entrada e seu comprovante no banco, além do pagamento principal; falha deve preservar venda aberta, reserva, caixa e contas a receber. Cobrir PayJoy e Aiva e os quatro meios, com controle de entrada em dinheiro. Não inventar integração automática com as maquininhas.

Reprodução na PR #33: `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`. Correção por migration incremental; preservar a stack.

---

## Issue #47 — [REV-045][P1] Estorno de entrada financiada deixa caixa da gerência negativo

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/47
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Bloqueante financeiro (ORA-POS-010; ORA-PAY-004/005).

Em `packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql:1056–1062`, o ramo PayJoy/Aiva devolve a entrada sem conferir dinheiro disponível. A guarda de saldo só existe no ramo de pagamento direto, linha 1070.

Reprodução local: venda Aiva de R$ 1.499,00, entrada de R$ 200,00 em dinheiro; dono abre outro caixa com fundo zero e cancela a venda. A RPC aceita, lança -20000 centavos e deixa o caixa do dono em **-R$ 200,00**. O dinheiro original permanece no caixa do vendedor. Nenhuma operação real foi realizada.

Correção: validar e travar saldo do caixa para toda saída efetiva em dinheiro, inclusive entrada financiada; insuficiência deve reverter atomicamente cancelamento, estoque, pagamentos e contas a receber. Exigir suprimento/transferência de dinheiro auditável quando necessário. Cobrir PayJoy/Aiva e múltiplas linhas com concorrência.

Prova: PR #33, `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`. Corrigir por migration incremental e preservar stack.

---

## Issue #48 — [REV-046][P1] Banco aceita financiamento acima do preço e diverge da regra de domínio

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/48
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Bloqueante de dinheiro (ORA-POS-007/013; ORA-PAY-002; DEC-U38).

A conclusão, em `packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql:923–943`, soma a entrada financiada ao dinheiro disponível para troco. O domínio `packages/dominio/src/pagamento.ts` não permite usar entrada de financiamento para justificar financiamento excessivo, e o ADR-004 §2 declara que as regras são iguais.

Prova: total 149900; única linha Aiva com `valor=150000`, `entrada=20000`, `meio_entrada=dinheiro`. Domínio: `valido=false`; banco: conclui, dá 100 de troco e registra 130000 a receber, em vez dos 129900 relativos ao preço menos entrada. Os juros não explicam a diferença: a regra explícita exclui juros da financeira.

Correção: alinhar contrato e regra do banco/domínio à DEC-U38, sem transformar excesso de crédito em dinheiro ao cliente. Definir uma única interpretação para valor total, entrada e saldo a receber, inclusive pagamentos mistos. Cobrir excesso, igualdade, insuficiência e entrada por diferentes meios.

Teste local descartável na PR #33, `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`; sem contratos externos ou dados reais. Não trocar linguagem nem editar migration aplicada.

---

## Issue #49 — [REV-047][P1] Cancelamento devolve entrada integral mesmo quando parte já saiu como troco

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/49
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Bloqueante de estorno e dinheiro (ORA-POS-010; ORA-PAY-002).

`cancelar_venda`, migration `20261108233546_vendas_pagamentos_e_caixa.sql:1053–1062`, devolve integralmente `entrada_centavos` no ramo de financeira. O troco já entregue só é abatido no ramo seguinte de pagamento direto. Isso permite devolver mais dinheiro do que a loja reteve.

Reprodução local: aparelho 149900; Aiva 150000 com entrada 20000 em dinheiro. Conclusão entrega 100 de troco, retendo **19900**. No cancelamento por gerência com fundo suficiente, devolve **20000**. Diferença indevida: 100 centavos. Este caso depende do financiamento excedente aceito em REV-046; a conta de estorno também precisa ser corrigida para preservar a identidade financeira, além de barrar a entrada inválida.

Correção: estornar os recebimentos efetivamente retidos, com alocação explícita do troco, soma dos estornos limitada ao recebido líquido e idempotência. Usar lançamentos compensatórios, sem apagar o histórico; cobrir várias linhas, financeira + dinheiro e reenvio.

Prova na PR #33, `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`. Somente banco local fictício; manter stack e migrations históricas.

---

## Issue #50 — [REV-048][P1] Cancelamento marca Pix/cartão como estornado antes da devolução externa

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/50
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Bloqueante de estado financeiro (ORA-POS-010; ORA-PAY-003/007).

`cancelar_venda` grava movimento negativo e define todos os pagamentos como `situacao='estornado', estornado_em=now()` na migration `20261108233546_vendas_pagamentos_e_caixa.sql:1073–1079`. Para Pix/cartão não existe confirmação, comprovante de devolução ou chamada ao provedor. A UI `apps/plataforma/src/app/vendas/[id]/page.tsx:90` e o ADR-004 dizem que ficam **para estornar** na maquininha/banco; o estado persistido afirma que o estorno já ocorreu.

Prova local: concluir separadamente venda por Pix e cartão PicPay com comprovante fictício da venda; cancelar pela gerência. Nos dois casos, pagamento imediatamente `estornado` com timestamp, sem qualquer evidência da devolução. Não houve contato com banco ou maquininha.

Correção: separar solicitação de estorno, pendência e confirmação externa/manual auditada. Só marcar concluído e liquidar o lançamento correspondente após evidência confiável; refletir pendências nas telas e conciliação. Não presumir API PicPay POS e não usar comprovante original da venda como prova da devolução.

Reprodução na PR #33, `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`. Preservar linguagem e adicionar migration incremental.

---

## Issue #51 — [REV-049][P1] Cancelar venda devolve aparelho/chip ao estoque sem conferência física

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/51
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Bloqueante de integridade operacional (ORA-POS-010; ORA-INV-003; ORA-CONNECT-001).

Na migration `20261108233546_vendas_pagamentos_e_caixa.sql:1047–1052`, cancelar venda concluída executa `devolucao` para todo aparelho, chip e acessório. A tela pede apenas motivo; não confirma recebimento, identidade ou condição física. O item serializado passa a `disponivel`, `em_estoque=true`.

Reprodução local em duas vendas fictícias: uma de aparelho, outra de chip; cancelar somente a operação comercial sem informar recebimento físico. Ambos passam a disponíveis. Não houve ativação Nogle no teste: o defeito demonstrado é não distinguir retorno físico e cancelamento, e não existir guarda que impeça recolocar um chip usado como vendável.

Diverge do adendo de revisão já registrado em `docs/alinhamento/ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md:47` e `NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md:140`: cancelamento comercial, retorno físico e confirmação telecom são fatos distintos; chip usado não volta ao estoque virgem. ADR-004 precisa ser alinhado à prioridade dessas decisões, sem adotar retorno automático como política silenciosa.

Correção: registrar recebimento físico, IMEI/ICCID, condição, responsável e destino aprovado antes de liberar venda; distinguir estorno, devolução e telecom. Cancelamento sozinho não cria estoque. Regressões para não devolvido, devolvido íntegro, avariado e chip já ativado; provedor somente por contrato documentado.

Prova na PR #33, `docs/analises/evidencias/2026-11-08-vendas/banco.repro.ts`. Implementação maior volta ao Claude; preservar stack.

---

## Issue #52 — [REV-050][P2] Valor inválido vira zero nas ações de abertura de caixa e desconto

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/52
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f`. Validação monetária real (ORA-PAY-004; ORA-POS-005/006).

Em `apps/plataforma/src/app/vender/acoes.ts:26` e `:64`, `lerValor(...) ?? 0` trata tanto campo vazio quanto texto inválido como zero. A função de leitura distingue corretamente inválido com null; a ação descarta essa distinção.

Testes importando as ações reais, com somente sessão/RPC/redirect simulados: `fundo='abc'` e `fundo='-1'` chamam `abrir_caixa` com zero e redirecionam como sucesso. `desconto='abc'` chama `aplicar_desconto` com zero, podendo apagar desconto existente e invalidar aprovação sem avisar erro de entrada. Controle com fundo `12,34` envia corretamente 1234.

Correção pequena solicitada ao Claude: distinguir vazio intencional de conteúdo inválido; rejeitar formato/negativo antes da RPC e preservar valor anterior. Validar novamente no banco. Aceite: inválido não chama RPC nem altera dados; zero e vazio seguem política explícita; mensagem segura no formulário. Não mudar stack.

Reprodução: PR #33, `docs/analises/evidencias/2026-11-08-vendas/acoes.repro.ts`. Sem acesso a `.env`, servidor ou dados reais.

---

## Issue #53 — [REV-051][P2] Editar desconto enquanto a gerência aprova provoca deadlock

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/53
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `371cef0c02affad30f6fe2ebd1468cbcec67009f` (ORA-POS-006; ADR-004 ordem das travas).

As RPCs usam ordem inversa: `aplicar_desconto` bloqueia venda em `privado.minha_venda_aberta` e depois atualiza aprovação (migration `20261108233546_vendas_pagamentos_e_caixa.sql:692–702`); `decidir_aprovacao` bloqueia aprovação antes de atualizar a venda (`:765–788`). Editar e decidir ao mesmo tempo pode formar ciclo.

Prova determinística em PostgreSQL 17 local, duas conexões reais e dados fictícios: preparação de locks reproduz pausas após o primeiro FOR UPDATE de cada RPC; A segura venda, B segura aprovação. As RPCs reais são chamadas como vendedor/dono autenticados, sem modificar corpos. `pg_stat_activity` confirmou espera por Lock de A; B prosseguiu e o resultado foi **[40P01, null]**. O PostgreSQL abortou a edição por deadlock e a outra ação terminou. Não demonstrou corrupção ou perda de estoque; demonstra falha de disponibilidade em operação legítima.

Correção: padronizar ordem venda → item/aprovação em todas as ações (inclusive remover item, pedir/invalidar/decidir e concluir/cancelar), reler estado sob lock e preservar atomicidade. Acrescentar regressão com duas conexões e resultado coerente quando o conteúdo muda. Retry pode ser defesa adicional, não substitui corrigir a inversão.

Reprodução na PR #33, `docs/analises/evidencias/2026-11-08-vendas/concorrencia.repro.ts`. Servidor local descartado ao final; sem servidor da empresa, Supabase real ou mudança de linguagem.

---

## Issue #54 — [P0][ORA-CONNECT] Integrar operações, cobranças e repasses oficiais pela API Nogle/Contel

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/54
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Prioridade do proprietário reafirmada em 09/11/2026: toda a Ora Connect deve registrar e reconciliar operações, cobranças/gateway e repasses pelo sistema externo oficial Nogle/Contel, mantendo loja/vendedor e evitando duplicidade. Rede atual confirmada: 11 lojas comerciais e local de exceção DEFEITOS. Preservar stack existente.

**Estado mais recente auditado: main 9b1109e.** Agora existem cliente HTTP no worker, outbox/estados, referências oficiais, rota /connect e três operações (ativação, recarga e portabilidade). A observação anterior de módulos ausentes correspondia ao corte 371cef0; foi superada pela entrega. Não houve homologação real com a Contel pelo Codex.

Bloqueantes novos reproduzidos com dados fictícios: #55 segredos Nogle chegam ao web pelo filtro antigo de publicação; #56 custo da carteira visível ao vendedor; #57 LINK aceita serviço já pago; #58 idempotência ignora dados do cliente; #59 uma evidência de recarga confirma duas operações quando datas coincidem. Corrigir antes de habilitar operação real.

Continua faltando o escopo financeiro completo: consulta/estado da cobrança e pagamento, carteira/extrato/repasse, recorrência por competência, compra/entrega/transferência oficial e demais funções da coleção conforme contrato. Não encerrar esta issue só por existir transporte, três operações ou CI verde.

Fonte oficial reconferida em 09/11: https://docs.nogle.tech/ ; coleção idêntica à versionada, 62 funções em16 grupos, SHA256 002d13dab3099a95c1e018bdc9d0d63dba30adcacfa141efccdd062f29c88ead. Não há contrato público explícito de liquidação de repasse, webhook, idempotência, sandbox ou unicidade de data_cadastro. Obter respostas do responsável e implementar sem inventar endpoints, taxas, prazo ou confirmação.

Aceite: correções #55–#59; configuração validada e segredos só no worker; intenções e tentativas duráveis; estados separados de operação, cobrança, pagamento e repasse; IDs oficiais/correlação única; LINK/SALDO coerentes com recebimento no caixa; recuperação após timeout e falha local sem reenvio cego; reconciliação de produção/repasse por loja/vendedor; testes de contrato e concorrência; homologação autorizada com conta/linha/ICCID de teste e evidência do provedor.

Questionário completo, análise do lote e matriz das62 funções serão publicados na PR #33. Nenhuma chave deve ser enviada por chat/GitHub. Nenhuma cobrança/ativação real foi feita pela revisão. A migração para11lojas não deve alterar dados históricos silenciosamente.

---

## Issue #55 — [REV-052][P1] Publicação entrega NOGLE_ACCESS_KEY e NOGLE_SECONDARY_KEY ao processo web

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/55
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base nova `9b1109e49d9304651d20224563f8e5bdaf950894` (ADR-005; ORA-ORG-006; ORA-CONNECT-010).

O adaptador novo diz que as credenciais Nogle ficam somente no worker, mas `deploy/homologacao/publicar.sh:52` continua usando o filtro anterior que remove apenas SUPABASE_SECRET_KEY e DATABASE_URL da cópia web. As novas NOGLE_ACCESS_KEY/NOGLE_SECONDARY_KEY atravessam esse filtro e chegam a `apps/plataforma/.env.local`, duplicando segredos no processo que atende usuários. Não foram encontradas variáveis NEXT_PUBLIC para essas chaves; **não se afirma exposição direta ao navegador**. O defeito comprovado é quebra da separação web/worker.

Prova local: executar somente a linha real do filtro sobre arquivo temporário de valores fictícios; as duas chaves antigas são removidas, as duas Nogle permanecem. Sem servidor/.env real. Este é um caso concreto de feature integrada sem atualizar o caminho anterior de publicação; não é atribuído a resolução textual incorreta do merge.

Correção: entregar ao web somente configuração necessária por allowlist/contrato explícito, incluindo exclusão de todos os segredos Nogle; manter worker completo. Testar publicação/republicação/rollback e identidade código+configuração, sem publicar valores.

Fonte reproduzível será incluída na PR #33: docs/analises/evidencias/2026-11-09-nogle-9b1109/publicacao.repro.ts. Preservar stack.

---

## Issue #56 — [REV-053][P1] Vendedor sem custo.ver lê débito da carteira Nogle e infere margem

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/56
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `9b1109e49d9304651d20224563f8e5bdaf950894` (ADR-002/003; ORA-ORG-004; ORA-CONNECT-009).

A tabela public.connect_operacoes contém valor_debitado_centavos (custo da operação pago pela carteira). A migration `20261109123402_ora_connect_operacoes.sql:245–265` concede SELECT de todas as colunas ao vendedor nas próprias operações. `/connect/page.tsx:54` busca esse valor e `:199` o exibe sem guarda de custo.ver, ao lado do recebido na loja. Evento/evidência também devem ser revisados para não expor o mesmo custo por outro campo.

Reprodução local: vendedor com custo.ver=false; recarga SALDO paga no caixa de R$44,90; worker fictício confirma débito de R$35,92. SELECT autenticado do vendedor devolve esse custo (uma linha, sem erro), permitindo deduzir a margem. Sem chamada real à Contel ou dados de clientes.

Correção: separar custo em estrutura/DTO autorizado como já feito para custos do PDV; proteger banco/API e tela. Gerência com permissão pode consultar; vendedor vê só dados operacionais permitidos. Cobrir SELECT direto, eventos/evidência e renderização.

Prova na PR #33, docs/analises/evidencias/2026-11-09-nogle-9b1109/banco.repro.ts. Não basta esconder a linha na UI.

---

## Issue #57 — [REV-054][P1] LINK aceita serviço já pago no caixa e permite segunda cobrança ao cliente

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/57
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `9b1109e49d9304651d20224563f8e5bdaf950894` (ADR-005; ORA-CONNECT-003; ORA-POS-007).

`public.connect_registrar` valida venda_item quando informado, mas não restringe o vínculo ao método SALDO (`20261109123402_ora_connect_operacoes.sql:414–437`). O formulário mostra o seletor de serviço pago inclusive com LINK. O pedido ao provedor é montado com metodo_pagamento=LINK mesmo quando recebido_na_loja já foi registrado. O ADR-005 define LINK como cliente pagando direto à Contel e SALDO como serviço pago no caixa.

Prova local: concluir serviço de recarga por R$44,90 em dinheiro; informar esse venda_item numa recarga LINK. RPC aceita sem erro e cria operação que solicitará cobrança por link. **Não houve cobrança externa no teste**; o defeito é permitir esse pedido incoerente, com risco de pagar no caixa e no link pelo mesmo serviço.

Correção: impor contrato exclusivo ou fluxo de compensação explícito no banco; impedir LINK para serviço já recebido, salvo regra aprovada e auditável que elimine duplicação. Alinhar seletor e validação da ação, mantendo banco autoritativo. Regressão LINK sem recebimento e SALDO vinculado ao serviço legítimo.

Prova na PR #33: docs/analises/evidencias/2026-11-09-nogle-9b1109/banco.repro.ts. Manter a stack e usar migration incremental.

---

## Issue #58 — [REV-055][P1] Idempotência da ativação ignora mudança dos dados do cliente

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/58
Estado na coleta: open. Corpo integral com supressões de dados potencialmente sensíveis.

Base `9b1109e49d9304651d20224563f8e5bdaf950894` (ORA-CONNECT-001/010; ADR-005).

Em `20261109123402_ora_connect_operacoes.sql:399`, o conteúdo da operação usa md5 de `p_pedido - 'cliente'`. Assim a mesma chave pode ser reenviada com outro nome/CPF/endereço, e a RPC devolve silenciosamente a operação e o payload privado do primeiro cliente. A proteção 'mesma chave + outro conteúdo = OR004' não vale para o titular da ativação.

Prova local com eSIM/cliente fictício: registrar ativação; repetir mesma chave/mesmo plano e trocar o nome do cliente. Resultado sem erro, embora o contrato de retry devesse rejeitar a divergência. Não houve envio à Contel.

Correção: vincular a chave também ao conteúdo relevante do cliente, sem guardar PII bruta no resumo público; usar digest/HMAC adequado com regra de retenção e normalização. Divergência deve retornar OR004, preservando payload original; repetição idêntica deve ser estável mesmo depois de apagar dados temporários.

Prova na PR #33: docs/analises/evidencias/2026-11-09-nogle-9b1109/banco.repro.ts. Cobrir troca de CPF/CNPJ, endereço e nome; preservar privacidade e stack.

---

