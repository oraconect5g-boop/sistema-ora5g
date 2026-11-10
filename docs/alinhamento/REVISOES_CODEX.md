# Revisões do Codex — análise de sistemas e alinhamento

**Data:** 07/11/2026 · **Bases:** revisão inicial 17524a5; complementar a152516d.
**Papéis:** Claude Code implementa; Codex analisa e revisa; proprietário decide e homologa.
**Stack preservada:** TypeScript + React/Next.js + Node.js + SQL PostgreSQL/Supabase.

[Análise completa do Codex](../analises/ANALISE_SISTEMAS_2026-11-07.md), incluindo escopo integral, fases, acertos, evidências e limites. Ler também ANALISE_DO_PLANO.md e RASTREABILIDADE.md. A seção 15 da análise do Codex contém a evolução mais recente.

## Parecer

O escopo geral e a stack seguem o projeto. A ordem de concluir acesso, aceitar ADR-003 e depois entregar catálogo/importação/estoque é coerente. Antes do aceite de uma entrega operacional, corrigir os achados bloqueantes de permissão, segurança e dinheiro. Esse parecer não aprova produção, não marca os 172 requisitos como entregues e não muda a linguagem.

Há login parcial e uma demonstração identificada, não um ERP operacional pronto. As regras compartilhadas são um avanço, mas os casos de borda monetários abaixo precisam ser corrigidos. Os pontos de operação descritos são riscos de código; a VPS não foi acessada.

## Achados para implementação pelo Claude

As linhas referem-se ao commit da coluna Base. Bloqueante significa correção necessária para aceitar o fluxo afetado, não proibição de trabalhos independentes. Sugestões de expansão não bloqueiam o piloto atual de uma organização.

