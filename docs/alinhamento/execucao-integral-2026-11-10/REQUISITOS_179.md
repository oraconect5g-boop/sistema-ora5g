# Matriz completa de execução — 179 requisitos

**Base:** `0b6b45ebb3387862c3e8eeb61cdd86afa79a9d82`. Estados abaixo são os declarados no repositório, não novos aceites do Codex. Contagem: {'parcial': 47, 'testado': 19, 'nao_iniciado': 104, 'respeitado': 1, 'demonstracao': 6, 'bloqueado': 2}. Todos os IDs aparecem uma vez. A lista de dependências original é preservada; deve ser detalhada com o grafo real durante a implementação, sem inventar aprovação de regra de negócio.

Para encerrar cada item: localizar implementação já existente; concluir o que falta; integrar frontend, domínio, banco, autorização e terceiros quando aplicável; testar critérios positivos/negativos; registrar evidência por SHA e aceite; manter a versão publicada rastreável. A existência de tela/fixture/adapter sem contrato não encerra requisito.

**Precedência:** as notas abaixo reproduzem o registro de implementação e podem carregar trechos históricos. Confrontar com PROMPT_MESTRE, ESTADO_VERIFICADO e decisões mais recentes antes de executar. Em particular, existem **11 lojas comerciais + DEFEITOS**; 14 é meta de expansão. A expressão histórica “cadastrar as 14 lojas reais” não autoriza criar unidades inexistentes. Correções já integradas não devem ser repetidas porque a nota ainda diz “aguardando conferência”.

## ORG — Organização, lojas e usuários (10 requisitos)

