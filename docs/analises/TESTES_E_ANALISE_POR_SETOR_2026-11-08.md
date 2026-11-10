# Rodada de testes e análise por setor — 08/11/2026

**Base operacional:** `55d10afec95a6a556546b2b2e1f439302a86bfff`, igual à revisão anterior no início desta rodada. **Revisor:** Codex. **Stack preservada:** TypeScript, React/Next.js, Node.js e PostgreSQL/Supabase; testes em Vitest/Playwright existentes. Não houve troca de linguagem, implantação, cobrança, ativação real ou alteração de banco remoto.

Esta rodada complementa [a revisão anterior](REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md). Não há novo lote de implementação na main para atribuir ao Claude: os achados abaixo são casos adicionais do código existente. O PR #33 permanece a proposta de revisão; Claude implementa as correções.

## 1. Resultado e provas

Foram executados **88 casos adicionais distintos**: 44 testes de regras/banco/aplicação e 44 execuções de navegador (22 cenários em dois tamanhos).

| Grupo | Passaram | Falharam deliberadamente na base | O que comprova |
|---|---:|---:|---|
| Domínio | 21 | 1 | Formatos monetários, entradas inválidas, misto/troco, financiamento/repasse, overflow e 1000 entradas determinísticas de desconto; chip com quantidade 2 indevidamente aceito |
| Banco local descartável | 6 | 3 | Custo/preço por papel, loja escolhida, RPCs bloqueadas ao anônimo, sessão Auth obrigatória, fim da campanha e integridade; três resíduos de idempotência |
| Aplicação/contratos | 10 | 3 | Nogle recusa HTTP de erro/retorno falso, notas solicitadas das fixtures presentes, comparação 7/14 dias; falhas em autoaprovação, comparação de 30 dias e CSV |
| Navegador 360/1280 | 42 | 2 | 16 páginas do dono, oito negativas por perfil, dez exportações, filtros/omissão de custo; saldo negativo na ativação simulada |
| **Total** | **79** | **9** | Seis causas agrupadas nas issues #34–#39 |

Os 1000 valores de desconto são amostras dentro de **um teste de propriedade**, não 1000 testes contados à parte. Não são teste de carga nem prova de todos os valores possíveis.

As falhas ficam em [evidências reproduzíveis](evidencias/2026-11-08-setores/LEIA-ME.md), fora da descoberta do CI. Foram adicionados à suíte normal **21 cenários Playwright em dois tamanhos** e **um teste de propriedade de desconto** que já passaram localmente. Não foram adicionadas assertions sabidamente vermelhas à suíte de entrega.

A base já tinha CI aprovado, 397 testes verdes (+4 TODO) e 124 E2E verdes (+10 pulados), conforme revisão anterior. A nova combinação precisa do CI deste commit; não somar reexecuções como cobertura nova.

## 2. Achados adicionais, com escopo e prioridade

