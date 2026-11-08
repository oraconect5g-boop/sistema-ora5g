# Matriz dos 172 requisitos — revisão de 08/11/2026

Base auditada: `7f5fd413eee756015723a53b29680db0ec655a1f`. Autor: Codex, revisor. Stack mantida: TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase.

## Como contar

- Parcial: **28**.
- Testado em desenvolvimento: **1**.
- Não iniciado: **118**.
- Restrição respeitada: **1**.
- Demonstração: **22**.
- Bloqueado: **2**.
- Homologados pelo proprietário: **0**.

A main informava 2 testados e 27 parciais. Esta revisão devolve ORA-INV-003 a parcial por #21/#22; ORA-ORG-005 permanece testado. ORA-CAT-003 é uma restrição respeitada (nenhuma API da Rein), não uma operação comercial entregue. Não há porcentagem única de conclusão: requisitos têm complexidades diferentes. As tarefas técnicas ORA-001 a ORA-012, as 17 páginas da demonstração e as 62 rotas documentadas da Nogle não são contagens adicionais de requisitos concluídos.

## Totais por domínio

| Domínio | Total | Testado | Parcial | Demonstração | Bloqueado | Não iniciado | Restrição |
|---|---:|---:|---:|---:|---:|---:|---:|
| ORG — Organização, lojas e usuários | 10 | 1 | 5 | 0 | 0 | 4 | 0 |
| CAT — Catálogo e precificação | 10 | 0 | 5 | 0 | 0 | 4 | 1 |
| INV — Estoque, serial/IMEI e suprimentos | 12 | 0 | 7 | 0 | 0 | 5 | 0 |
| CRM — Clientes, CRM, oportunidades e contratos | 10 | 0 | 0 | 0 | 0 | 10 | 0 |
| POS — PDV mobile e vendas | 16 | 0 | 3 | 2 | 0 | 11 | 0 |
| PAY — Pagamentos, PicPay e caixa | 14 | 0 | 1 | 1 | 0 | 12 | 0 |
| FIN — Financeiro e controladoria | 10 | 0 | 0 | 2 | 0 | 8 | 0 |
| PERF — Vendedor, metas, comissões e bonificações | 10 | 0 | 1 | 1 | 0 | 8 | 0 |
| FISC — Fiscal, nota e conformidade | 10 | 0 | 0 | 0 | 2 | 8 | 0 |
| CONNECT — Ora Connect, chips, ativações e recargas | 11 | 0 | 1 | 9 | 0 | 1 | 0 |
| ONLINE — E-commerce e vendas online | 8 | 0 | 0 | 0 | 0 | 8 | 0 |
| MKTPL — Marketplaces e channel manager | 8 | 0 | 0 | 0 | 0 | 8 | 0 |
| WHATS — WhatsApp, atendimento e automação | 8 | 0 | 0 | 0 | 0 | 8 | 0 |
| META — Meta Ads e atribuição | 6 | 0 | 0 | 0 | 0 | 6 | 0 |
| AI — Inteligência artificial e análise | 7 | 0 | 0 | 0 | 0 | 7 | 0 |
| REPORT — Gestão, BI e relatórios | 8 | 0 | 0 | 7 | 0 | 1 | 0 |
| QUAL — Segurança, qualidade, operação e compliance | 14 | 0 | 5 | 0 | 0 | 9 | 0 |

## Ordem de implementação

