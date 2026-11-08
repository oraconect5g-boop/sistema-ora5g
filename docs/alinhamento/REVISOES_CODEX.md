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