| ID / issue | Local na base | Prova e correção |
|---|---|---|
| REV-032 / [#34](https://github.com/oraconect5g-boop/sistema-ora5g/issues/34), P2 | `integridade_estoque.sql:463` e `:316` | Repetição com variante NULL retorna reserva anterior; condição/número de série divergentes também retornam sucesso na entrada. Três assertions esperavam rejeição. Validar obrigatórios e conteúdo normalizado completo, com comparação segura de NULL e referência ao pedido original |
| REV-033 / [#35](https://github.com/oraconect5g-boop/sistema-ora5g/issues/35), P2 | `packages/dominio/src/venda.ts:46` | Um chip com quantidade 2 e um ICCID válido recebe zero erros. Exigir unidade por ICCID e coerência com o banco, que já recusa essa reserva; não foi demonstrada duplicação física persistida |
| REV-034 / [#36](https://github.com/oraconect5g-boop/sistema-ora5g/issues/36), P2 | `src/demo/consultas.ts:124` | Contexto de gerente fictício que é autor de pedido ainda recebe o próprio pedido na fila. Contrato não aplica pessoaId; componente também não barra. Definir solicitante_id separado do vendedor e negar autoaprovação no banco real e na UX |
| REV-035 / [#37](https://github.com/oraconect5g-boop/sistema-ora5g/issues/37), P2, demo | `demo/relatorios/page.tsx:37` | Comparação de 30 dias usa um único dia anterior. Série constante de R$10/dia resulta em +2900%. Fornecer histórico suficiente ou identificar comparação indisponível, sem inventar zeros |
| REV-036 / [#38](https://github.com/oraconect5g-boop/sistema-ora5g/issues/38), P2 | `componentes/ExportarCsv.tsx:10` | Texto inofensivo =1+1 vai literalmente para célula CSV e seria interpretável como fórmula. Neutralizar campos textuais sem corromper números. Não foi aberta planilha nem demonstrada exploração com dado real |
| REV-037 / [#39](https://github.com/oraconect5g-boop/sistema-ora5g/issues/39), P2, demo | `AtivarChip.tsx:83,194` | Após 34 ativações eSIM, saldo ilustrativo fica em -R$51,28 e botão continua habilitado. Prova nos dois tamanhos. Revalidar saldo ao confirmar e usar custo/estado oficial no fluxo real |

O arquivo SQL é `packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql`. Os caminhos de UI são relativos a `apps/plataforma/src/app`, salvo indicação.

REV-032 complementa os limites conferidos nas #20/#21: não reproduz item órfão nem duplicação de reserva, já corrigidos. A equivalência de payload ainda está incompleta. A correção de banco continua sendo por migration **nova**.

REV-034 é prova de contrato com identidade/role fornecidos ao helper; os perfis fixos da demo não garantem essa combinação na navegação atual. Não é prova de autoaprovação persistida em produção. O futuro controle deve comparar o **solicitante real**, que pode ser diferente do vendedor da venda.

As issues #27–#32 da rodada anterior continuam abertas; as três P1 de autorização/concorrência mantêm prioridade superior às novas P2. Os testes verdes não substituem sua correção.

## 3. Cobertura dos 17 setores do backlog

| Setor | O que foi conferido nesta rodada | Situação e o que impede aceite real |
|---|---|---|
| ORG — organização/equipe | Negativas de vendedor, administrador e técnico; banco exige sessão Auth e loja atual; revisão dos limites conhecidos | Acesso/equipe parcial; #27–#30, senha recente, SMTP/worker e #11 continuam |
| CAT — catálogo/preço/fotos | CSV filtrado por produto e sem custo para vendedor; fim exclusivo de campanha; validador de chips; metadados de fotos | Catálogo real/fotos sem código na main do corte; chip q2 e idempotência pendentes; amostra Rein necessária para layout |
| INV — estoque/serial/suprimentos | Custo/preço protegidos; loja escolhida; reserva/liberação sem divergência; nova checagem de payload | Livro/identificadores já testados; #34 exige completar equivalência; falta fluxo real de venda/importação/recebimento |
| CRM — clientes/contratos | Página abre sem erro; dados fictícios e resposta de conversas explicitamente simulada | Não há CRUD/contrato real completo, consentimentos ou integração de atendimento homologada |
| POS — PDV/vendas | Valores inválidos, misto/troco, série de desconto, validador serial, CSV de canceladas | Backend transacional/detalhe/cancelamento ainda por implementar; não marcar venda persistida pelo comprovante da demo |
| PAY — pagamentos/caixa | Separação entrada/repasse em financiamento; excedente sem dinheiro recusado; overflow recusado; CSV financeiro | Sem abertura/fechamento/baixa real, adaptador de pagamento e conciliação completa; não assumir POS automático |
| FIN — financeiro/controladoria | Exportação de recebimentos e estrutura de contas/caixa simulados | Falta ledger real, contas/parcelas/baixas, taxas/prazos contratuais e conciliação; #31 segue relevante |
| PERF — metas/comissões | Página/CSV de metas, regra de desconto e escopo de produção da base | Ledger de desempenho e incentivos não implementados; #31/#32 e fonte oficial Nogle; comissão depende de política/contrato |
| FISC — fiscal/nota | Fila e UI abrem; todas as notas solicitadas das fixtures atuais têm pedido fiscal | Não prova combinações futuras de múltiplos pedidos nem emissão; falta solicitante/autoaprovação no banco, emissor e contador |
| CONNECT — telecom | Erros HTTP e retorno:false recusados; abas/CSV; ativação repetida e saldo insuficiente | #39 na simulação; adaptador/ledger, operação oficial e repasse ainda não entregues; seguir diretriz Nogle existente |
| ONLINE — loja online | Página de canais e transparência de fase | Checkout, catálogo público, estoque/cobrança/entrega reais ausentes; não há E2E operacional a executar |
| MKTPL — marketplaces | Documentação/estado e página de canais | Sem adaptadores oficiais homologados de Mercado Livre/TikTok/outros; APIs/permissões pendentes |
| WHATS — atendimento/automação | UI de conversas, rascunho e aviso de simulação; navegação | Envio fica no navegador; falta API oficial, consentimento, entrega e trilha persistente |
| META — anúncios/atribuição | Requisitos/estado e distinção de atribuição comercial | Sem integração/atribuição real; testes de provedor dependem do contrato/conta habilitada |
| AI — inteligência artificial | Sugestão apresentada como supervisionada e sem decisão autônoma | Não há serviço real de IA homologado; sugestão fictícia não conta como automação entregue |
| REPORT — gestão/BI | Dez exportações, filtros, omissão de custo e cálculo dos períodos | #37 e #38, além de #31/#32; dados fictícios e fontes reais ainda ausentes |
| QUAL — segurança/operação | RLS/roles em banco local, erros de página, advisors Supabase, lint/tipos e testes do PR | Sessão real, restores, carga, integração externa e produção não foram homologados; manter critérios de go/no-go |

**Assistência/OS**, aprovada por DEC-U44/U47, foi incluída na navegação e revisão de código. Já há simulação de orçamento/etapas por técnico/loja e testes anteriores; faltam identidade/IMEI/fotos do cliente, custódia, aceite, peças, pagamento e mensagens persistentes. A cobertura do módulo no backlog original ainda precisa de IDs formais; isso não remove o módulo do escopo.

Não existe teste funcional real para um recurso ainda ausente: nesses casos, a análise registra a lacuna e o aceite necessário, em vez de usar telas simuladas como prova operacional.

## 4. Supabase e fotos: conferência só de leitura

Consulta atual: **22 tabelas públicas, todas com RLS; zero usuários/sessões Auth e perfis**. Não foram lidos registros pessoais individuais nem valores de configuração.

O bucket de produtos existe, é **privado**, aceita JPEG/PNG/WebP e limita arquivo a **5 MiB**. Há policies de leitura por organização com vínculo vigente e INSERT por permissão de fotos/estrutura de caminho. Há funções de registrar foto e listar pendências. Isso é avanço de infraestrutura; não prova envio/câmera, miniatura, URL assinada, revogação, correspondência de cor ou autorização no app real.

A migration de fotos ainda estava fora da main do corte; a inspeção foi dos metadados remotos, sem aplicar SQL. Não foi executado upload/download de imagens reais nem alterada policy.

Advisors atuais:

- **Health:** nenhum aviso retornado.
- **Security:** 17 RPCs SECURITY DEFINER executáveis por authenticated. São pontos de entrada intencionais, não 17 falhas comprovadas. Exigem guards corretos, search_path fixo e regressões; os achados de equipe continuam relevantes. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **Performance:** uma FK de fotos sem índice de cobertura geral em `(produto_id, organizacao_id)`; conferir e criar índice por migration nova quando a entrega for consolidada. É INFO, não prova de lentidão. [Referência](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- 44 índices ainda sem uso: esperado em banco sem operação; não removê-los automaticamente. [Referência](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

O changelog atual da Supabase foi consultado: avisos de TLS e PostgreSQL 17.11 devem ser considerados ao homologar ambientes; não se encontrou evidência nesta rodada de que sejam a causa dos defeitos locais acima.

## 5. Próxima execução do Claude

1. Resolver as P1 #27–#29 e revogação #30, conservando as seis correções antigas.
2. Incluir #34/#35 no contrato real de catálogo/estoque/venda, antes de reutilizar os validadores; não desativar constraints.
3. Corrigir #36–#39 e #31/#32 nos componentes/consultas compartilhados, sem inventar APIs, taxas ou regras financeiras.
4. Concluir fotos/catálogo, publicação do código correspondente e testes autorizados de acesso/Storage. Manter #26 aberta até prova completa.
5. Avançar venda, caixa/pagamentos e Connect oficial com ledger, vendedor de origem, renovação e conciliação de repasse. Os 17 setores mantêm o roadmap integral.
6. Usar os testes novos como regressão; transformar reproduções vermelhas em testes normais após corrigir. Registrar SHA, CI, critérios de aceite e limites de homologação.

Permanecem 173 requisitos no inventário e 71 no piloto; esta rodada não altera o total nem declara novos módulos homologados. O estado implementado continua limitado aos contratos e funcionalidades efetivamente localizados/testados.