A sequência detalhada está na [auditoria](AUDITORIA_CLAUDE_CODE_2026-11-08.md#8-proximos-passos-em-ordem). Primeiro corrigir #19 a #22; concluir acesso real e seu teste; integrar catálogo/estoque; importar o arquivo; construir PDV, pagamentos e caixa; homologar piloto e avançar telecom, fiscal e canais. Segurança, testes, auditoria e restauração acompanham as entregas. As tabelas abaixo mantêm os IDs do backlog, agrupados por domínio; a numeração histórica do backlog não altera as decisões mais recentes do proprietário.

## Cada requisito, sua evidência e o que falta

### ORG — Organização, lojas e usuários

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-ORG-001 | Cadastrar empresa, organização, 14 lojas e loja piloto | Parcial | Tabelas organização/empresa/unidade com CNPJ validado no banco e escolha da unidade na sessão. Falta cadastrar as 14 lojas reais (lista com CNPJs pendente) e a tela de gestão. | packages/banco/supabase/migrations/20261107140352_fundacao_acesso.sql; packages/banco/src/acesso.test.ts (T10) |
| ORA-ORG-002 | Associar usuários a uma ou múltiplas lojas com função e vigência | Parcial | Vínculos com vigência, um vendedor em várias lojas, bloqueio testado. A tela de usuários existe só na demonstração (troca de loja da sessão, bloquear/desbloquear sem gravar); falta a tela real ligada ao banco. | acesso.test.ts (T1, T2/T3, T7) |
| ORA-ORG-003 | Gerir perfis diretoria, regional, gerente, vendedor, financeiro, fiscal, marketing e atendimento | Parcial | 5 papéis do ADR-002 (dono, administrador, gerente, vendedor, técnico) com matriz versionada por migration. Regional, financeiro, fiscal, marketing e atendimento entram depois por migration. | migration fundacao_acesso (catálogo de papéis e permissões) |
| ORA-ORG-004 | Isolar dados por loja na API e PostgreSQL/RLS | Parcial | RLS e funções do banco testadas, inclusive negação por ID arbitrário, troca de unidade e isolamento entre organizações (REV-001/REV-002 corrigidos em 07/11, aguardando revisão do Codex). As telas reais ainda não usam essas funções além de /conta. | packages/banco/src/acesso.test.ts; packages/banco/src/revisao-codex.test.ts |
| ORA-ORG-005 | Histórico de alterações de papéis, políticas e configurações | Testado em desenvolvimento | Auditoria automática (gatilho) em organizações, empresas, unidades, perfis, papéis, permissões, matriz papel × permissão, vínculos e categorias: ator, horário, alvo, antes/depois e motivo, separada por organização (REV-002). Aplicada no ora5g-dev em 08/11. Conferido pelo Codex em 08/11 nos testes de banco e na correspondência dos objetos remotos. Homologação pelo proprietário e uso por usuário real continuam pendentes. | packages/banco/supabase/migrations/20261108150432_auditoria_automatica_acesso.sql; packages/banco/src/auditoria-acesso.test.ts |
| ORA-ORG-006 | Login, recuperação de conta e revogação de sessão | Parcial | Login por e-mail e senha no aplicativo (/entrar, mensagem neutra; código de erro do endereço validado, REV-017/#16), /conta lendo pelo RLS e separando falha do serviço de ausência de perfil (REV-014, testado com serviço simulado), sessão renovada no proxy (REV-009) e bloqueio/encerramento de vínculo cortando acesso no banco. FALTA: recuperação de senha (SMTP), escolha da loja na sessão pelo aplicativo, sessão por turno e teste com usuário real. | apps/plataforma/src/app/entrar; apps/plataforma/src/proxy.ts; apps/plataforma/src/app/conta/page.test.ts; e2e/entrar.spec.ts; acesso.test.ts (T6, T7) |
| ORA-ORG-007 | Autenticação reforçada para perfis privilegiados | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: MFA e política de sessão validados com segurança. | backlog.json; sem implementação vinculada |
| ORA-ORG-008 | Configurar horários, endereços, caixas e dados fiscais por loja | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Mudanças versionadas com regras de vigência. | backlog.json; sem implementação vinculada |
| ORA-ORG-009 | Gerir unidades regionais, grupos e metas agregadas | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Relatórios respeitam hierarquia de acesso. | backlog.json; sem implementação vinculada |
| ORA-ORG-010 | Preparar multi-CNPJ/UF para expansão física nacional | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Vínculos fiscais e locais operam sem dados globais hard-coded. | backlog.json; sem implementação vinculada |

### CAT — Catálogo e precificação

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-CAT-001 | Cadastrar categorias, marcas, produtos, variantes e SKUs | Parcial | Categorias, marcas, produtos por tipo e variações com SKU e código de barras únicos no banco (ADR-003 proposto, aplicado no ora5g-dev em 08/11). Falta: tela real de cadastro e importação da Rein (ORA-009, depende do arquivo). | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-CAT-002 | Importar produtos e preços da Rein somente por CSV/XLSX | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Prévia, validação, relatório de erro, confirmação e rollback lógico. | backlog.json; sem implementação vinculada |
| ORA-CAT-003 | Não consumir API Rein em nenhuma operação diária | Restrição respeitada | Nenhum código usa a API da Rein. Importação só por arquivo (DEC-U04/DEC-U24). | busca no repositório |
| ORA-CAT-004 | Cadastrar preços vigentes por loja/canal conforme regra | Parcial | Preço com histórico por loja e canal, campanha com período e preço vigente consultável em qualquer momento (preco_vigente), sem apagar o anterior. Falta: alteração pela tela com preco.alterar e a gravação do preço na venda (ADR-004). | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-CAT-005 | Diferenciar smartphone, acessório, chip e serviço comercial | Parcial | Tipos no banco iguais aos de packages/dominio, com exigências: aparelho só com IMEI, chip só com ICCID, acessório por quantidade, serviços sem estoque. Falta a venda real (ADR-004). | packages/dominio/src/venda.ts; packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-CAT-006 | Pesquisar por nome, SKU e, quando aplicável, IMEI/ICCID | Parcial | Validação de IMEI (dígito verificador), ICCID e CPF prontas e testadas; busca por nome, marca, SKU, código de barras e final do IMEI na demonstração. Falta a busca no banco. | packages/dominio/src/identificadores.ts; apps/plataforma/src/app/demo/vender/PDV.tsx |
| ORA-CAT-007 | Programar vigência de promoções e campanhas comerciais | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Preço aplicado respeita período e autorização. | backlog.json; sem implementação vinculada |
| ORA-CAT-008 | Custo de produto/lote/entrada e margem gerencial | Parcial | Custo com histórico, visível só com custo.ver (vendedor não vê; testado). Falta custo por entrada/lote nas compras (ORA-INV-009). | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-CAT-009 | Canais externos usam mapeamento de SKU e IDs próprios | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Identificadores externos não substituem PK interna. | backlog.json; sem implementação vinculada |
| ORA-CAT-010 | Permitir importação assistida em lote de fotos/atributos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Erros não criam duplicatas nem sobrescritas silenciosas. | backlog.json; sem implementação vinculada |

### INV — Estoque, serial/IMEI e suprimentos

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-INV-001 | Manter disponibilidade por loja e localização física | Parcial | Saldo por loja no banco, isolado por RLS (papel de unidade vê só a loja da sessão) e disponibilidade das outras lojas sem IMEI (disponibilidade_na_rede). Falta: transferência entre lojas (ORA-INV-007) e a tela real. | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-INV-002 | Identificar aparelho por IMEI/serial e impedir venda duplicada | Parcial | IMEI com dígito verificador e único na organização; reserva com trava de linha e índice único (a segunda tentativa é recusada). Falta: baixa na venda real (ADR-004) e prova com duas conexões simultâneas (precisa DATABASE_URL de desenvolvimento). | packages/dominio/src/identificadores.test.ts; packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-INV-003 | Registrar cada entrada/saída em livro auditável de estoque | Parcial | Livro imutável e saldo igual à soma dos movimentos passam nos testes existentes. Revisão independente de 08/11 reproduziu entrada serializada sem movimento por colisão de chave (REV-022/#21) e saldo inflado por segunda entrada do mesmo aparelho (REV-023/#22). Corrigir por migration nova e provar posição por item, rollback e idempotência antes de voltar a testado. | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts; docs/analises/AUDITORIA_CLAUDE_CODE_2026-11-08.md; issues #21 e #22 |
| ORA-INV-004 | Receber estoque inicial validado por contagem real | Parcial | Conferência física do IMEI/ICCID pelo celular registrada e auditada (conferir_item). Falta: importação aprovada da Rein e relatório de divergências. | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-INV-005 | Reservar estoque durante checkout e liberar em expiração/cancelamento | Parcial | Reserva com prazo, liberação, vencimento e idempotência no banco. Falta: ligar ao checkout real e a rotina periódica de vencimento. | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-INV-006 | Bloquear venda de IMEI indisponível/transferido/reservado | Parcial | O banco recusa reservar IMEI/ICCID reservado, vendido ou de outra loja, com códigos próprios (OR002, OR003) e sem mudança parcial. Falta: mensagens na tela real. | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-INV-007 | Transferência entre lojas com trânsito/recebimento | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Origem e destino confirmam quantidades e divergências. | backlog.json; sem implementação vinculada |
| ORA-INV-008 | Inventário cíclico e ajuste com aprovação | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Trilha permite reconstruir antes/depois e justificativa. | backlog.json; sem implementação vinculada |
| ORA-INV-009 | Compras e recebimento de fornecedores | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Pedido, nota/entrega, custo e entrada identificáveis. | backlog.json; sem implementação vinculada |
| ORA-INV-010 | Histórico de reparo/devolução e condição de unidade | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Produto retornado não reaparece automaticamente como novo. | backlog.json; sem implementação vinculada |
| ORA-INV-011 | Controle de ICCID de chip físico quando exigido | Parcial | ICCID com dígito verificador, único e controlado chip a chip (proposta Q4 do ADR-003). Falta: ligar à ativação da Nogle. | packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-INV-012 | Transferência para CD e alocação futura a canais nacionais | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Apropriação de localização e logística auditável. | backlog.json; sem implementação vinculada |

### CRM — Clientes, CRM, oportunidades e contratos

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-CRM-001 | Cadastro de cliente com dados mínimos e finalidade | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Dados obrigatórios dependem da operação; LGPD documentada. | backlog.json; sem implementação vinculada |
| ORA-CRM-002 | Relacionar cliente às compras/IMEIs/chips/linhas e atendimentos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Perfil 360 apresenta histórico autorizado por loja/função. | backlog.json; sem implementação vinculada |
| ORA-CRM-003 | Pesquisar cliente por identificadores protegidos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Resultados evitam expor CPF desnecessariamente. | backlog.json; sem implementação vinculada |
| ORA-CRM-004 | Registrar lead, origem, atendente, vendedor responsável e etapa | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Funil mostra histórico e próximo passo. | backlog.json; sem implementação vinculada |
| ORA-CRM-005 | Atividades, lembretes, follow-up e motivos de perda | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Histórico com autor e vencimento. | backlog.json; sem implementação vinculada |
| ORA-CRM-006 | Detecção e mesclagem controlada de cadastros duplicados | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Não perde compras/documentos; operação auditável. | backlog.json; sem implementação vinculada |
| ORA-CRM-007 | Registros de consentimento/preferência de comunicação | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Retirada afeta automações e respeita obrigações. | backlog.json; sem implementação vinculada |
| ORA-CRM-008 | Contratos/anexos de venda, garantia, financiamento e telecom | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Acesso, assinatura, guarda e retenção adequados. | backlog.json; sem implementação vinculada |
| ORA-CRM-009 | Histórico omnichannel de compras físicas/online | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Pedido externo e venda vinculados sem sobrescrever origem. | backlog.json; sem implementação vinculada |
| ORA-CRM-010 | Segmentação comercial e valor de vida do cliente | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Segmentos minimizam dados e são explicáveis. | backlog.json; sem implementação vinculada |

### POS — PDV mobile e vendas

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-POS-001 | Efetuar venda completa em celular sem notebook | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: E2E em smartphone real da loja piloto. | backlog.json; sem implementação vinculada |
| ORA-POS-002 | Busca rápida por nome/SKU/IMEI e carrinho responsivo | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Usabilidade e velocidade validadas com vendedor. | backlog.json; sem implementação vinculada |
| ORA-POS-003 | Itens mistos em venda: aparelho, acessório, chip, ativação, recarga | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Itens mantêm natureza e regras próprias sem dupla contabilização. | backlog.json; sem implementação vinculada |
| ORA-POS-004 | Selecionar IMEI físico disponível antes de concluir | Parcial | Reserva do IMEI atômica no banco (trava + índice único); a escolha do IMEI na tela existe na demonstração. Falta a baixa na venda real (ADR-004). | apps/plataforma/src/app/demo/vender/PDV.tsx; packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts |
| ORA-POS-005 | Calcular preço/desconto e totais server-side | Parcial | Totais e limite de desconto por margem em regra pura testada, com validação em tempo de execução (REV-007/REV-008 corrigidos) e limite e margem em inteiros exatos também em valores altos (resíduo do REV-008, 08/11). Falta executar no servidor e gravar no banco. | packages/dominio/src/desconto.ts; packages/dominio/src/revisao-codex.test.ts |
| ORA-POS-006 | Solicitar aprovação do gerente para desconto acima do limite | Demonstração | Regra que decide quando precisa de aprovação está pronta; pedido com motivo, resposta simulada, cancelamento quando o carrinho muda e fila com aprovar/negar (justificativa obrigatória) existem só na demonstração. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | packages/dominio/src/desconto.ts; apps/plataforma/src/app/demo/aprovacoes; apps/plataforma/src/app/demo/vender |
| ORA-POS-007 | Suportar múltiplos pagamentos na mesma venda | Parcial | Pagamento misto, troco e venda financiada em regra pura testada, com entrada e valores validados (REV-008). Falta registro no banco. | packages/dominio/src/pagamento.ts; revisao-codex.test.ts |
| ORA-POS-008 | Vincular venda a vendedor, loja, cliente quando aplicável e canal | Demonstração | Venda da demonstração ligada a vendedor, loja da sessão e cliente (busca exata ou cadastro na hora). Nada é gravado. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-POS-009 | Consultar status e comprovantes sem concluir pagamento pendente | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Vendedor vê pendência e ação de reprocessamento segura. | backlog.json; sem implementação vinculada |
| ORA-POS-010 | Cancelar e devolver sem apagar origem | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Reversão reflexa em estoque, pagamentos, fiscal e comissões. | backlog.json; sem implementação vinculada |
| ORA-POS-011 | Gerar solicitação fiscal a partir da venda em poucos toques | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Vendedor não precisa escolher documento fiscal incorreto. | backlog.json; sem implementação vinculada |
| ORA-POS-012 | Troca com diferença de preço e meios de pagamento | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Histórico e estoque correto na devolução/saída. | backlog.json; sem implementação vinculada |
| ORA-POS-013 | Venda parcelada/PayJoy/boleto por fluxo homologado | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Etapas reais, aprovação e termos exigidos. | backlog.json; sem implementação vinculada |
| ORA-POS-014 | Aplicar campanhas, combos e regras por loja | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Persistência da regra aplicada para auditoria. | backlog.json; sem implementação vinculada |
| ORA-POS-015 | Atalhos para supervisor e estados offline/sem rede | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem venda presumida como concluída sem confirmação. | backlog.json; sem implementação vinculada |
| ORA-POS-016 | Entrada por leitor USB/Bluetooth ou câmera | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem mudança na regra central de busca/checkout. | backlog.json; sem implementação vinculada |

### PAY — Pagamentos, PicPay e caixa

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-PAY-001 | Registrar dinheiro, Pix direto, Pix PicPay POS e cartões | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Provider, terminal, método e comprovante quando disponível. | backlog.json; sem implementação vinculada |
| ORA-PAY-002 | Suportar financiamento, boleto, parcelamento e pagamentos online | Parcial | Regra da venda financiada PayJoy/Aiva (DEC-U38) e e-mail obrigatório na PayJoy (DEC-U30) testadas. Falta registro e repasse. | packages/dominio/src/pagamento.test.ts |
| ORA-PAY-003 | Diferenciar autorizado, pago, liquidado, estornado e conciliado | Demonstração | Situação por meio de pagamento separando autorizado, pago, liquidado e conciliado na tela de caixa. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-PAY-004 | Abrir caixa com saldo inicial e responsável | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Uma sessão ativa segundo regra por gaveta/terminal. | backlog.json; sem implementação vinculada |
| ORA-PAY-005 | Registrar sangria, suprimento, reforço, devolução e saída autorizada | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Cada movimento tem motivo, autor e impacto no saldo. | backlog.json; sem implementação vinculada |
| ORA-PAY-006 | Fechar caixa com valor contado e diferença | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Gerente confere e aprova divergência. | backlog.json; sem implementação vinculada |
| ORA-PAY-007 | Conciliação manual PicPay POS usando referência/comprovante | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem API não se presume liquidação automática. | backlog.json; sem implementação vinculada |
| ORA-PAY-008 | Evitar confirmação duplicada via webhook/retry | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Constraints de evento externo e idempotency key. | backlog.json; sem implementação vinculada |
| ORA-PAY-009 | Importar extratos de adquirente/banco por arquivo validado | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Linhas conciliadas, discrepâncias e taxas reportadas. | backlog.json; sem implementação vinculada |
| ORA-PAY-010 | Reconciliar taxas, parcelas e datas de repasse | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Venda bruta vs líquido recebido visíveis. | backlog.json; sem implementação vinculada |
| ORA-PAY-011 | Gerir chargebacks, estornos, antecipação e ajustes | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Efeito financeiro e comissão não duplicado. | backlog.json; sem implementação vinculada |
| ORA-PAY-012 | Permitir múltiplas maquininhas/provedores por loja | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Terminal tem identificação e escopo correto. | backlog.json; sem implementação vinculada |
| ORA-PAY-013 | Integração automática com PicPay POS se API contratual confirmada | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Contrato, autenticação, eventos e homologação aprovados. | backlog.json; sem implementação vinculada |
| ORA-PAY-014 | Pix/checkout web e links por provedores validados | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Confirmação no backend antes de fulfill/baixa definitiva. | backlog.json; sem implementação vinculada |

### FIN — Financeiro e controladoria

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-FIN-001 | Resumo diário de vendas x recebimentos x produção comercial | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Categorias e status reconciliáveis. | backlog.json; sem implementação vinculada |
| ORA-FIN-002 | DRE/margem gerencial com custo, taxa e desconto | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Números não são apresentados como contabilidade formal auditada. | backlog.json; sem implementação vinculada |
| ORA-FIN-003 | Contas a receber ligadas a venda, vencimento e meio | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Aging e status dependem de confirmação. | backlog.json; sem implementação vinculada |
| ORA-FIN-004 | Contas a pagar ligadas a fornecedor/origem | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Vencimentos e responsabilidades autorizadas. | backlog.json; sem implementação vinculada |
| ORA-FIN-005 | Rastrear recebíveis e repasses por loja/adquirente | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Diferenças e pendências visíveis ao financeiro. | backlog.json; sem implementação vinculada |
| ORA-FIN-006 | Conciliação bancária e contas multiempresa | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Imports/matches reproduzíveis com aprovação. | backlog.json; sem implementação vinculada |
| ORA-FIN-007 | Gestão de inadimplência e cobranças autorizadas | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Ações e consentimentos com auditoria. | backlog.json; sem implementação vinculada |
| ORA-FIN-008 | Relatório financeiro consolidado por loja/região/rede | Demonstração | Visão financeira por loja ou da rede (recebimentos, caixas, financeiras, contas e fluxo de caixa de 14 dias). Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-FIN-009 | Exportações CSV/XLSX/PDF de relatórios autorizados | Demonstração | Exportação CSV (ponto e vírgula, abre no Excel em português) das telas de vendas, estoque, metas, relatórios, recebimentos, usuários e auditoria. XLSX e PDF ainda não. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-FIN-010 | Previsão de fluxo de caixa e simulações | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Premissas explicadas e separadas de fatos. | backlog.json; sem implementação vinculada |

### PERF — Vendedor, metas, comissões e bonificações

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-PERF-001 | Contar individualmente aparelhos, acessórios, chips, ativações e recargas | Parcial | Contagem de produção por categoria (aparelho, acessório, chip, ativação só confirmada, recarga) em regra pura testada. Falta ledger de performance no banco. | packages/dominio/src/venda.test.ts |
| ORA-PERF-002 | Registrar performance_event único por origem/ação confirmada | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Retries de API não criam duas bonificações. | backlog.json; sem implementação vinculada |
| ORA-PERF-003 | Distinguir quantidade, valor bruto, margem, receita elegível e comissão | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Extrato explica cálculo de cada evento. | backlog.json; sem implementação vinculada |
| ORA-PERF-004 | Definir meta por vendedor, loja, categoria e período | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Alteração não reescreve resultado histórico. | backlog.json; sem implementação vinculada |
| ORA-PERF-005 | Painel do gestor mostra metas e resultados da equipe | Demonstração | Painel do gestor com metas e produção de todos os vendedores do escopo; o vendedor vê só os próprios números. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-PERF-006 | Regras de bonificação por categoria/campanha/margem/escala | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Edição versionada e período de vigência. | backlog.json; sem implementação vinculada |
| ORA-PERF-007 | Ajustar comissão por cancelamento/devolução conforme regra | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Comprovante de origem e reversão sem apagar histórico. | backlog.json; sem implementação vinculada |
| ORA-PERF-008 | Apurar e aprovar fechamento de bonificação | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Totais detalhados, contestação e trilha de aprovação. | backlog.json; sem implementação vinculada |
| ORA-PERF-009 | Metas coletivas/regional e rankings configuráveis | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Desempate transparente e autorização adequada. | backlog.json; sem implementação vinculada |
| ORA-PERF-010 | IA recomenda campanhas/metas com aprovação humana | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem alterar remuneração automaticamente. | backlog.json; sem implementação vinculada |

### FISC — Fiscal, nota e conformidade

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-FISC-001 | Solicitar nota diretamente da venda no celular | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Fluxo intuitivo e prefill de dados necessários. | backlog.json; sem implementação vinculada |
| ORA-FISC-002 | Fluxo interno de aprovação de solicitações pelo gestor conforme política | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Auditoria sem impedir obrigação legal de emissão. | backlog.json; sem implementação vinculada |
| ORA-FISC-003 | Identificar perfil fiscal por produto/serviço/UF/CNPJ | Bloqueado | Depende do contador e do emissor fiscal (P7). | docs/ESTADO_ATUAL_E_PASSAGEM.md §5 |
| ORA-FISC-004 | Integrar provedor fiscal homologado para documento correto | Bloqueado | Depende do emissor fiscal contratado e do certificado A1. | docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2A |
| ORA-FISC-005 | Guardar chave, protocolo, referência e evidências legais com segurança | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Controle de acesso e retenção definidos. | backlog.json; sem implementação vinculada |
| ORA-FISC-006 | Tratar falha fiscal, reprocesso, contingência e cancelamento | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Nenhum documento duplicado nem venda marcada indevidamente. | backlog.json; sem implementação vinculada |
| ORA-FISC-007 | Mapear cenários NF-e/NFC-e/NFS-e/NFCom conforme natureza | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Matriz validada por contador com decisões por UF e operação. | backlog.json; sem implementação vinculada |
| ORA-FISC-008 | Conciliação fiscal de vendas, tributos e documentos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Pendências e divergências alertadas. | backlog.json; sem implementação vinculada |
| ORA-FISC-009 | Devolução, troca, cancelamento e correção fiscal | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Fluxos e prazos homologados com fiscal. | backlog.json; sem implementação vinculada |
| ORA-FISC-010 | Multi-UF/multi-CNPJ e reforma tributária preparada | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Alterações versionadas e conformes à norma vigente. | backlog.json; sem implementação vinculada |

### CONNECT — Ora Connect, chips, ativações e recargas

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-CONNECT-001 | Cadastrar e vender chip físico ligado ao estoque e vendedor | Demonstração | Venda do chip no PDV e estoque de chips por loja (físico e eSIM), com transferência do estoque central. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-002 | Separar evento de venda de chip do evento de ativação | Demonstração | A venda do chip (PDV) e a ativação na operadora (aba Ativar chip) são passos separados. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-003 | Separar recarga como operação telecom com status próprio | Demonstração | Recarga com estado próprio (aguardando pagamento ou confirmada), avulsa ou programada pelo saldo. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-004 | Registrar Nogle como integração externa por adapter | Parcial | Contrato da API NOGLE lido por inteiro (62 funções) e guardado no repositório; catálogo gerado e conferido no CI; normalização das respostas e regras de ICCID, portabilidade e bloqueio testadas. Falta o cliente HTTP no servidor, que depende do tipo de chave (P9) e das credenciais no gerenciador de segredos. | apps/plataforma/src/integracoes/nogle; docs/integracoes/NOGLE_API_REFERENCIA.md |
| ORA-CONNECT-005 | Refletir ativação somente após resposta verificada da Nogle | Demonstração | A linha só aparece como ativa depois da consulta que confirma a ativação na operadora. Simulado; resposta real depende da integração. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-006 | Atribuir performance de ativação/recarga ao vendedor de origem | Demonstração | Ativações e recargas atribuídas ao vendedor e à loja da venda nos painéis e na carteira. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-007 | Consulta/atualização de linha e plano conforme API disponível | Demonstração | Consulta de linha (detalhes, saldo, consumo de 30 dias, histórico, cobranças, titularidade, apelido) no formato da API. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-008 | Portabilidade, contrato e venda de plano conforme contrato | Demonstração | Portabilidade (pedido, reenvio do SMS, status) e operadoras doadoras no formato da API. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |
| ORA-CONNECT-009 | Reconciliar repasses/bonificações Nogle e operação local | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Divergências rastreáveis e reversão segura. | backlog.json; sem implementação vinculada |
| ORA-CONNECT-010 | Recuperar falha de rede com reconsulta sem reativação duplicada | Demonstração | Cada operação que cria algo na operadora diz o que consultar antes de reenviar (catálogo e telas). A recuperação real depende do cliente HTTP. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts; apps/plataforma/src/integracoes/nogle; docs/integracoes/NOGLE_API_REFERENCIA.md |
| ORA-CONNECT-011 | eSIM, contratação digital e entrega de chip nacional | Demonstração | eSIM na ativação e compra de chip com entrega e rastreio no formato da API. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo/connect; apps/plataforma/e2e/connect.spec.ts |

### ONLINE — E-commerce e vendas online

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-ONLINE-001 | Site de aparelhos, acessórios e planos Ora Connect | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Catálogo e estoque centralizados; não criar outro sistema de venda. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-002 | Carrinho/checkout online e pedido com status | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Pagamento confirmado antes de liberar fulfillment. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-003 | Atribuir origem online, campanhas e vendedor quando aplicável | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem atribuição indevida ou dupla comissão. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-004 | Frete, CEP, retirada em loja e entrega com rastreio | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Reserva e prazos consistentes. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-005 | Devolução, arrependimento e reembolso de venda online | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Prazo/regra legal homologado e efeitos auditados. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-006 | Reserva de IMEI por pedido/canal anti-overselling | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Pedido online concorrente com loja não vende unidade duplicada. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-007 | Contratação online de planos/chips/eSIM se habilitado | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Validação de identidade/contrato, antifraude e cobertura. | backlog.json; sem implementação vinculada |
| ORA-ONLINE-008 | Expansão interestadual com parâmetros fiscais e logísticos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Multi-UF testado antes da abertura nacional. | backlog.json; sem implementação vinculada |

### MKTPL — Marketplaces e channel manager

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-MKTPL-001 | Preparar adaptadores separados Mercado Livre/Shopee/TikTok Shop | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Contratos e permissões confirmados antes do deploy. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-002 | Sincronizar SKU/preço/estoque/anúncio conforme recursos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Evitam overselling e divergência detectável. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-003 | Importar pedido marketplace com ID externo e dedupe | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Reenvio de webhook não duplica pedido/reserva. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-004 | Tratar entrega/frete/etiquetas/rastreio por canal | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Estados de fulfillment corretos e não inventados. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-005 | Conciliação de tarifas, comissões e repasses por marketplace | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Lucratividade por pedido/canal explicável. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-006 | Cancelamentos, devoluções e reembolsos por canal | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Estoque/financeiro/fiscal/commission reversos. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-007 | Sincronização near-real-time por webhooks/adapters | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Rate limits/retries monitorados. | backlog.json; sem implementação vinculada |
| ORA-MKTPL-008 | Métricas por anúncio/canal/produto e margem | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Valores reconciliados sem confundir receita bruta com líquida. | backlog.json; sem implementação vinculada |

### WHATS — WhatsApp, atendimento e automação

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-WHATS-001 | WhatsApp Business Platform oficial conectado ao CRM | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Conta/números/escopos homologados; templates válidos. | backlog.json; sem implementação vinculada |
| ORA-WHATS-002 | Caixa de entrada multiatendente com atribuição à loja/vendedor | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Mensagens e transferência auditadas. | backlog.json; sem implementação vinculada |
| ORA-WHATS-003 | Leads orgânicos e pagos identificados por origem consentida | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Campanha e UTM preservados quando disponíveis. | backlog.json; sem implementação vinculada |
| ORA-WHATS-004 | Histórico 360 de conversas/negócios por cliente | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Política de retenção/consentimento aplicada. | backlog.json; sem implementação vinculada |
| ORA-WHATS-005 | Respostas rápidas, etiquetas, SLA e repasse para humano | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Handoff sempre acessível. | backlog.json; sem implementação vinculada |
| ORA-WHATS-006 | Templates e mensagens proativas em conformidade Meta | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem spam nem envio sem permissão/consentimento apropriado. | backlog.json; sem implementação vinculada |
| ORA-WHATS-007 | IA supervisionada para qualificação e sugestão de respostas | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Ações sensíveis exigem revisão e logs. | backlog.json; sem implementação vinculada |
| ORA-WHATS-008 | Recuperação de carrinho e pós-venda sob consentimento | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Taxa de resposta/conversão mensurada. | backlog.json; sem implementação vinculada |

### META — Meta Ads e atribuição

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-META-001 | Importar insights autorizados de Meta Ads por conta/campanha | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: OAuth/scopes revisados; dados de custo e período auditáveis. | backlog.json; sem implementação vinculada |
| ORA-META-002 | Capturar UTM e origem de leads de site/WhatsApp | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Jornada vincula campanha, oportunidade e venda quando possível. | backlog.json; sem implementação vinculada |
| ORA-META-003 | Mostrar gasto, CTR, CPC, CPL, CPA e ROAS quando calculáveis | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Fórmulas, período e limitações explicitadas. | backlog.json; sem implementação vinculada |
| ORA-META-004 | Funil por vendedor/loja/campanha e atribuição | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Dupla contagem/dedup de conversões minimizada. | backlog.json; sem implementação vinculada |
| ORA-META-005 | Conversions API/eventos com consentimento e dedupe | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem rastrear dados sem base legal/autorização. | backlog.json; sem implementação vinculada |
| ORA-META-006 | Analisar margem e CAC por campanha | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Distingue métrica estimada de valor liquidado. | backlog.json; sem implementação vinculada |

### AI — Inteligência artificial e análise

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-AI-001 | Painéis básicos e alertas desde o MVP | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: KPIs operacionais calculados de fatos transacionais. | backlog.json; sem implementação vinculada |
| ORA-AI-002 | IA auxilia atendimento e qualificação de leads | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Base de conhecimento versionada, revisão e handoff. | backlog.json; sem implementação vinculada |
| ORA-AI-003 | IA sugere produtos, respostas e roteamento de cliente | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem enviar informações sensíveis não autorizadas. | backlog.json; sem implementação vinculada |
| ORA-AI-004 | IA resume campanhas, metas e falhas operacionais | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Valores e fonte verificáveis; sem inventar dados. | backlog.json; sem implementação vinculada |
| ORA-AI-005 | Autorização humana obrigatória para operações financeiras/fiscais | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Auditoria de proposta/aprovador/execução. | backlog.json; sem implementação vinculada |
| ORA-AI-006 | Controle de custo por chamada de modelo e retenção | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Orçamento configurável, logs redigidos e alertas. | backlog.json; sem implementação vinculada |
| ORA-AI-007 | Avaliação de qualidade e red-team de agentes | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Testes de prompt injection e permissões aprovados. | backlog.json; sem implementação vinculada |

### REPORT — Gestão, BI e relatórios

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-REPORT-001 | Dashboard diretoria consolidado das 14 lojas | Demonstração | Painel da rede (ou de uma loja escolhida no topo) com faturamento, meta, ranking das lojas, mix, recebimentos por meio, vendas por hora e alertas. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-002 | Dashboard gerente de loja: caixa, metas, aprovação de desconto/NF | Demonstração | Painel do gerente: equipe inteira contra a meta, caixa previsto × contado, aprovações e alertas da loja. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-003 | Dashboard vendedor mobile: produção do dia, metas e atalhos | Demonstração | Início do vendedor no celular: meta do dia, produção por categoria, vendas por loja (vendedor em duas lojas) e atalhos. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-004 | Relatório de chips vendidos, ativações e recargas separadamente | Demonstração | Relatório de chips, ativações, portabilidades e recargas por dia e por vendedor, só confirmadas. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-005 | Relatório por método de pagamento e terminal PicPay | Demonstração | Recebimentos por meio de pagamento e situação de conciliação (autorizado, liquidado, conciliado). Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-006 | Relatórios de margem, vendedor e ranking configurável | Demonstração | Relatórios de margem, ticket, descontos e ranking de lojas e vendedores por período (7, 14 e 30 dias), com exportação CSV. Ranking para o vendedor aguarda a decisão P3. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-007 | Alertas de estoque mínimo/IMEI/caixa divergente/fiscal pendente | Demonstração | Alertas de estoque mínimo, caixa divergente, nota parada, OS parada e ativação com falha, no sino e no painel. Só dados fictícios. Para entregar: persistência e autorização no servidor/banco, estados de erro e teste do fluxo real. | apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts |
| ORA-REPORT-008 | Dashboard expansão nacional por marketplace, ads e canais | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Receitas/fees/margens por canal. | backlog.json; sem implementação vinculada |

### QUAL — Segurança, qualidade, operação e compliance

| ID | Função exigida | Situação conferida | Pendência ou critério a provar | Evidência |
|---|---|---|---|---|
| ORA-QUAL-001 | CI, lint, typecheck, testes e code review obrigatórios | Parcial | CI com lint, tipos, testes, build, auditoria, E2E, rastreabilidade e detector de segredos nos arquivos, nos commits do PR e nos commits de cada envio à main (REV-003). Proteção da main não ativada; merges diretos pelo Claude Code por decisão de 07/11. | .github/workflows/ci.yml |
| ORA-QUAL-002 | RLS e autorização negada por padrão, testadas por loja | Parcial | RLS negando por padrão, testada com várias lojas, perfis e duas organizações. Defeitos de isolamento REV-001/REV-002 corrigidos em 07/11 com regressões; aguardando revisão do Codex antes de voltar a 'testado'. | packages/banco/src/acesso.test.ts; packages/banco/src/revisao-codex.test.ts |
| ORA-QUAL-003 | Auditoria imutável de operações e aprovações críticas | Parcial | Auditoria só de inserção, inclusive para o dono do banco. Operações críticas futuras (venda, caixa, aprovação) ainda não existem. Desde 08/11: auditoria automática das mudanças de acesso e configuração (ORA-ORG-005) e livro de estoque imutável (ADR-003). | acesso.test.ts (T9); packages/banco/src/auditoria-acesso.test.ts; packages/banco/src/catalogo-estoque.test.ts |
| ORA-QUAL-004 | Segredos em ambientes seguros sem exposição no Git/cliente | Parcial | Detector de segredos (arquivos, commits do PR e do envio à main), validação de variáveis na inicialização e no login, chave pública conferida (sem secreta nem service_role). REV-003/REV-004 corrigidos em 07/11; grupos do verificar-env alinhados nas instruções e login sem exigir o grupo servidor (CONFIG-001, 08/11); aguardando revisão do Codex. | packages/config/src/segredos.ts; packages/config/src/ambiente.ts; packages/config/src/historico-segredos.test.ts; packages/config/src/verificar-env.test.ts |
| ORA-QUAL-005 | Backups e ensaio de restauração de banco e anexos | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: RPO/RTO definidos com responsável e evidência. | backlog.json; sem implementação vinculada |
| ORA-QUAL-006 | Observabilidade de erros, latência, filas e conciliação | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Alertas e dashboards com dono e severidade. | backlog.json; sem implementação vinculada |
| ORA-QUAL-007 | Migrations versionadas, não destrutivas, testadas | Parcial | Seis migrations versionadas e aplicadas do zero nos testes. Em 08/11 o Codex confirmou versão, nome e hash iguais ao histórico remoto, além dos objetos comparados; REV-018/#17 encerrado. Reversões lidas, destinadas só a banco descartável, não executadas nesta revisão. Faltam homologação, procedimento de produção e correções de estoque por migration nova (#19 a #22). | packages/banco/supabase |
| ORA-QUAL-008 | Plano de contingência para internet, pagamentos e fiscal | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Equipe piloto sabe como operar com segurança. | backlog.json; sem implementação vinculada |
| ORA-QUAL-009 | Piloto com testes de usuário, caixa e fechamento diário | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Critérios de go/no-go assinados. | backlog.json; sem implementação vinculada |
| ORA-QUAL-010 | Performance mobile e testes em dispositivos/internet reais | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: SLOs aprovados e comparados com resultado. | backlog.json; sem implementação vinculada |
| ORA-QUAL-011 | LGPD: bases legais, retenção, direitos do titular e minimização | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Encarregado/jurídico revisa e aprova políticas. | backlog.json; sem implementação vinculada |
| ORA-QUAL-012 | Testes de carga, concorrência e disaster recovery | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Sem venda/IMEI duplo, serviço retorna ao estado previsto. | backlog.json; sem implementação vinculada |
| ORA-QUAL-013 | Processo de resposta a incidentes e suporte às lojas | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Playbook, contatos e rastreio de incidentes. | backlog.json; sem implementação vinculada |
| ORA-QUAL-014 | Análise de segurança periódica e monitoramento de dependências | Não iniciado | Não foi localizada entrega vinculada a este requisito. Critério do planejamento: Atualizações e vulnerabilidades triadas. | backlog.json; sem implementação vinculada |

## Escopo adicional ainda sem IDs oficiais

A assistência técnica foi decidida depois do catálogo original e aparece no mockup, mas não possui requisitos próprios no denominador 172. A proposta ORA-OS-001 a ORA-OS-006 deve ser formalizada e priorizada: abrir OS/custódia, orçamento técnico, aprovação do cliente, devolução/entrega, avisos e atribuição da comissão. P5 define o acesso do técnico. Isso é uma lacuna de rastreabilidade, não seis funções implementadas. O aceite fiscal, repasse das financeiras, formato do CSV, parâmetros de desconto e acesso Nogle também continuam exigindo as decisões indicadas no planejamento.

Fontes: [backlog](../../backlog.json), [status](../alinhamento/status-requisitos.json), [rastreabilidade gerada](../alinhamento/RASTREABILIDADE.md), [pendências do proprietário](../PENDENCIAS_DO_PROPRIETARIO.md), ADRs 001/002/003 e decisões recentes registradas no repositório. A conversa privada do link de projeto ChatGPT não ficou acessível; nenhuma decisão foi atribuída a ela nesta revisão.