| ID / acompanhamento | Requisito / decisão | Base e arquivo:linha | Gravidade | O que está errado | Correção e aceite |
|---|---|---|---|---|---|
| REV-001 / [#2](https://github.com/oraconect5g-boop/sistema-ora5g/issues/2) | ORA-ORG-004; QUAL-002; ADR-002 | 17524a5; packages/banco/supabase/migrations/20261107120000_fundacao_acesso.sql:449 | Bloqueante — permissão | Gestor de A lê perfis exclusivos de B e perfis sem vínculo | Nova migration com escopo organizacional do alvo e regressões positivas/negativas |
| REV-002 / [#3](https://github.com/oraconect5g-boop/sistema-ora5g/issues/3) | ORA-ORG-004/005; QUAL-002/003 | 17524a5; mesma migration:475 | Bloqueante — permissão | Auditoria sem unidade é visível fora da organização do evento | Registrar/validar propriedade do evento sem perder imutabilidade; negar leitura cruzada |
| REV-003 / [#4](https://github.com/oraconect5g-boop/sistema-ora5g/issues/4) | ORA-003; QUAL-004 | a152516d; .github/workflows/ci.yml:38 | Bloqueante — segurança | Histórico de segredos não é examinado no push da main | Cobrir commits de push e PR, inclusive segredo adicionado e removido; não imprimir valores |
| REV-004 / [#5](https://github.com/oraconect5g-boop/sistema-ora5g/issues/5) | ORA-003/006; QUAL-004 | 17524a5; packages/config/src/ambiente.ts:27; a152516d; apps/plataforma/src/lib/supabase/configuracao.ts:2 | Bloqueante — segurança | Validador público não barra credencial privilegiada legada; helper do login não aplica a validação do grupo | Validar URL/chave efetivamente usadas pelo login; impedir credencial privilegiada no campo público |
| REV-005 / [#6](https://github.com/oraconect5g-boop/sistema-ora5g/issues/6) | ORA-ORG-002/005 | 17524a5; migration fundacao_acesso:214 | Importante | Papel inativo impede encerrar vínculo existente | Permitir encerramento sem permitir novo vínculo/reabertura indevida; testar reativação |
| REV-006 / [#7](https://github.com/oraconect5g-boop/sistema-ora5g/issues/7) | ORA-ORG-010; ADR-002 §2.1 | 17524a5; migration fundacao_acesso:145 | Sugestão de expansão | Mesmo usuário não pode ser dono em duas organizações | Incluir organização no índice de unicidade; manter proteção contra duplicatas locais |
| REV-007 / [#9](https://github.com/oraconect5g-boop/sistema-ora5g/issues/9) | ORA-POS-005/007; PAY-002 | a152516d; packages/dominio/src/dinheiro.ts:17 | Bloqueante — dinheiro | 1.000 e 1.000.000 são lidos como 100 centavos | Normalizar os formatos monetários aceitos sem perder dígitos; regressões no domínio e PDV |
| REV-008 / [#10](https://github.com/oraconect5g-boop/sistema-ora5g/issues/10) | ORA-POS-005/007; PAY-002; QUAL-012 | a152516d; packages/dominio/src/pagamento.ts:45; venda.ts:42; dinheiro.ts:19 | Bloqueante — dinheiro | Entrada fracionada, desconto negativo, preço NaN e inteiro inseguro aceitos | Validar centavos e limites em runtime em todos os pontos públicos, inclusive operações intermediárias |
| REV-009 / [#11](https://github.com/oraconect5g-boop/sistema-ora5g/issues/11) | ORA-006; ORG-006; ADR-002 §2.6 | a152516d; apps/plataforma/src/lib/supabase/servidor.ts:15 | Importante | Cookie renovado em Server Component pode ser descartado; falta proxy SSR | Renovar em contexto de escrita, propagar cookies/cache e testar expiração e segunda visita |
| REV-010 / este registro | ORA-008; qualidade da demonstração | a152516d; apps/plataforma/src/demo/perfis.ts:15 | Importante | Operador in aceita propriedades herdadas; cookie constructor causa HTTP 500 | Usar validação de chaves próprias e fallback seguro; testar constructor, __proto__, toString e perfil desconhecido |
| REV-011 / este registro | ORA-QUAL-001/002/004; ORG-006 | a152516d; docs/alinhamento/status-requisitos.json:18 e :35–37 | Importante | Nota de login desatualizada; itens de segurança tratados como feitos com defeitos abertos | Atualizar JSON e gerar a rastreabilidade; distinguir parcial, demonstração, testado e homologado |
| REV-012 / este registro | ORA-012; QUAL-007/013 | a152516d; deploy/homologacao/publicar.sh:32–35 | Importante | Publicação muda dependências em uso e para o serviço antes de saber se a build passa, sem retorno ao artefato anterior | Preparar artefato fora da cópia ativa, testar falha de build e preservar/restaurar a última versão funcional |
| REV-013 / este registro | ADR-002 §2.4; ORA-ORG-004; CRM | a152516d; apps/plataforma/src/app/demo/vender/PDV.tsx:83 e :276 | Importante — aderência de UX | Vendedor vê margem; busca por final de CPF/telefone diverge da busca exata planejada | Alinhar demonstração ao comportamento real pretendido; nunca expor custo/margem na futura UI do vendedor nem usar busca parcial de dados reais |
| REV-014 / este registro | ORA-006; estados de erro de UI | a152516d; apps/plataforma/src/app/conta/page.tsx:18–21 | Importante | Erros de consulta são ignorados e viram mensagem de ausência de perfil/unidade | Distinguir falha de serviço de resultado vazio, com mensagem segura e log sem segredo |

## Evidências e limites

- Base inicial: 69 testes existentes passaram; 4 todo; 11 E2E passaram e 1 foi pulado.
- Base complementar: instalação limpa, scanner, lint, tipos e build passaram; 110 testes existentes passaram, 4 todo; 28 E2E passaram e 4 foram pulados. Dois pulados são login real sem Supabase configurado, dois são duplicações intencionais dos testes auxiliares no celular.
- Testes adversariais locais: 5 falhas esperadas no banco inicial, demonstrando quatro causas; 9 falhas esperadas adicionais em dinheiro/validação/perfis na base complementar.
- Cookie herdado: HTTP 500 com constructor e HTTP 200 sem cookie, em servidor local temporário.
- Rastreamento gerado passou no --conferir. Isso prova consistência do arquivo gerado com o JSON, não a correção dos status declarados.
- Auditoria de produção da base complementar: zero vulnerabilidades reportadas. Scripts de homologação passaram em bash -n; não foram executados no servidor.
- Sessão SSR e riscos de publicação foram identificados por inspeção. Não houve uso de credenciais reais, teste de expiração contra projeto real, diagnóstico de indisponibilidade da VPS ou implantação.
- As migrations e o validador dos achados iniciais não mudaram nos nove commits da revisão complementar; os achados continuam abertos.
- [CI da main complementar](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42383556054): sucesso. Não comprova cenários ausentes ou pulados.

## Pendências conhecidas que não são novas entregas

A auditoria automática de alterações de vínculos/perfis/papéis continua faltando. ADR-003 não foi aceito e continua necessário antes das tabelas de catálogo/estoque. Login ainda precisa de recuperação, unidade da sessão, limite de turno e teste de usuário autorizado.

O login por senha usa URL e chave pública, não exige chave privilegiada ou conexão SQL. Corrigir o bloqueio B1 da análise do Claude para separar Auth público de worker/migrations. Nunca enviar valores de credenciais para resolver essa pendência.

A demonstração usa cookie de perfil apenas para dados fictícios; ele não pode ser reutilizado para autorizar o sistema real. A remoção em produção foi testada. O selo de demonstração e o bind local são acertos a preservar.

## Como responder aos achados

Claude implementa em branch e cita o ID/issue no commit. Para cada correção, registrar novo commit, teste de regressão e resultado do CI. Codex revisa o novo código e então atualiza a situação do achado. Correção proposta ou issue aberta não conta como correção concluída.

Manter as constatações com a base histórica; atualizar o status ao lado da evidência. Não apagar auditoria nem reescrever migrations aplicadas. As regras de negócio e a linguagem permanecem as aprovadas.

## Atualização da conferência em 00a35f97

Os registros acima preservam a fotografia histórica dos achados. Claude integrou correções em 00a35f970d977e3766571de4f3ac67978e7a2ef1 após o PR #8. A conferência independente de cada correção, testes, status e limites está em [CONFERENCIA_DAS_CORRECOES_2026-11-07.md](CONFERENCIA_DAS_CORRECOES_2026-11-07.md).

O CI dessa base passou; localmente passaram 172 testes e 35 E2E (5 pulados), além de 14 provas independentes originais. Sessão real e implantação remota não foram testadas pelo Codex.

Pendências novas: [REV-015 / #13](https://github.com/oraconect5g-boop/sistema-ora5g/issues/13), desconto maior que o item derruba a tela; [REV-016 / #14](https://github.com/oraconect5g-boop/sistema-ora5g/issues/14), reaproveitamento de release ignora atualização do ambiente no mesmo SHA. A [CONFIG-001 / #12](https://github.com/oraconect5g-boop/sistema-ora5g/issues/12) está parcialmente atendida pelos novos grupos público/servidor.

O modelo mínimo e o roteiro de apresentação → login → operação real estão em [CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md](CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md). Manter TypeScript/React/Next.js/Node.js e PostgreSQL/Supabase, sem reabrir decisões de linguagem ou reduzir o escopo.

## Revisão incremental da apresentação em 8e1625d

O lote posterior a 503fa541 contém 10 commits e 19 arquivos, com ajustes de Apache, textos, atalhos e rolagem. A análise por arquivo está em [REVISAO_INCREMENTAL_2026-11-07_8e1625d.md](../analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md). Stack e escopo preservados; não há novas tabelas de operação.

CI da main passou (42392229369). Localmente passaram lint, tipos, build, 18 testes da aplicação e 39 E2E (5 pulados), além dos testes extras de POST/origem, /conta com proxy e polimento móvel.

A #13 / REV-015 continua P1: o teste independente de desconto maior que o item voltou a derrubar o PDV. Foi registrada a [#16 / REV-017](https://github.com/oraconect5g-boop/sistema-ora5g/issues/16), P2, em entrar/page.tsx:11–15 e 26: erro=__proto__ causa HTTP 500 por propriedade herdada do catálogo de mensagens. É defeito anterior identificado nesta revisão. Correção: validar tipo e chave própria, preservando mensagens neutras e cobrindo parâmetros inválidos.

As pendências #10, #11, #12 e #14 continuam conforme seus limites. Atualizar o estado compartilhado: sete issues antigas já foram encerradas, mas a fila de revisão ainda omite os novos achados. Corrigir #13/#16 antes da próxima apresentação; nenhum teste, alteração de ambiente ou publicação foi feito no servidor pelo Codex.

## Auditoria funcional e Supabase em 56ec9de

Inventário completo em [AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md](../analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md). O usuário pediu análise de front-end, backend, migrations, banco e Supabase; foram consultados código, testes e metadados/contagens do projeto de desenvolvimento em modo de leitura, sem SSH/.env ou alteração remota.

- Front-end: 17 páginas de /demo, incluindo perfil, e cinco perfis; operações comerciais ainda fictícias. Backend real: Auth/SSR, /conta, validação de ambiente e saúde.
- Banco: dez tabelas RLS, 14 funções, 29 índices e cinco gatilhos. Organização, empresa, unidade, perfil, vínculo, contexto, auditoria e usuários/sessões Auth estão com contagem zero; catálogo de acesso tem cinco papéis, 31 permissões e 69 relações.
- REV-015 / #13: correção confirmada no celular e computador; issue encerrada.
- REV-017 / #16: query herdada no login continua causando HTTP 500.
- [REV-018 / #17](https://github.com/oraconect5g-boop/sistema-ora5g/issues/17), P2: três versões de migrations diferem entre Git e histórico remoto, embora os objetos comparados correspondam. Conciliar antes de novas aplicações, preservando dados; nenhum repair/reset foi executado.
- [REV-019 / #18](https://github.com/oraconect5g-boop/sistema-ora5g/issues/18), P2: acessórios podem ir a N+1 com saldo N e conclusão continua habilitada; reproduzido em navegador local.
- 210 testes e 63 E2E passaram; nove E2E pulados por configuração/viewport. Mais dois testes de mostrar/esconder senha passaram com configuração pública fictícia. Os testes extras de #16/#18 reproduziram os defeitos e não foram integrados como testes vermelhos.
- Advisors: sem aviso de health, três avisos das RPCs SECURITY DEFINER intencionais, 12 índices ainda sem uso. Storage, Edge Functions e Realtime de tabelas do aplicativo ainda não configurados no projeto consultado.
- O modelo mínimo e o guia já foram incorporados na main. Os registros anteriores mantêm sua base histórica; esta seção é a conferência mais recente.

## Conferência de 08/11/2026 — main 7f5fd41

Esta é a conferência mais recente; os registros anteriores são fotografias históricas. A [auditoria completa](../analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md) e a [matriz dos 172 requisitos](../analises/MATRIZ_DOS_172_REQUISITOS_2026-11-08.md) detalham commits, código, funções, Supabase, testes, requisitos e sequência de implementação.

Foram conferidos 29 commits e 90 arquivos desde 56ec9de, incluindo incorporações de análises anteriores do Codex. CI da main aprovado: [42510057118](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42510057118). Local: 314 testes existentes passaram (4 TODO); navegador: 106 passaram e 10 pulados. Testes adversariais separados reproduziram seis falhas de banco e quatro de navegador (dois cenários em dois tamanhos).

### Achados novos

| ID | Requisito | Arquivo e linha na base revisada | Gravidade | Defeito e correção | Issue |
|---|---|---|---|---|---|
| REV-020 | ORA-INV-002, 006 | catalogo_estoque.sql:198 | Bloqueante P1 | IMEI principal pode ser IMEI2 de outro aparelho; garantir unicidade conjunta e concorrente | [#19](https://github.com/oraconect5g-boop/sistema-ora5g/issues/19) |
| REV-021 | ORA-INV-005, ORA-POS-004 | catalogo_estoque.sql:603 | Bloqueante P1 | Mesma chave aceita quantidade/origem diferentes; conferir conteúdo normalizado da reserva | [#20](https://github.com/oraconect5g-boop/sistema-ora5g/issues/20) |
| REV-022 | ORA-INV-003, 004 | catalogo_estoque.sql:439 e 410 | Bloqueante P1 | Colisão de chave pode devolver outro IMEI ou criar item sem movimento; validar identidade e garantir atomicidade | [#21](https://github.com/oraconect5g-boop/sistema-ora5g/issues/21) |
| REV-023 | ORA-INV-002, 003 | catalogo_estoque.sql:324 e 406 | Bloqueante P1 | Outra entrada do mesmo aparelho infla saldo de 2 para 3; validar posição e transição por item sob trava | [#22](https://github.com/oraconect5g-boop/sistema-ora5g/issues/22) |
| REV-024 | ORA-CONNECT-001, 011 | ChipsConnect.tsx:54 | Importante P2, demonstração | Transfere 5 eSIM quando a origem tem 4 e não a baixa; simular estoque de origem e destino coerentes | [#23](https://github.com/oraconect5g-boop/sistema-ora5g/issues/23) |
| REV-025 | ORA-CONNECT-003, ORA-PAY-003 | RecargaConnect.tsx:65 | Importante P2, demonstração | LINK confirmado é mostrado como SALDO e dinheiro recebido na loja; manter meio e recebimento distintos | [#24](https://github.com/oraconect5g-boop/sistema-ora5g/issues/24) |

O arquivo SQL é packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; os componentes estão em apps/plataforma/src/app/demo/connect/_abas. As reproduções estão em docs/analises/evidencias/2026-11-08. Correção estrutural volta ao Claude por migration nova; não reescrever as aplicadas.

### Correções anteriores confirmadas

- #10 / REV-008: aritmética exata em valores altos; encerrada.
- #12 / CONFIG-001: CLI, modelos e configuração pública separada; encerrada.
- #14 / REV-016: versão por commit/configuração e volta automática; fixture local isolada aprovada; encerrada.
- #16 / REV-017: erro herdado e parâmetros repetidos tratados; encerrada.
- #17 / REV-018: seis versões, nomes e hashes iguais ao remoto; encerrada.
- #18 / REV-019: carrinho respeita saldo exato e bloqueia aumento; encerrada.
- REV-014: teste de /conta com falhas do transporte simulado conferido.
- #11 / REV-009: continua aberta, sem usuário real para provar renovação da sessão.

### Parecer sobre requisitos e banco

ORA-ORG-005 mantém testado em desenvolvimento. ORA-INV-003 volta a parcial por #21/#22. Totais revisados: **1 testado, 28 parciais, 22 demonstrações, 2 bloqueados, 118 não iniciados, 1 restrição respeitada e 0 homologados**.

Supabase: 20 tabelas com RLS, 33 funções, 167 colunas, 131 constraints comparáveis, 83 índices, 19 gatilhos, 20 policies e 20 grants examinados correspondentes ao banco limpo. Sem usuário/sessão Auth ou perfil; há semente fictícia. Consultas foram somente de leitura, sem .env, chaves, dados pessoais individuais ou mudanças remotas.

Próximos passos: corrigir #19–#22; concluir acesso e renovação real; aceitar ADR-003; integrar catálogo/estoque; importar Rein por arquivo; depois PDV/caixa, piloto, Nogle/fiscal e canais. O plano, os critérios e as dependências estão na auditoria.

## Conferência de 08/11/2026 — main 55d10af e relatório do Claude Web

Parecer mais recente: [REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md](../analises/REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md). Comparação desde 7f5fd41: 19 commits, 78 arquivos, incluindo documentação anterior do próprio Codex. Relatório enviado pelo proprietário lido integralmente e confrontado com código/decisões; suas recomendações sobre exclusão de itens telecom, importação de estoque e escopo de OS exigem os ajustes registrados.

**#19–#24 / REV-020 a REV-025 encerradas** após prova independente: seis testes originais de banco e quatro execuções originais de navegador passaram. CI da main [42521842775](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42521842775) aprovado. Localmente: instalação limpa, lint, tipos e build aprovados; **397 testes passaram, 4 TODO; 124 E2E passaram, 10 pulados**.

Novos achados reproduzidos separadamente:

| ID / issue | Gravidade | Defeito |
|---|---|---|
| REV-026 / [#27](https://github.com/oraconect5g-boop/sistema-ora5g/issues/27) | P1 | Bloqueio global de pessoa compartilhada afeta organização fora da autoridade do gestor |
| REV-027 / [#28](https://github.com/oraconect5g-boop/sistema-ora5g/issues/28) | P1 | E-mail Auth divergente permite autoconcessão por convite e worker |
| REV-028 / [#29](https://github.com/oraconect5g-boop/sistema-ora5g/issues/29) | P1 | Duas revogações concorrentes deixam organização sem dono |
| REV-029 / [#30](https://github.com/oraconect5g-boop/sistema-ora5g/issues/30) | P2 | Worker conclui convite de emissor bloqueado sem revalidar autoridade |
| REV-030 / [#31](https://github.com/oraconect5g-boop/sistema-ora5g/issues/31) | P2, demo | Face de recarga entra no faturamento e margem fictícia |
| REV-031 / [#32](https://github.com/oraconect5g-boop/sistema-ora5g/issues/32) | P2, demo | Indicador “só confirmadas” inclui ativação pendente e conta linhas |

[Evidências](../analises/evidencias/2026-11-08-web/LEIA-ME.md): seis assertions deliberadamente falham na base, fora do CI normal. As falhas de indicadores são anteriores ao lote. Corrigir banco por migration nova e preservar stack.

Supabase consultado somente para metadados/contagens: oito migrations da main correspondem ao histórico; há uma nona de fotos em andamento sem código na main no corte, que não foi homologada. Banco sem usuários/sessões Auth/perfis/convites. #11 continua aberta sem renovação real comprovada; #26 continua aguardando entrega/revisão de fotos. Nenhum acesso ao servidor/.env ou alteração remota.

173 requisitos, 71 no piloto; status declarados: 3 testados em desenvolvimento, 26 parciais, 22 demonstrações, 2 bloqueados, 119 não iniciados, 1 restrição respeitada, 0 homologados. As correções de estoque delimitadas foram conferidas; o núcleo comercial/Nogle não está pronto.

**Orientação recente do proprietário:** a Nogle/Contel mantém os fatos oficiais telecom; a Ora relaciona venda, loja, vendedor, recorrência e repasse, sem dupla contagem. Ler [NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md](NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md) e o [adendo ao prompt](ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md). Renovação de plano é diferente de comissão recorrente; nenhuma taxa ou rota de repasse foi presumida.

## Rodada ampliada de 08/11/2026 — testes em todos os setores

[Análise dos 17 setores](../analises/TESTES_E_ANALISE_POR_SETOR_2026-11-08.md), sobre a mesma base 55d10af. Stack preservada. Executados 88 casos adicionais distintos: 79 passaram e 9 falharam de forma esperada, demonstrando seis causas novas. As reexecuções não entram como cobertura adicional.

Achados P2: REV-032 / #34 (idempotência com variante NULL e condição/série omitidas); REV-033 / #35 (chip q2 com ICCID único); REV-034 / #36 (contrato não exclui o autor da fila de aprovação); REV-035 / #37 (relatório 30 dias compara com um dia); REV-036 / #38 (CSV permite fórmula textual); REV-037 / #39 (ativação simulada deixa carteira negativa). Limites e reproduções estão na análise e na [pasta de evidências](../analises/evidencias/2026-11-08-setores/LEIA-ME.md). As P1 #27–#29 continuam prioritárias.

Adicionados à suíte normal um teste com 1000 entradas de desconto e 21 cenários Playwright em dois tamanhos, cobrindo páginas, negativas de perfil e dez exportações, inclusive filtros e omissão de custo. Casos vermelhos ficam fora do CI normal.

Supabase consultado somente em leitura: 22 tabelas com RLS, zero usuários/sessões/perfis; bucket privado de fotos, tipos/limite e policies presentes no desenvolvimento, sem homologação de upload/URLs. Advisor: sem aviso de health; 17 RPCs SECURITY DEFINER intencionais a revisar por seus guards; uma FK de fotos sem índice geral de cobertura e 44 índices sem uso (não remover automaticamente). Sem acesso ao servidor/.env, banco mutado ou operação externa real.

Nenhum módulo foi marcado como homologado. O inventário permanece 173 requisitos/71 do piloto. Implementação ausente é registrada como pendência, sem usar mockup como prova.

## Revisão da entrega real de catálogo/fotos — aebbdcc

Lote novo após a revisão anterior: sete commits/21 caminhos; agora há código real de fotos na main. [Conferência detalhada](../analises/REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md). CI da main [42535268839](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42535268839) aprovado; localmente 407 testes existentes passaram, 4 TODO. Testes específicos adicionais: 17 casos, oito verdes e nove falhas esperadas, fora do CI normal.

Achados: REV-038 / #40 (busca só nos primeiros 200 produtos); REV-039 / #41 (imagem não recupera com URL nova); REV-040 / #42 (retry duplica upload e registro repetido retorna 23505); REV-041 / #43 (descarte retém arquivo no input). Também REV-042 / #44: um advisory de minimatch propaga oito moderados de desenvolvimento; produção sem alerta no audit. Não aplicar downgrade automático do Next. As P1 de acesso anteriores mantêm prioridade.

Conferência do aviso de índice: o índice completo fotos_organizacao, embora tenha ordem inversa à FK, atende ambas as igualdades no EXPLAIN local. O INFO isolado não justifica índice redundante. #26 continua aberta até correções, ligação aos demais pontos previstos e homologação autorizada de Auth/Storage/câmera.

A nova análise complementa as fotografias históricas anteriores; não reclassifica retroativamente a versão antiga. Preservar TypeScript/React/Next.js/Node.js/PostgreSQL/Supabase e migrations aplicadas.




## Revisão de vendas, pagamentos e caixa reais — 371cef0

Seis commits e 25 caminhos após aebbdcc. [Análise completa](../analises/REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md) e [fontes/resultados](../analises/evidencias/2026-11-08-vendas/LEIA-ME.md). Main local: 428 testes passaram, quatro TODO. Rodada adversarial: 20 casos, três controles passaram e 17 falharam por nove causas; não integram a suíte normal.

| ID / issue | Requisito | Arquivo e linha em 371cef0 | Gravidade | Erro e correção |
|---|---|---|---|---|
| REV-043 / #45 | ORA-ORG-006; POS-006 | migration vendas:279 | Bloqueante — acesso | Aprovação própria ignora revogação/bloqueio. Exigir acesso vigente no ramo do solicitante |
| REV-044 / #46 | ORA-POS-007; PAY-001 | migration:913–927 | Bloqueante — dinheiro | Entrada Pix/cartão de financeira aceita sem comprovante. Validar meio efetivo e evidência |
| REV-045 / #47 | ORA-PAY-004/005; POS-010 | migration:1056–1062 | Bloqueante — dinheiro | Estorno da entrada deixa caixa em -20000. Validar/travar saldo em toda saída de dinheiro |
| REV-046 / #48 | ORA-POS-013; PAY-002 | migration:923–943 | Bloqueante — dinheiro | Financiamento acima do preço usa entrada para troco, divergindo do domínio. Alinhar DEC-U38 |
| REV-047 / #49 | ORA-POS-010; PAY-002 | migration:1053–1062 | Bloqueante — dinheiro | Retido 19900, devolvido 20000 após troco; depende do excesso aceito no #48. Estornar recebido líquido |
| REV-048 / #50 | ORA-PAY-003/007; POS-010 | migration:1073–1079 | Bloqueante — dinheiro | Pix/cartão viram estornado sem evidência externa. Separar pendência e confirmação |
| REV-049 / #51 | ORA-INV-003; POS-010; CONNECT-001 | migration:1047–1052 | Bloqueante — integridade | Cancelamento torna aparelho/chip disponível sem retorno físico. Conferir identidade/condição antes de liberar |
| REV-050 / #52 | ORA-PAY-004; POS-005/006 | vender/acoes.ts:26 e :64 | Importante — validação | Valor inválido vira zero. Rejeitar inválido e distinguir vazio/zero intencional |
| REV-051 / #53 | ORA-POS-006 | migration:692–702 e :765–788 | Importante — concorrência | Venda→aprovação versus aprovação→venda causa 40P01 em PostgreSQL 17. Unificar ordem das travas |

Migration = packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql. A análise detalhada liga as nove issues, delimita cada prova e orienta regressões. A prova concorrente usa locks preparatórios locais e RPCs reais autenticadas; não demonstra corrupção.

Supabase só em leitura: 30 tabelas com RLS, 11 migrations, zero usuários/sessões/vendas/caixas; MD5 das duas novas migrations confere. Advisor agrupa 29 RPCs SECURITY DEFINER intencionais e 74 índices sem uso no ambiente vazio, não números automáticos de vulnerabilidades ou índices a excluir.

CI 42537301660: verde no merge temporário eab4143 (d484b882 + 371cef0), 429 testes +4 TODO e 176 E2E +10 pulados. O log prova que essa execução já incluiu vendas, apesar do metadado de base anterior. Atualização da PR de revisão exige novo CI do novo head. POS-006/007 e PAY-004 voltam a parcial; nenhum requisito homologado.

## 09/11/2026 — merges, duplicidades e Nogle financeira

[Análise de merges e versões antigas](../analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md): main 371cef0, 130 commits, 35 merges e 68 árvores Git. Não foi comprovada reintrodução de código operacional removido; 34 merges têm base única e nenhum caminho removido voltou a ficar presente. Um merge documental tem duas bases e foi examinado separadamente. Conteúdo novo de resolução apareceu só em documentação e um E2E.

Banco local reconstruído: 11 migrations, 94 declarações de função com 11 substituições na mesma identidade e 83 funções atuais, sem sobrecarga antiga; 144 índices sem equivalentes exatos nas propriedades comparadas, 30 triggers e 32 policies. Triggers repetindo a função protegem eventos diferentes (UPDATE/DELETE e TRUNCATE). Índices invertidos de fotos são candidatos a avaliar por plano/carga, sem remoção automática.

Grafo: 118 fontes, 17 entradas reais e nenhum caminho literal de import das entradas reais aos dados demo; arquivo monolítico dados.ts e versão antiga da migration de fotos removidos. Configurações/templates idênticos têm avaliação individual. Divergência TypeScript/SQL de pagamento já comprovada em #48 exige regressão de paridade; não foi atribuída a conflito de merge sem evidência. O inventário local passou; limites e fontes na pasta de evidências. Não houve inspeção da VPS/crontab.

[Prioridade Nogle, gateway e repasses](../analises/PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md), [issue #54](https://github.com/oraconect5g-boop/sistema-ora5g/issues/54): orientação explícita reforçada pelo proprietário. Coleção oficial reconferida em 09/11 é idêntica à cópia versionada (62 funções, 16 grupos). Não há transporte Nogle, rota Connect real, persistência/processamento telecom ou cobrança/repasse integrados na base. Não está pronto só esperando chaves. #54 é pendência de implementação, não novo defeito atribuído a merge.

Código/configuração/contratos e testes fictícios podem avançar sem credenciais; chamadas e homologação reais dependem de conta/linha/escopo autorizados e contrato do provedor. Gateway Nogle no módulo Ora Connect; campos de pagamento não provam liquidação ou contrato de repasse bancário. Sem operações reais, secrets ou alteração de linguagem. Nenhum status promovido a homologado.

## Atualização 9b1109e — Nogle real parcial,11 lojas e transferências

O corte novo inclui19 commits/66 caminhos após371cef0. Agora há cliente/worker Nogle, /connect, operações persistentes, /estoque e fila fiscal. [Consolidado atual](../analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md), [perguntas à Contel](../integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md). Não usar a ausência de módulos do corte anterior como estado atual.

| Achado | Requisito | Fonte | Gravidade | Correção solicitada |
|---|---|---|---|---|
| REV-052 / #55 | ORA-CONNECT-004; ORG-006 | publicar.sh:52 | Bloqueante — segredos | Filtro antigo conserva segredos Nogle na cópia web. Contrato explícito/allowlist e teste de publicação/rollback |
| REV-053 / #56 | ORA-CONNECT-003; ORG-004 | migration Connect:245–265; connect/page.tsx:54/199 | Bloqueante — permissão | Custo da carteira exposto ao vendedor. Separar DTO/tabela/eventos e conferir custo.ver |
| REV-054 / #57 | ORA-CONNECT-003; POS-007 | connect_registrar | Bloqueante — dinheiro | LINK aceita serviço já pago. Impedir dupla cobrança ou compensar por regra aprovada |
| REV-055 / #58 | ORA-CONNECT-002/010 | digest da operação sem cliente | Bloqueante — identidade | Mesma chave aceita cliente alterado. Digest/HMAC do conteúdo relevante com privacidade |
| REV-056 / #59 | ORA-CONNECT-003/006/010 | interpretarConsulta; produção por operação | Bloqueante — dupla contagem | Uma evidência de recarga confirma duas operações com data coincidente. Correlação única e bloqueio de ambiguidade |

Seis provas adicionais, um controle passou e cinco falharam por cinco causas, fora do CI normal; [fontes](../analises/evidencias/2026-11-09-nogle-9b1109/LEIA-ME.md). Sem operação real ou chave. Suíte local com o teste de propriedade anterior:486 testes passaram, dois TODO. Supabase só leitura:38 tabelas com RLS,14 migrations e zero usuários/sessões/operações; MD5s novos conferem. Nenhuma sobrecarga antiga no inventário local111 funções.

Histórico total analisado149 commits/43 merges/81 árvores; os oito merges novos não restauraram caminho removido. Resolução de navegação/SSR/E2E preserva estoque,Connect e notas. #55 mostra integração nova usando caminho antigo não atualizado, sem exigir conflito textual no Git. O reexport antigo Nogle aponta a uma implementação canônica no domínio.

Proprietário confirmou11 lojas comerciais e DEFEITOS para erro/problema, substituindo 14 lojas. Referência em docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json; fluxo interno #60 e [proposta visual](../prototipos/estoque-por-loja-2026-11-09/LEIA-ME.md). Pedidos simulados no protótipo não alteram estoque. Operação real, repasse e homologação continuam pendentes.