### ORA-ORG-001 — Cadastrar empresa, organização, 11 lojas comerciais, o local DEFEITOS e a loja piloto (meta de 14 lojas)

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Usuários autorizados selecionam unidade; IDs e dados fiscais coerentes.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Tabelas organização/empresa/unidade com CNPJ validado no banco; escolha real da loja na sessão (/escolher-loja; uma loja só é escolhida sozinha), gravada e auditada pelo banco. Falta cadastrar as 14 lojas reais (lista com CNPJs pendente) e a tela de gestão de lojas.
- Evidência declarada: packages/banco/supabase/migrations/20261107140352_fundacao_acesso.sql; packages/banco/src/acesso.test.ts (T10); apps/plataforma/src/app/escolher-loja; packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-002 — Associar usuários a uma ou múltiplas lojas com função e vigência

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Bloqueio testado para loja sem vínculo.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Vínculos com vigência e várias lojas por pessoa. Tela real /equipe ligada ao banco: convidar, dar loja ou função, encerrar acesso e bloquear, sempre com motivo e auditoria; mudança vale na sessão aberta (testado). Convite vira pessoa no Auth pelo worker (precisa SUPABASE_SECRET_KEY e SMTP). Falta: homologar com pessoas reais. Revisão do Codex (PR #33, trazida em 10/11): em 55d10af apontou #27 a #30 na gestão da equipe e na conclusão de convites; corrigidos no lote 1 (b967870), aguardando a conferência do Codex.
- Evidência declarada: acesso.test.ts (T1, T2/T3, T7); packages/banco/src/acesso-equipe.test.ts; apps/plataforma/src/app/equipe; apps/worker
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-003 — Gerir perfis diretoria, regional, gerente, vendedor, financeiro, fiscal, marketing e atendimento

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Matriz de autorização versionada e auditada.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: 5 papéis do ADR-002 (dono, administrador, gerente, vendedor, técnico) com matriz versionada por migration. Regional, financeiro, fiscal, marketing e atendimento entram depois por migration.
- Evidência declarada: migration fundacao_acesso (catálogo de papéis e permissões)
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-004 — Isolar dados por loja na API e PostgreSQL/RLS

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Testes de acesso cruzado e negação por ID arbitrário.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: RLS e funções do banco testadas, inclusive negação por ID arbitrário, troca de unidade e isolamento entre organizações (REV-001/REV-002 corrigidos em 07/11, aguardando revisão do Codex). As telas reais (equipe, catálogo, estoque, venda, caixa, Connect, notas e transferências) usam essas funções e o RLS. Revisão do Codex (PR #33, trazida em 10/11): #27 a #29 (bloqueio entre organizações, autoconvite e perda de donos), #45 (aprovação própria legível após bloqueio) e #56 (custo da carteira legível pelo vendedor); corrigidos no lote 1 (b967870), aguardando a conferência do Codex. Inventário de autorização (10/11, autorizacao-funcoes.test.ts): as 48 funções SECURITY DEFINER que um usuário logado pode chamar (aviso 0029 do Supabase) recusam 528 tentativas de 13 tipos de atacante (anônimo, sem login, sem sessão, sessão encerrada, fora do turno, bloqueado, vínculo encerrado, sem vínculo, papel sem permissão, outra rede, outra loja, outro vendedor e permissão faltando), sem mudar o banco; anônimo não executa nenhuma; o teste falha se surgir função nova sem casos (prova: 4 defeitos introduzidos de propósito foram pegos).
- Evidência declarada: packages/banco/src/acesso.test.ts; packages/banco/src/revisao-codex.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-005 — Histórico de alterações de papéis, políticas e configurações

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Auditoria identifica ator, horário, alvo e motivo.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Auditoria automática (gatilho) em organizações, empresas, unidades, perfis, papéis, permissões, matriz papel × permissão, vínculos e categorias: ator, horário, alvo, antes/depois e motivo, separada por organização (REV-002). Aplicada no ora5g-dev em 08/11. Conferido pelo Codex em 08/11 nos testes de banco e na correspondência dos objetos remotos. Homologação pelo proprietário e uso por usuário real continuam pendentes.
- Evidência declarada: packages/banco/supabase/migrations/20261108150432_auditoria_automatica_acesso.sql; packages/banco/src/auditoria-acesso.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-006 — Login, recuperação de conta e revogação de sessão

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Acessos revogados deixam de funcionar; mensagens neutras.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Login real com escolha da loja, sessão por turno no banco (sessão viva no Auth, até 12 h e no mesmo dia: sair ou revogar corta o acesso na hora, mesmo com token válido), bloqueio e encerramento de vínculo imediatos, saída forçada com mensagem neutra, convite e recuperação por link com definição de senha. Testado no banco (acesso-equipe.test.ts) e nas regras/E2E do app. FALTA: SMTP e modelos de e-mail no painel (proprietário), prova com usuário real (#11, depende da SUPABASE_SECRET_KEY) e confirmação de senha recente para ações da equipe (ADR-002 §2.6). Revisão do Codex (PR #33, trazida em 10/11): #27 a #30 e #45 (aprovação própria legível com token anterior); corrigidos no lote 1 (b967870), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql; packages/banco/src/acesso-equipe.test.ts; apps/plataforma/src/lib/acesso; apps/plataforma/e2e/acesso-real.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-007 — Autenticação reforçada para perfis privilegiados

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: MFA e política de sessão validados com segurança.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-008 — Configurar horários, endereços, caixas e dados fiscais por loja

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Mudanças versionadas com regras de vigência.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-009 — Gerir unidades regionais, grupos e metas agregadas

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Relatórios respeitam hierarquia de acesso.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ORG-010 — Preparar multi-CNPJ/UF para expansão física nacional

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Vínculos fiscais e locais operam sem dados globais hard-coded.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## CAT — Catálogo e precificação (11 requisitos)

### ORA-CAT-001 — Cadastrar categorias, marcas, produtos, variantes e SKUs

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: SKU interno identificado e único no escopo definido.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Categorias, marcas, produtos por tipo e variações com SKU e código de barras únicos no banco (ADR-003 proposto, aplicado no ora5g-dev em 08/11). Falta: tela real de cadastro e importação da Rein (ORA-009, depende do arquivo). Desde 08/11 (noite): tela real /catalogo lendo pelo RLS, sem custo para quem não tem custo.ver. 09/11 (lote 3): busca por nome, SKU e nome da variante feita no banco antes do limite (#40).
- Evidência declarada: packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts; apps/plataforma/src/app/catalogo/busca.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-002 — Importar produtos e preços da Rein somente por CSV/XLSX

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Prévia, validação, relatório de erro, confirmação e rollback lógico.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-003 — Não consumir API Rein em nenhuma operação diária

- Prioridade declarada: **P0**. Estado declarado: **respeitado**.
- Aceite original: Nenhum módulo de runtime depende de rede/credencial Rein.
- Ação: Manter a restrição no código, nas integrações e nos testes.
- Nota atual da implementação: Nenhum código usa a API da Rein. Importação só por arquivo (DEC-U04/DEC-U24).
- Evidência declarada: busca no repositório
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-004 — Cadastrar preços vigentes por loja/canal conforme regra

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Preço final tem origem explicável e histórico.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Preço com histórico por loja e canal, campanha com período e preço vigente consultável em qualquer momento (preco_vigente), sem apagar o anterior. Falta: alteração pela tela com preco.alterar e a gravação do preço na venda (ADR-004).
- Evidência declarada: packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-005 — Diferenciar smartphone, acessório, chip e serviço comercial

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Tipos exigem campos apropriados sem tabelas isoladas de venda.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Tipos no banco iguais aos de packages/dominio, com exigências: aparelho só com IMEI, chip só com ICCID, acessório por quantidade, serviços sem estoque. Falta a venda real (ADR-004).
- Evidência declarada: packages/dominio/src/venda.ts; packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-006 — Pesquisar por nome, SKU e, quando aplicável, IMEI/ICCID

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Busca rápida funciona no celular sem leitor.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Validação de IMEI (dígito verificador), ICCID e CPF prontas e testadas; busca por nome, marca, SKU, código de barras e final do IMEI na demonstração. Falta a busca no banco. Revisão das telas (10/11): a mesma busca no catálogo, no estoque e no PDV (lib/catalogo/busca.ts): nome do produto, nome da variação, SKU, IMEI, segundo IMEI e ICCID; antes só o catálogo achava pelo nome do produto e o PDV não via o segundo IMEI (busca.test.ts).
- Evidência declarada: packages/dominio/src/identificadores.ts; apps/plataforma/src/app/demo/vender/PDV.tsx
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-007 — Programar vigência de promoções e campanhas comerciais

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Preço aplicado respeita período e autorização.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-008 — Custo de produto/lote/entrada e margem gerencial

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: Custo histórico de venda não muda retroativamente.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Custo com histórico, visível só com custo.ver (vendedor não vê; testado). Falta custo por entrada/lote nas compras (ORA-INV-009).
- Evidência declarada: packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-009 — Canais externos usam mapeamento de SKU e IDs próprios

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Identificadores externos não substituem PK interna.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-010 — Permitir importação assistida em lote de fotos/atributos

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Erros não criam duplicatas nem sobrescritas silenciosas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CAT-011 — Exigir foto principal por produto e imagem própria para variantes visualmente diferentes

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Todos os produtos do catálogo piloto têm foto correspondente; busca, estoque e PDV exibem foto com nome/SKU e ampliação no celular; ausência de imagem é pendência, não foto genérica aceita.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Implementado em desenvolvimento (08/11): bucket privado no Storage com RLS por organização (vendedor vê, dono e gerente enviam: catalogo.fotos), caminho como identidade estável e URL assinada temporária, registro no banco com tamanho e tipo vindos do Storage, troca que guarda a anterior, ilustração só para item não físico, pendências (produto sem foto e cor sem foto própria) e tela /catalogo com miniatura, ampliação e envio pelo celular (redução no aparelho). FALTA: homologar com fotos reais e usuário real (critérios da #26), limpeza de arquivo enviado sem registro. 09/11 (lote 3): registro da mesma foto idempotente (#42), nova tentativa não reenvia o arquivo, foto quebrada volta com URL nova (#41), descartar libera o arquivo (#43); fixture de componentes do Codex verde. Fotos também no estoque real (/estoque) e no PDV real (/vender).
- Evidência declarada: packages/banco/supabase/migrations/20261108204536_fotos_dos_produtos.sql; packages/banco/src/fotos-produto.test.ts; apps/plataforma/src/app/catalogo; apps/plataforma/src/lib/catalogo; packages/banco/src/fotos-lote3.test.ts
- Dependências originais: ORA-CAT-001: produtos e variantes; ORA-ORG-004: autorização por organização e papel; docs/alinhamento/FOTOS_DOS_PRODUTOS_2026-11-08.md

## INV — Estoque, serial/IMEI e suprimentos (12 requisitos)

### ORA-INV-001 — Manter disponibilidade por loja e localização física

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Reserva/venda nunca usa saldo de outra loja sem transferência.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Saldo por loja no banco, isolado por RLS, e tela real /estoque: saldo da loja do turno com foto (ampliação no celular) com busca por nome/SKU, alerta abaixo do mínimo, busca por IMEI/ICCID com o histórico do livro e disponibilidade na rede sem IMEI. Falta: transferência entre lojas (ORA-INV-007) e homologação com usuário real. 09/11 (lote 3): busca por nome/SKU no banco antes do limite dos saldos (#40). 09/11 (lote 5, ADR-007): painel "onde tem" com físico, reservado, disponível e chegando por local, DEFEITOS à parte; pedido interno de transferência (pedir, separar, enviar, receber e conferir, recusar e cancelar).
- Evidência declarada: packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts; apps/plataforma/src/app/estoque; apps/plataforma/src/lib/estoque/regras.test.ts; apps/plataforma/src/app/estoque/page.tsx; packages/banco/src/transferencias.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-002 — Identificar aparelho por IMEI/serial e impedir venda duplicada

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Concorrência e unique indexes bloqueiam duplicidade.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: IMEI, IMEI2 e ICCID num conjunto único por organização (REV-020/#19 corrigido por migration nova, aplicada no ora5g-dev em 08/11). Provado com duas conexões simultâneas num PostgreSQL 17 real: mesmo IMEI em duas entradas, IMEI de um × IMEI2 de outro e o mesmo aparelho disputado por dois vendedores. Correção conferida pelo Codex em 08/11 na base 55d10af (reproduções independentes e concorrência passaram; #19 a #22 encerradas; PR #33). A venda real consome a reserva e lança a saída na mesma transação (ADR-004). Não é homologação operacional.
- Evidência declarada: packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql; packages/banco/src/integridade-estoque.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-003 — Registrar cada entrada/saída em livro auditável de estoque

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Saldo reconciliável com movimentos e motivos.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Livro só de inserção; saldo = soma do livro e posição de cada aparelho/chip controlada pelo próprio livro, com o item travado (REV-022/#21 e REV-023/#22 corrigidos; saída legítima voltou a funcionar: o upsert antigo recusava toda saída). privado.divergencias_estoque() confere livro × saldo × itens × reservas e a migration só termina sem divergência. Regressões e concorrência real passando. Correção conferida pelo Codex em 08/11 na base 55d10af (PR #33). Revisão do Codex (PR #33, trazida em 10/11): #34 (repetição com conteúdo diferente) e #51 (cancelamento devolvendo item sem conferência) corrigidos no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql; packages/banco/src/integridade-estoque.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-004 — Receber estoque inicial validado por contagem real

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Divergências e aprovadores ficam registrados.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Conferência física do dia na tela /estoque: progresso, conferir pelo IMEI/ICCID digitado ou item a item, gravada e auditada pelo banco (conferir_item); relatório de divergências no banco. Falta: importação aprovada da Rein (arquivo), aprovadores do ajuste e inventário assinado.
- Evidência declarada: packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts; apps/plataforma/src/app/estoque
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-005 — Reservar estoque durante checkout e liberar em expiração/cancelamento

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Concorrência entre caixas e canais não vende duas vezes.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Reserva com prazo, liberação, vencimento e idempotência no banco; a mesma chave só repete a mesma reserva (REV-021/#20). Concorrência real provada: último item, mesma chave, liberação × nova reserva e vencimento disputado; a rotina de vencimento não espera item em venda. Liberar reserva de outra pessoa exige permissão e fica auditado. O carrinho real reserva e a conclusão consome a reserva (ADR-004). Falta agendar a rotina de vencimento.
- Evidência declarada: packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql; packages/banco/src/integridade-estoque.test.ts; packages/banco/src/concorrencia.test.ts; packages/banco/src/catalogo-estoque.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-006 — Bloquear venda de IMEI indisponível/transferido/reservado

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Mensagem operacional clara e sem mutações parciais.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: O banco recusa reservar ou movimentar IMEI/ICCID reservado, vendido, de outra loja ou já no estoque, com códigos próprios (OR002, OR003, OR005) e sem mudança parcial (item e lançamento juntos ou nenhum). Falta: mensagens na tela real.
- Evidência declarada: packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql; packages/banco/src/integridade-estoque.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-007 — Transferência entre lojas com trânsito/recebimento

- Prioridade declarada: **P1**. Estado declarado: **testado**.
- Aceite original: Origem e destino confirmam quantidades e divergências.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Transferência entre lojas (ADR-007, 09/11): pedir, separar (IMEI/ICCID escolhido e reservado na origem), enviar (sai pelo livro, em trânsito), receber e conferir (só o IMEI/ICCID enviado; falta vira divergência com explicação), recusar e cancelar antes do envio; local DEFEITOS sem venda; painel "onde tem" e tela /transferencias. Testado em desenvolvimento; aguardando revisão do Codex. Falta o cadastro real das 11 lojas e do DEFEITOS (lista única, linha B2).
- Evidência declarada: packages/banco/supabase/migrations/20261109193043_transferencias_e_defeitos.sql; packages/banco/src/transferencias.test.ts; packages/banco/src/concorrencia.test.ts; apps/plataforma/src/app/transferencias
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-008 — Inventário cíclico e ajuste com aprovação

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Trilha permite reconstruir antes/depois e justificativa.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-009 — Compras e recebimento de fornecedores

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Pedido, nota/entrega, custo e entrada identificáveis.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-010 — Histórico de reparo/devolução e condição de unidade

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Produto retornado não reaparece automaticamente como novo.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-011 — Controle de ICCID de chip físico quando exigido

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: ICCID não é atribuído a duas ativações incompatíveis.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: ICCID com dígito verificador, único e controlado chip a chip (proposta Q4 do ADR-003). Falta: ligar à ativação da Nogle.
- Evidência declarada: packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql; packages/banco/src/catalogo-estoque.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-INV-012 — Transferência para CD e alocação futura a canais nacionais

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Apropriação de localização e logística auditável.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## CRM — Clientes, CRM, oportunidades e contratos (10 requisitos)

### ORA-CRM-001 — Cadastro de cliente com dados mínimos e finalidade

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Dados obrigatórios dependem da operação; LGPD documentada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-002 — Relacionar cliente às compras/IMEIs/chips/linhas e atendimentos

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Perfil 360 apresenta histórico autorizado por loja/função.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-003 — Pesquisar cliente por identificadores protegidos

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Resultados evitam expor CPF desnecessariamente.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-004 — Registrar lead, origem, atendente, vendedor responsável e etapa

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Funil mostra histórico e próximo passo.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-005 — Atividades, lembretes, follow-up e motivos de perda

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Histórico com autor e vencimento.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-006 — Detecção e mesclagem controlada de cadastros duplicados

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Não perde compras/documentos; operação auditável.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-007 — Registros de consentimento/preferência de comunicação

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Retirada afeta automações e respeita obrigações.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-008 — Contratos/anexos de venda, garantia, financiamento e telecom

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Acesso, assinatura, guarda e retenção adequados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-009 — Histórico omnichannel de compras físicas/online

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Pedido externo e venda vinculados sem sobrescrever origem.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CRM-010 — Segmentação comercial e valor de vida do cliente

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Segmentos minimizam dados e são explicáveis.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## POS — PDV mobile e vendas (16 requisitos)

### ORA-POS-001 — Efetuar venda completa em celular sem notebook

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: E2E em smartphone real da loja piloto.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: PDV real no celular (/vender) ligado ao banco: caixa, busca, carrinho com reserva, desconto com aprovação, pagamento misto, conclusão e comprovante. Regras do banco testadas (13 cenários e concorrência real). FALTA: E2E com usuário real em smartphone da loja piloto (depende da SUPABASE_SECRET_KEY para criar o usuário de teste) e homologação. Revisão do Codex (PR #33, trazida em 10/11): 371cef0 pediu correção de #45 a #53 (feita nos lotes 1 e 2, aguardando a conferência do Codex) e E2E autenticado com pessoa de teste, que segue pendente.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts; apps/plataforma/src/app/vender; apps/plataforma/src/app/caixa; apps/plataforma/src/app/aprovacoes; apps/plataforma/src/app/vendas
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-002 — Busca rápida por nome/SKU/IMEI e carrinho responsivo

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Usabilidade e velocidade validadas com vendedor.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Busca por nome, SKU e IMEI/ICCID com foto, preço vigente e quantidade livre na loja. FALTA: medir velocidade e validar com vendedor. Revisão das telas (10/11): o PDV usa a busca única: acha pelo nome do produto e pelo segundo IMEI; IMEI de 14 dígitos deixou de ser aceito como identificador.
- Evidência declarada: apps/plataforma/src/app/vender; apps/plataforma/src/app/caixa; apps/plataforma/src/app/aprovacoes; apps/plataforma/src/app/vendas
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-003 — Itens mistos em venda: aparelho, acessório, chip, ativação, recarga

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Itens mantêm natureza e regras próprias sem dupla contabilização.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Itens de aparelho, chip e acessório com estoque e serviço sem estoque mantêm o tipo do produto na venda; sem dupla contagem no livro. FALTA: ativação e recarga ligadas à Ora Connect (fila 11).
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-004 — Selecionar IMEI físico disponível antes de concluir

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Reserva e baixa atomizadas no banco.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Reserva do IMEI atômica (trava + índice único) ao pôr no carrinho; a conclusão consome a reserva e lança a saída 'venda' na mesma transação (ADR-004); reserva vencida barra a conclusão. Testado com concorrência real. FALTA: homologação com usuário real.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts; packages/banco/supabase/migrations/20261108195850_integridade_estoque.sql
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-005 — Calcular preço/desconto e totais server-side

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Cliente não consegue alterar preço enviado.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Preço lido do banco (preco_vigente) ao pôr no carrinho e conferido de novo na conclusão (preço mudou = OR007); totais, desconto e troco calculados no banco; o navegador só envia o pedido. Aguardando revisão do Codex. Revisão do Codex (PR #33, trazida em 10/11): #52 (valor ilegível virava zero na tela); corrigido no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-006 — Solicitar aprovação do gerente para desconto acima do limite

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Aprovador, limite, motivo, prazo e decisão auditáveis.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Pedido de aprovação com motivo, limite, validade de 30 min e conteúdo do item; aprova só quem tem desconto.aprovar e nunca quem pediu; mudar o item invalida; auditado. Sem política P14 todo desconto pede aprovação. Revisão do Codex (PR #33, trazida em 10/11): #45 (leitura da aprovação própria após revogação) e #53 (ordem das travas venda × aprovação) corrigidos nos lotes 1 e 2, aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts; apps/plataforma/src/app/aprovacoes
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-007 — Suportar múltiplos pagamentos na mesma venda

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Soma, troco, confirmação e estorno consistentes.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Pagamento misto com os 8 meios: soma, troco só de linha em dinheiro (banco = domínio, #48), comprovante em cartão e Pix também na entrada de financiamento (#46). Estorno no cancelamento: dinheiro líquido do troco com saldo conferido (#47/#49); cartão, Pix e financeira ficam a confirmar com o comprovante (#50). Link bloqueado até o provedor. Aguardando revisão do Codex. Revisão do Codex (PR #33, trazida em 10/11): 371cef0 rebaixou para parcial por #46 a #50; corrigidos no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts; packages/banco/src/integridade-lote2.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-008 — Vincular venda a vendedor, loja, cliente quando aplicável e canal

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Atribuição preservada em todas as consultas.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Venda gravada com loja, vendedor e canal; cliente por nome e e-mail até o CRM existir; RLS: vendedor vê as próprias, gerência a loja. FALTA: cliente do CRM. Revisão das telas (10/11): lista real /vendas: o vendedor vê as próprias vendas, a gerência a loja inteira com o nome de quem vendeu, a situação da nota e a devolução (vendas.test.ts, banco simulado).
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-009 — Consultar status e comprovantes sem concluir pagamento pendente

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Vendedor vê pendência e ação de reprocessamento segura.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Revisão das telas (10/11): lista real /vendas com período, situação e número, e o comprovante de cada venda; antes não havia como voltar a uma venda concluída. FALTA: pagamento pendente com reprocessamento (link de pagamento, linha E1).
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-010 — Cancelar e devolver sem apagar origem

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Reversão reflexa em estoque, pagamentos, fiscal e comissões.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Cancelamento total sem apagar (ADR-004) e devolução parcial (adendo de 09/11): a gerência devolve itens com motivo; estoque volta pelo livro com a condição informada; reembolso só nos meios pagos e até o que cada um pagou — cancelamento e devolução: o dinheiro sai do caixa; cartão, Pix e financeira ficam como estorno a confirmar com o comprovante (#50); no cancelamento os itens esperam o retorno conferido por IMEI/ICCID e condição (#51), e a devolução também confere o IMEI/ICCID. Item avariado ainda volta à loja com a condição registrada (DEFEITOS é o #60). Política comercial (D-026) pendente. Revisão do Codex (PR #33, trazida em 10/11): #47, #49, #50 e #51 corrigidos no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261109134507_devolucao_e_troca.sql; packages/banco/src/devolucao.test.ts; packages/dominio/src/pagamento.test.ts; apps/plataforma/src/lib/vendas/regras.test.ts; apps/plataforma/src/app/vendas/[id]/page.tsx; apps/plataforma/src/app/vender/acoes.ts; apps/plataforma/src/app/vender/page.tsx; packages/banco/src/integridade-lote2.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-011 — Gerar solicitação fiscal a partir da venda em poucos toques

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Vendedor não precisa escolher documento fiscal incorreto.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-012 — Troca com diferença de preço e meios de pagamento

- Prioridade declarada: **P1**. Estado declarado: **testado**.
- Aceite original: Histórico e estoque correto na devolução/saída.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Troca: a devolução vira vale-troca (crédito na rede, sem dinheiro) e o vale paga a nova venda até o saldo, com a diferença em qualquer meio; sem troco do vale; vale sem saldo ou inexistente é recusado; o cancelamento da nova venda devolve o saldo. Histórico (devolução, itens, reembolsos, usos do vale) só de inserção. Política comercial (prazo, estado aceito) pendente: D-026.
- Evidência declarada: packages/banco/supabase/migrations/20261109134507_devolucao_e_troca.sql; packages/banco/src/devolucao.test.ts; packages/dominio/src/pagamento.test.ts; apps/plataforma/src/lib/vendas/regras.test.ts; apps/plataforma/src/app/vendas/[id]/page.tsx; apps/plataforma/src/app/vender/acoes.ts; apps/plataforma/src/app/vender/page.tsx
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-013 — Venda parcelada/PayJoy/boleto por fluxo homologado

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: Etapas reais, aprovação e termos exigidos.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: PayJoy/Aiva: preço, entrada (com o meio) e restante a receber da financeira, sem juros; e-mail obrigatório na PayJoy. FALTA: prazo/taxa do repasse (P8) e termos da financeira. Revisão do Codex (PR #33, trazida em 10/11): #46 (entrada sem comprovante) e #48 (financiamento acima do preço) corrigidos no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-014 — Aplicar campanhas, combos e regras por loja

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Persistência da regra aplicada para auditoria.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-015 — Atalhos para supervisor e estados offline/sem rede

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem venda presumida como concluída sem confirmação.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-POS-016 — Entrada por leitor USB/Bluetooth ou câmera

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem mudança na regra central de busca/checkout.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## PAY — Pagamentos, PicPay e caixa (14 requisitos)

### ORA-PAY-001 — Registrar dinheiro, Pix direto, Pix PicPay POS e cartões

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Provider, terminal, método e comprovante quando disponível.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Dinheiro, Pix direto, Pix e cartão na maquininha PicPay, cartão PagSeguro registrados com comprovante e quem conferiu. FALTA: identificação do terminal (PAY-012). Revisão do Codex (PR #33, trazida em 10/11): #46 (comprovante na entrada de financiamento) corrigido no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-002 — Suportar financiamento, boleto, parcelamento e pagamentos online

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Estados e elegibilidade definidos por integração específica.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Regra da venda financiada PayJoy/Aiva (DEC-U38) e e-mail obrigatório na PayJoy (DEC-U30) testadas. Registro real da venda financiada e conta a receber pela ADR-004; #46 a #49 corrigidos no lote 2 (c071968). Falta o repasse (P8, E2) e os termos da financeira.
- Evidência declarada: packages/dominio/src/pagamento.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-003 — Diferenciar autorizado, pago, liquidado, estornado e conciliado

- Prioridade declarada: **P0**. Estado declarado: **demonstracao**.
- Aceite original: Relatórios não misturam venda com dinheiro recebido.
- Ação: Implementar fluxo persistente real, regras, autorização e testes; preservar referência visual.
- Nota atual da implementação: Situação por meio de pagamento separando autorizado, pago, liquidado e conciliado na tela de caixa. Só dados fictícios.
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-004 — Abrir caixa com saldo inicial e responsável

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Uma sessão ativa segundo regra por gaveta/terminal.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Caixa por pessoa e loja com fundo de troco; um aberto por vez; idempotente. Revisão do Codex (PR #33, trazida em 10/11): #47 (estorno de entrada deixava o caixa negativo) e #52 (fundo inválido virava zero) corrigidos no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts; apps/plataforma/src/app/caixa
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-005 — Registrar sangria, suprimento, reforço, devolução e saída autorizada

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Cada movimento tem motivo, autor e impacto no saldo.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Suprimento e sangria com motivo, autor e efeito no dinheiro da gaveta; sangria não passa do dinheiro; lançamentos só de inserção. FALTA: 'saída autorizada' com aprovação da gerência (D-017).
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-006 — Fechar caixa com valor contado e diferença

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Gerente confere e aprova divergência.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Fechamento com contagem, diferença e explicação obrigatória quando há diferença; conferência por outra pessoa com caixa.conferir. Aguardando revisão do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-007 — Conciliação manual PicPay POS usando referência/comprovante

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Sem API não se presume liquidação automática.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Comprovante registrado em cada pagamento de maquininha e Pix (confirmação manual, sem presumir liquidação). FALTA: tela de conciliação com o extrato. Revisão do Codex (PR #33, trazida em 10/11): #46 e #50 (estorno sem comprovante) corrigidos no lote 2 (c071968), aguardando a conferência do Codex.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-008 — Evitar confirmação duplicada via webhook/retry

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Constraints de evento externo e idempotency key.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Conclusão da venda idempotente (mesma chave, mesmo resultado; repetição simultânea testada em PostgreSQL real). Webhooks ainda não existem (link bloqueado).
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-009 — Importar extratos de adquirente/banco por arquivo validado

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Linhas conciliadas, discrepâncias e taxas reportadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-010 — Reconciliar taxas, parcelas e datas de repasse

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Venda bruta vs líquido recebido visíveis.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-011 — Gerir chargebacks, estornos, antecipação e ajustes

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Efeito financeiro e comissão não duplicado.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-012 — Permitir múltiplas maquininhas/provedores por loja

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Terminal tem identificação e escopo correto.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-013 — Integração automática com PicPay POS se API contratual confirmada

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Contrato, autenticação, eventos e homologação aprovados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PAY-014 — Pix/checkout web e links por provedores validados

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Confirmação no backend antes de fulfill/baixa definitiva.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## FIN — Financeiro e controladoria (10 requisitos)

### ORA-FIN-001 — Resumo diário de vendas x recebimentos x produção comercial

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Categorias e status reconciliáveis.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Financeiro real, lote 1 (#65, 10/11): vendas concluídas, devoluções e cancelamentos, e pagamentos registrados (recebido na loja, troco descontado, entradas de financiamento), por dia ou hora, da loja do turno ou da rede, somados no banco (financeiro_painel). Resumo de hoje também no /inicio. FALTA: produção comercial (metas e Ora Connect), liquidação e conciliação.
- Evidência declarada: packages/banco/supabase/migrations/20261110224537_financeiro_painel.sql; packages/banco/src/financeiro-painel.test.ts; apps/plataforma/src/lib/financeiro; apps/plataforma/src/app/financeiro
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-002 — DRE/margem gerencial com custo, taxa e desconto

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Números não são apresentados como contabilidade formal auditada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-003 — Contas a receber ligadas a venda, vencimento e meio

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Aging e status dependem de confirmação.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Contas a receber das financeiras ligadas à venda e ao pagamento, abertas até o recebimento; canceladas no estorno. FALTA: vencimento (P8), baixa e aging.
- Evidência declarada: packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql; packages/banco/src/vendas.test.ts; packages/banco/src/concorrencia.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-004 — Contas a pagar ligadas a fornecedor/origem

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Vencimentos e responsabilidades autorizadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-005 — Rastrear recebíveis e repasses por loja/adquirente

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Diferenças e pendências visíveis ao financeiro.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-006 — Conciliação bancária e contas multiempresa

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Imports/matches reproduzíveis com aprovação.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-007 — Gestão de inadimplência e cobranças autorizadas

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Ações e consentimentos com auditoria.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-008 — Relatório financeiro consolidado por loja/região/rede

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: RBAC respeita visão global vs local.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Real em /financeiro (lote 1 da #65): loja do turno e rede inteira (só com venda.ver_todas), com gráficos, tabelas e detalhamento. FALTA: região (não existe no cadastro), contas, conciliação e DRE. A tela da demonstração continua com dados fictícios.
- Evidência declarada: packages/banco/supabase/migrations/20261110224537_financeiro_painel.sql; packages/banco/src/financeiro-painel.test.ts; apps/plataforma/src/lib/financeiro; apps/plataforma/src/app/financeiro
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-009 — Exportações CSV/XLSX/PDF de relatórios autorizados

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: Filtros e dados sensíveis protegidos.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Real: /financeiro/exportar gera CSV de vendas, pagamentos, devoluções e caixas do período, lote a lote (todas as linhas, até 20 mil), com a mesma permissão e escopo da tela (#65, 10/11). Na demonstração, CSV das telas com dados fictícios. XLSX e PDF ainda não. Texto que a planilha leria como fórmula sai neutralizado (#38).
- Evidência declarada: apps/plataforma/src/app/financeiro/exportar/route.ts; apps/plataforma/src/lib/csv.ts; apps/plataforma/src/app/financeiro/financeiro.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FIN-010 — Previsão de fluxo de caixa e simulações

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Premissas explicadas e separadas de fatos.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## PERF — Vendedor, metas, comissões e bonificações (10 requisitos)

### ORA-PERF-001 — Contar individualmente aparelhos, acessórios, chips, ativações e recargas

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Painel por vendedor/loja/período sem duplicidade.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Contagem de produção por categoria (aparelho, acessório, chip, ativação só confirmada, recarga) em regra pura testada. Falta ledger de performance no banco.
- Evidência declarada: packages/dominio/src/venda.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-002 — Registrar performance_event único por origem/ação confirmada

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Retries de API não criam duas bonificações.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-003 — Distinguir quantidade, valor bruto, margem, receita elegível e comissão

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Extrato explica cálculo de cada evento.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-004 — Definir meta por vendedor, loja, categoria e período

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Alteração não reescreve resultado histórico.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-005 — Painel do gestor mostra metas e resultados da equipe

- Prioridade declarada: **P0**. Estado declarado: **demonstracao**.
- Aceite original: Filtragem loja e perfil aplicada no servidor.
- Ação: Implementar fluxo persistente real, regras, autorização e testes; preservar referência visual.
- Nota atual da implementação: Painel do gestor com metas e produção de todos os vendedores do escopo; o vendedor vê só os próprios números. Só dados fictícios.
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-006 — Regras de bonificação por categoria/campanha/margem/escala

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Edição versionada e período de vigência.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-007 — Ajustar comissão por cancelamento/devolução conforme regra

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Comprovante de origem e reversão sem apagar histórico.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-008 — Apurar e aprovar fechamento de bonificação

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Totais detalhados, contestação e trilha de aprovação.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-009 — Metas coletivas/regional e rankings configuráveis

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Desempate transparente e autorização adequada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-PERF-010 — IA recomenda campanhas/metas com aprovação humana

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem alterar remuneração automaticamente.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## FISC — Fiscal, nota e conformidade (10 requisitos)

### ORA-FISC-001 — Solicitar nota diretamente da venda no celular

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Fluxo intuitivo e prefill de dados necessários.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Botão "Pedir nota fiscal" no comprovante da venda concluída (celular), com nome e CPF/CNPJ opcionais; idempotente; um pedido vivo por venda; isolamento de loja, rede e papel.
- Evidência declarada: packages/banco/supabase/migrations/20261109123757_fila_fiscal.sql; packages/banco/src/notas.test.ts; packages/dominio/src/fiscal.test.ts; apps/plataforma/src/app/notas; apps/plataforma/src/app/vendas/[id]/page.tsx; docs/adr/ADR-006-fila-fiscal-interna.md
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-002 — Fluxo interno de aprovação de solicitações pelo gestor conforme política

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Auditoria sem impedir obrigação legal de emissão.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Fila do dono/gerente por antiguidade da venda, aprovar ou pedir correção; a aprovação nunca segura a emissão (registrar a nota vale como aprovação, com evento); alerta de atraso só com o prazo e a fonte do contador.
- Evidência declarada: packages/banco/supabase/migrations/20261109123757_fila_fiscal.sql; packages/banco/src/notas.test.ts; packages/dominio/src/fiscal.test.ts; apps/plataforma/src/app/notas; apps/plataforma/src/app/vendas/[id]/page.tsx; docs/adr/ADR-006-fila-fiscal-interna.md
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-003 — Identificar perfil fiscal por produto/serviço/UF/CNPJ

- Prioridade declarada: **P0**. Estado declarado: **bloqueado**.
- Aceite original: Regras homologadas com contador/especialista.
- Ação: Concluir partes independentes e contrato verificável; registrar dependência exata antes da homologação.
- Nota atual da implementação: Depende do contador e do emissor fiscal (P7).
- Evidência declarada: docs/ESTADO_ATUAL_E_PASSAGEM.md §5
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-004 — Integrar provedor fiscal homologado para documento correto

- Prioridade declarada: **P0**. Estado declarado: **bloqueado**.
- Aceite original: Estados emitido/autorizado/rejeitado/contingência claros.
- Ação: Concluir partes independentes e contrato verificável; registrar dependência exata antes da homologação.
- Nota atual da implementação: Contrato do emissor (EmissorFiscal) com implementação bloqueada; emissão real só com emissor escolhido e homologado com o contador (A4).
- Evidência declarada: packages/dominio/src/fiscal.ts; docs/adr/ADR-006-fila-fiscal-interna.md
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-005 — Guardar chave, protocolo, referência e evidências legais com segurança

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Controle de acesso e retenção definidos.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Chave de acesso de 44 dígitos registrada com dígito e CNPJ da loja conferidos, única, com modelo, série e número; CPF/CNPJ só até a emissão. FALTA: protocolo, XML/PDF anexos e retenção definida com o contador.
- Evidência declarada: packages/banco/supabase/migrations/20261109123757_fila_fiscal.sql; packages/banco/src/notas.test.ts; packages/dominio/src/fiscal.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-006 — Tratar falha fiscal, reprocesso, contingência e cancelamento

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Nenhum documento duplicado nem venda marcada indevidamente.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Chave repetida recusada; venda cancelada cancela pedido sem nota; venda com nota emitida só cancela depois do tratamento fiscal (OR015). FALTA: reprocesso e contingência no emissor (A4).
- Evidência declarada: packages/banco/supabase/migrations/20261109123757_fila_fiscal.sql; packages/banco/src/notas.test.ts; packages/dominio/src/fiscal.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-007 — Mapear cenários NF-e/NFC-e/NFS-e/NFCom conforme natureza

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Matriz validada por contador com decisões por UF e operação.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-008 — Conciliação fiscal de vendas, tributos e documentos

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Pendências e divergências alertadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-009 — Devolução, troca, cancelamento e correção fiscal

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Fluxos e prazos homologados com fiscal.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-FISC-010 — Multi-UF/multi-CNPJ e reforma tributária preparada

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Alterações versionadas e conformes à norma vigente.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## CONNECT — Ora Connect, chips, ativações e recargas (11 requisitos)

### ORA-CONNECT-001 — Cadastrar e vender chip físico ligado ao estoque e vendedor

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Unidade/ICCID e venda reconciliáveis.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Chip vendido no PDV com ICCID do estoque (ADR-004); a ativação só aceita chip do estoque depois de vendido (OR011), fica ligada à venda do chip, e o chip ativado não volta ao estoque pelo cancelamento. Sem chamada real à Nogle: falta credencial no worker, P9 e linha de teste para homologar. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts; apps/plataforma/src/app/connect; apps/worker/src/connect; docs/adr/ADR-005-ora-connect-operacoes.md
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-002 — Separar evento de venda de chip do evento de ativação

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Quantidades, status, valor e comissão independentes.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Venda do chip, pedido de ativação, resposta da operadora e produção são registros separados; a produção nasce só da operação confirmada, uma vez (chave única). Sem chamada real à Nogle: falta credencial no worker, P9 e linha de teste para homologar. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-003 — Separar recarga como operação telecom com status próprio

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Total pago e valor repassado/receita reconhecida não confundidos.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Recarga é operação própria com estado; separa valor de face (lista oficial), recebido na loja (venda do serviço, obrigatório no SALDO) e debitado da carteira (histórico da Nogle). FALTA: receita da recarga por LINK (repasse, P8/D-009) e homologação. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts; apps/plataforma/src/app/connect; apps/worker/src/connect; docs/adr/ADR-005-ora-connect-operacoes.md
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-004 — Registrar Nogle como integração externa por adapter

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Sem endpoint presumido; contrato deve vir dos docs autenticados.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Adaptador só no worker do servidor (credenciais fora do web e do navegador); pedido só com campos documentados, provado contra a cópia oficial da coleção; GET com corpo só depois da confirmação da Nogle. Testado contra servidor local com os exemplos oficiais; nenhuma chamada real. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/dominio/src/nogle.ts; apps/worker/src/connect; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-005 — Refletir ativação somente após resposta verificada da Nogle

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Falhas ficam pendentes/revisão sem gerar sucesso falso.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Ativação só confirma com a evidência da operadora (ICCID ativo com a linha); resposta ambígua, sem resposta ou worker interrompido viram resultado desconhecido, sem sucesso falso nem reenvio; a gerência decide (não a própria operação). Sem chamada real à Nogle: falta credencial no worker, P9 e linha de teste para homologar. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-006 — Atribuir performance de ativação/recarga ao vendedor de origem

- Prioridade declarada: **P0**. Estado declarado: **testado**.
- Aceite original: Evento idempotente e elegibilidade transparente.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Produção por operação confirmada, do vendedor e da loja de origem, com origem (evidência da operadora ou revisão da gerência) e chave única por operação. Comissão sobre ela ainda não existe (P8). Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-007 — Consulta/atualização de linha e plano conforme API disponível

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: Permissão e rate limit respeitados.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Listas oficiais (planos, DDDs, cidades, operadoras) sincronizadas pelo worker e usadas na tela; consultas de evidência com intervalo crescente. FALTA: telas de consulta de linha, saldo e consumo e limites de chamada (não documentados). Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: apps/plataforma/src/app/connect; apps/worker/src/connect; docs/adr/ADR-005-ora-connect-operacoes.md; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-008 — Portabilidade, contrato e venda de plano conforme contrato

- Prioridade declarada: **P1**. Estado declarado: **parcial**.
- Aceite original: Jornada e documentos homologados.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Portabilidade registrada, enviada e acompanhada pelo status documentado; o exemplo contraditório da documentação fica como resultado desconhecido (pergunta 7). FALTA: contrato/venda de plano e homologação. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts; apps/plataforma/src/app/connect; apps/worker/src/connect; docs/adr/ADR-005-ora-connect-operacoes.md
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-009 — Reconciliar repasses/bonificações Nogle e operação local

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Divergências rastreáveis e reversão segura.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Nota atual da implementação: Carteira, extrato, cobrança/gateway, recorrência e repasses oficiais não implementados (#54). Respostas da Nogle de 10/11 (NOGLE_API_REFERENCIA.md §3.1): GET /saldo/extrato existe; a API não traz comissões. Persistir estados e correlação e homologar sem apresentar estimativa local como recebimento. Entrada vinda da PR #33 (Codex).
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-010 — Recuperar falha de rede com reconsulta sem reativação duplicada

- Prioridade declarada: **P1**. Estado declarado: **testado**.
- Aceite original: Idempotência/reconciliação externa aprovadas.
- Ação: Preservar, revisar provas e completar homologação; não reimplementar por status genérico do backlog.
- Nota atual da implementação: Sem conexão volta para a fila; conectou e não respondeu = desconhecido, nunca reenviado; envio interrompido expira para desconhecido; resposta atrasada ainda vale; dois workers não pegam a mesma operação (PostgreSQL 17 real). Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-CONNECT-011 — eSIM, contratação digital e entrega de chip nacional

- Prioridade declarada: **P2**. Estado declarado: **parcial**.
- Aceite original: Implementar somente se Nogle suportar e acordo permitir.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Ativação de eSIM pelo formato documentado (sem ICCID, "esim": "SIM"), com o ICCID e o link vindos da resposta. FALTA: confirmar com a Nogle (pergunta 11), compra com entrega e contratação digital. Revisão do Codex (PR #33, trazida em 10/11): 9b1109e reproduziu #55 a #59; corrigidos nos lotes 1 e 2, aguardando a conferência do Codex. Cobrança, carteira, recorrência e repasse (#54) ficam no ORA-CONNECT-009.
- Evidência declarada: packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql; packages/dominio/src/nogle.ts; packages/banco/src/connect.test.ts; packages/banco/src/concorrencia.test.ts; packages/dominio/src/nogle.test.ts; apps/worker/src/connect/ponta-a-ponta.test.ts; apps/worker/src/connect/transporte.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## ONLINE — E-commerce e vendas online (8 requisitos)

### ORA-ONLINE-001 — Site de aparelhos, acessórios e planos Ora Connect

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Catálogo e estoque centralizados; não criar outro sistema de venda.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-002 — Carrinho/checkout online e pedido com status

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Pagamento confirmado antes de liberar fulfillment.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-003 — Atribuir origem online, campanhas e vendedor quando aplicável

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem atribuição indevida ou dupla comissão.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-004 — Frete, CEP, retirada em loja e entrega com rastreio

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Reserva e prazos consistentes.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-005 — Devolução, arrependimento e reembolso de venda online

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Prazo/regra legal homologado e efeitos auditados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-006 — Reserva de IMEI por pedido/canal anti-overselling

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Pedido online concorrente com loja não vende unidade duplicada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-007 — Contratação online de planos/chips/eSIM se habilitado

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Validação de identidade/contrato, antifraude e cobertura.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-ONLINE-008 — Expansão interestadual com parâmetros fiscais e logísticos

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Multi-UF testado antes da abertura nacional.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## MKTPL — Marketplaces e channel manager (8 requisitos)

### ORA-MKTPL-001 — Preparar adaptadores separados Mercado Livre/Shopee/TikTok Shop

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Contratos e permissões confirmados antes do deploy.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-002 — Sincronizar SKU/preço/estoque/anúncio conforme recursos

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Evitam overselling e divergência detectável.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-003 — Importar pedido marketplace com ID externo e dedupe

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Reenvio de webhook não duplica pedido/reserva.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-004 — Tratar entrega/frete/etiquetas/rastreio por canal

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Estados de fulfillment corretos e não inventados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-005 — Conciliação de tarifas, comissões e repasses por marketplace

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Lucratividade por pedido/canal explicável.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-006 — Cancelamentos, devoluções e reembolsos por canal

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Estoque/financeiro/fiscal/commission reversos.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-007 — Sincronização near-real-time por webhooks/adapters

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Rate limits/retries monitorados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-MKTPL-008 — Métricas por anúncio/canal/produto e margem

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Valores reconciliados sem confundir receita bruta com líquida.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## WHATS — WhatsApp, atendimento e automação (8 requisitos)

### ORA-WHATS-001 — WhatsApp Business Platform oficial conectado ao CRM

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Conta/números/escopos homologados; templates válidos.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-002 — Caixa de entrada multiatendente com atribuição à loja/vendedor

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Mensagens e transferência auditadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-003 — Leads orgânicos e pagos identificados por origem consentida

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Campanha e UTM preservados quando disponíveis.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-004 — Histórico 360 de conversas/negócios por cliente

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Política de retenção/consentimento aplicada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-005 — Respostas rápidas, etiquetas, SLA e repasse para humano

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Handoff sempre acessível.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-006 — Templates e mensagens proativas em conformidade Meta

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem spam nem envio sem permissão/consentimento apropriado.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-007 — IA supervisionada para qualificação e sugestão de respostas

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Ações sensíveis exigem revisão e logs.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-WHATS-008 — Recuperação de carrinho e pós-venda sob consentimento

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Taxa de resposta/conversão mensurada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## META — Meta Ads e atribuição (6 requisitos)

### ORA-META-001 — Importar insights autorizados de Meta Ads por conta/campanha

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: OAuth/scopes revisados; dados de custo e período auditáveis.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-META-002 — Capturar UTM e origem de leads de site/WhatsApp

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Jornada vincula campanha, oportunidade e venda quando possível.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-META-003 — Mostrar gasto, CTR, CPC, CPL, CPA e ROAS quando calculáveis

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Fórmulas, período e limitações explicitadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-META-004 — Funil por vendedor/loja/campanha e atribuição

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Dupla contagem/dedup de conversões minimizada.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-META-005 — Conversions API/eventos com consentimento e dedupe

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem rastrear dados sem base legal/autorização.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-META-006 — Analisar margem e CAC por campanha

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Distingue métrica estimada de valor liquidado.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## AI — Inteligência artificial e análise (7 requisitos)

### ORA-AI-001 — Painéis básicos e alertas desde o MVP

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: KPIs operacionais calculados de fatos transacionais.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-AI-002 — IA auxilia atendimento e qualificação de leads

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Base de conhecimento versionada, revisão e handoff.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-AI-003 — IA sugere produtos, respostas e roteamento de cliente

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem enviar informações sensíveis não autorizadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-AI-004 — IA resume campanhas, metas e falhas operacionais

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Valores e fonte verificáveis; sem inventar dados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-AI-005 — Autorização humana obrigatória para operações financeiras/fiscais

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Auditoria de proposta/aprovador/execução.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-AI-006 — Controle de custo por chamada de modelo e retenção

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Orçamento configurável, logs redigidos e alertas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-AI-007 — Avaliação de qualidade e red-team de agentes

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Testes de prompt injection e permissões aprovados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## REPORT — Gestão, BI e relatórios (8 requisitos)

### ORA-REPORT-001 — Dashboard diretoria consolidado de todas as lojas (11 hoje; meta de 14)

- Prioridade declarada: **P0**. Estado declarado: **demonstracao**.
- Aceite original: Filtro por período, loja, vendedor, natureza e status.
- Ação: Implementar fluxo persistente real, regras, autorização e testes; preservar referência visual.
- Nota atual da implementação: Painel da rede (ou de uma loja escolhida no topo) com faturamento, meta, ranking das lojas, mix, recebimentos por meio, vendas por hora e alertas. Só dados fictícios.
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-002 — Dashboard gerente de loja: caixa, metas, aprovação de desconto/NF

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Só dados autorizados; alertas com link ao fato original.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Real: /inicio do gerente mostra o que espera a loja (aprovações, notas, caixas, transferências, Connect, estornos e retornos) e o financeiro de hoje; /financeiro tem caixas e fechamentos. FALTA: metas da equipe (módulo de metas não existe). A demonstração continua com o painel completo fictício.
- Evidência declarada: apps/plataforma/src/app/inicio/page.tsx; apps/plataforma/src/app/financeiro
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-003 — Dashboard vendedor mobile: produção do dia, metas e atalhos

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Dados apenas do escopo autorizado.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Início do vendedor no celular: meta do dia, produção por categoria, vendas por loja (vendedor em duas lojas) e atalhos. Só dados fictícios. Revisão das telas (10/11): o início real mostra o que espera a pessoa na loja (aprovações, notas, caixas a conferir, transferências, estornos, retornos e Ora Connect a decidir), cada contagem só para quem tem a permissão, e os atalhos do menu único. FALTA: produção do dia e metas (só na demonstração).
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-004 — Relatório de chips vendidos, ativações e recargas separadamente

- Prioridade declarada: **P0**. Estado declarado: **demonstracao**.
- Aceite original: Produção não implica faturamento tributável idêntico.
- Ação: Implementar fluxo persistente real, regras, autorização e testes; preservar referência visual.
- Nota atual da implementação: Relatório de chips, ativações, portabilidades e recargas por dia e por vendedor, só confirmadas. Só dados fictícios.
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-005 — Relatório por método de pagamento e terminal PicPay

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Distinção pagamento/pêndencia/liquidação/reconciliação.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Real em /financeiro (#65, lote 1): pagamentos confirmados por meio (dinheiro já sem troco, entradas de financiamento no meio pago), parte financiada a receber, vale-troca à parte, pagamentos de vendas canceladas e estornos pendentes × confirmados. FALTA: terminal PicPay e situação de liquidação/conciliação (sem extrato: E3).
- Evidência declarada: packages/banco/supabase/migrations/20261110224537_financeiro_painel.sql; packages/banco/src/financeiro-painel.test.ts; apps/plataforma/src/lib/financeiro; apps/plataforma/src/app/financeiro
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-006 — Relatórios de margem, vendedor e ranking configurável

- Prioridade declarada: **P1**. Estado declarado: **demonstracao**.
- Aceite original: Comissão/estorno reconciliáveis.
- Ação: Implementar fluxo persistente real, regras, autorização e testes; preservar referência visual.
- Nota atual da implementação: Relatórios de margem, ticket, descontos e ranking de lojas e vendedores por período (7, 14 e 30 dias), com exportação CSV. Ranking para o vendedor aguarda a decisão P3.
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-007 — Alertas de estoque mínimo/IMEI/caixa divergente/fiscal pendente

- Prioridade declarada: **P1**. Estado declarado: **demonstracao**.
- Aceite original: Notificação contextual e auditada.
- Ação: Implementar fluxo persistente real, regras, autorização e testes; preservar referência visual.
- Nota atual da implementação: Alertas de estoque mínimo, caixa divergente, nota parada, OS parada e ativação com falha, no sino e no painel. Só dados fictícios.
- Evidência declarada: apps/plataforma/src/app/demo; apps/plataforma/e2e/demonstracao.spec.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-REPORT-008 — Dashboard expansão nacional por marketplace, ads e canais

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Receitas/fees/margens por canal.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## QUAL — Segurança, qualidade, operação e compliance (14 requisitos)

### ORA-QUAL-001 — CI, lint, typecheck, testes e code review obrigatórios

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: PR sem CI verde não libera merge.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: CI com lint, tipos, testes, build, auditoria, E2E, rastreabilidade e detector de segredos nos arquivos, nos commits do PR e nos commits de cada envio à main (REV-003). Proteção da main não ativada; merges diretos pelo Claude Code por decisão de 07/11.
- Evidência declarada: .github/workflows/ci.yml
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-002 — RLS e autorização negada por padrão, testadas por loja

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Testes positivos e negativos com dois vendedores/lojas.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: RLS negando por padrão, testada com várias lojas, perfis e duas organizações. Defeitos de isolamento REV-001/REV-002 corrigidos em 07/11 com regressões; aguardando revisão do Codex antes de voltar a 'testado'. Inventário de autorização (10/11, autorizacao-funcoes.test.ts): as 48 funções SECURITY DEFINER que um usuário logado pode chamar (aviso 0029 do Supabase) recusam 528 tentativas de 13 tipos de atacante (anônimo, sem login, sem sessão, sessão encerrada, fora do turno, bloqueado, vínculo encerrado, sem vínculo, papel sem permissão, outra rede, outra loja, outro vendedor e permissão faltando), sem mudar o banco; anônimo não executa nenhuma; o teste falha se surgir função nova sem casos (prova: 4 defeitos introduzidos de propósito foram pegos).
- Evidência declarada: packages/banco/src/acesso.test.ts; packages/banco/src/revisao-codex.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-003 — Auditoria imutável de operações e aprovações críticas

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Prova quem fez o quê e quando.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Auditoria só de inserção, inclusive para o dono do banco. Operações críticas futuras (venda, caixa, aprovação) ainda não existem. Desde 08/11: auditoria automática das mudanças de acesso e configuração (ORA-ORG-005) e livro de estoque imutável (ADR-003). Revisão das telas (10/11): tela real /auditoria (auditoria.ver, pelo RLS): quem fez o quê e quando, na loja e na rede, com destaque para tentativas negadas e bloqueios; o antes/depois não aparece (pode ter dado pessoal).
- Evidência declarada: acesso.test.ts (T9); packages/banco/src/auditoria-acesso.test.ts; packages/banco/src/catalogo-estoque.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-004 — Segredos em ambientes seguros sem exposição no Git/cliente

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Secret scanning e testes de configuração.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Detector de segredos (arquivos, commits do PR e do envio à main), validação de variáveis na inicialização e no login, chave pública conferida (sem secreta nem service_role). REV-003/REV-004 corrigidos em 07/11; grupos do verificar-env alinhados nas instruções e login sem exigir o grupo servidor (CONFIG-001, 08/11); aguardando revisão do Codex. Desde 08/11 (noite): o aplicativo web não recebe SUPABASE_SECRET_KEY nem DATABASE_URL (publicar.sh separa a cópia do worker, ADR-002 §2.5).
- Evidência declarada: packages/config/src/segredos.ts; packages/config/src/ambiente.ts; packages/config/src/historico-segredos.test.ts; packages/config/src/verificar-env.test.ts
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-005 — Backups e ensaio de restauração de banco e anexos

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: RPO/RTO definidos com responsável e evidência.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-006 — Observabilidade de erros, latência, filas e conciliação

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Alertas e dashboards com dono e severidade.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-007 — Migrations versionadas, não destrutivas, testadas

- Prioridade declarada: **P0**. Estado declarado: **parcial**.
- Aceite original: Revisão humana e rollback/roll-forward preparados.
- Ação: Concluir a parte faltante conforme nota e critérios; reutilizar a implementação atual.
- Nota atual da implementação: Sete migrations versionadas e aplicadas do zero nos testes; nome, versão e md5 iguais ao histórico do ora5g-dev (registro em aplicadas-dev.json, conferido por teste). A reversão de integridade_estoque é testada: volta funções, colunas, gatilhos e permissões ao estado anterior. Faltam homologação e procedimento de produção.
- Evidência declarada: packages/banco/supabase
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-008 — Plano de contingência para internet, pagamentos e fiscal

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Equipe piloto sabe como operar com segurança.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-009 — Piloto com testes de usuário, caixa e fechamento diário

- Prioridade declarada: **P0**. Estado declarado: **nao_iniciado**.
- Aceite original: Critérios de go/no-go assinados.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-010 — Performance mobile e testes em dispositivos/internet reais

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: SLOs aprovados e comparados com resultado.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-011 — LGPD: bases legais, retenção, direitos do titular e minimização

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Encarregado/jurídico revisa e aprova políticas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-012 — Testes de carga, concorrência e disaster recovery

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Sem venda/IMEI duplo, serviço retorna ao estado previsto.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-013 — Processo de resposta a incidentes e suporte às lojas

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Playbook, contatos e rastreio de incidentes.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

### ORA-QUAL-014 — Análise de segurança periódica e monitoramento de dependências

- Prioridade declarada: **P2**. Estado declarado: **nao_iniciado**.
- Aceite original: Atualizações e vulnerabilidades triadas.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: Verificar regras de negócio e critérios de aceite do domínio

## OS — Assistência técnica e ordens de serviço (6 requisitos)

### ORA-OS-001 — Abrir OS obrigatória para todo aparelho de cliente que entra (até limpeza), com cliente, IMEI, defeito, estado, fotos e acessórios deixados (custódia)

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Nenhum aparelho de cliente fica na loja sem OS numerada; fotos e acessórios registrados; isolamento por loja; auditoria.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: P5: o técnico terá login próprio? É funcionário ou terceiro?; DEC-U44, DEC-U47 e o fluxo digital da OS (docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2C)

### ORA-OS-002 — Registrar saída para o técnico central e retorno à loja (custódia em trânsito)

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: A posição do aparelho (loja, em trânsito, técnico, de volta) é conhecida a qualquer momento; parado além do prazo vira alerta ao dono.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: P5: o técnico terá login próprio? É funcionário ou terceiro?; DEC-U44, DEC-U47 e o fluxo digital da OS (docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2C)

### ORA-OS-003 — Orçamento do técnico dentro da OS (diagnóstico, peças, valor), com histórico

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: O orçamento sai do grupo de WhatsApp e fica na OS; técnico só vê e orça as próprias OS (T12 do teste de acesso).
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: P5: o técnico terá login próprio? É funcionário ou terceiro?; DEC-U44, DEC-U47 e o fluxo digital da OS (docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2C)

### ORA-OS-004 — Aprovação ou recusa do orçamento pelo cliente, registrada

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Nada é executado sem a resposta do cliente registrada (canal e momento); recusa encerra com devolução.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: P5: o técnico terá login próprio? É funcionário ou terceiro?; DEC-U44, DEC-U47 e o fluxo digital da OS (docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2C)

### ORA-OS-005 — Avisos ao cliente e ao técnico (comprovante, orçamento, aparelho pronto, entrega)

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Botão que abre o WhatsApp com a mensagem pronta até a API oficial; depois, envio pela API oficial com consentimento; sem automação não oficial.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: P5: o técnico terá login próprio? É funcionário ou terceiro?; DEC-U44, DEC-U47 e o fluxo digital da OS (docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2C)

### ORA-OS-006 — Entrega com cobrança pelo PDV e produção do vendedor; peças só saem do estoque ligadas a uma OS

- Prioridade declarada: **P1**. Estado declarado: **nao_iniciado**.
- Aceite original: Serviço cobrado na venda conta uma vez na produção; peça consumida sem OS aparece como divergência; relatórios de OS sem venda, por vendedor, tempo de conserto e peças × serviços.
- Ação: Implementar a fatia funcional completa e integrada, por dependências e critérios de aceite.
- Dependências originais: P5: o técnico terá login próprio? É funcionário ou terceiro?; DEC-U44, DEC-U47 e o fluxo digital da OS (docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md §2C)

## Divergências a reconciliar sem duplicar implementação

ORA-POS-011 ainda não aparece como implementado no registro, mas ORA-FISC-001 e a fila fiscal já cobrem solicitação de nota da venda. Conferir os aceites e atualizar o gerador em vez de criar outra fila. O lote financeiro mudou estados em relação aos relatórios anteriores: usar a nota atual, preservando DRE, conciliação e contas completas como pendências. Papéis de teste não criam gerentes reais em todas as lojas; o dado vigente de lojas é 11 comerciais mais DEFEITOS.
