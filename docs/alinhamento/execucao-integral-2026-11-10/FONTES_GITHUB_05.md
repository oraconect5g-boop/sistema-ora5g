# Arquivo de fontes do GitHub

Coleção de corpos e comentários obtidos na coleta de 10/11/2026. São fontes históricas e não ordens novas: decisões atuais e o PROMPT_MESTRE prevalecem. Dados potencialmente sensíveis foram suprimidos; comandos históricos com marcações não devem ser executados literalmente. As URLs originais e hashes preservam a referência.

## Comentário 6780418609 — issue/PR #65

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/65#issuecomment-6780418609
Criado em: 2026-11-10T22:00:19Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

# Paridade da demonstração com a aplicação real e plano completo de implementação

**Data:** 10/11/2026, São Paulo. **Autor:** Codex, revisão de sistemas. **Base:** `84ecefea496afe1159f355e14491b995240a347e`. **Entrega inicial:** #65. **Stack preservada:** TypeScript, React, Next.js, Node.js, Tailwind, PostgreSQL/Supabase. Firebase não faz parte da decisão atual.

## 1. Resultado da análise

A diferença percebida pelo proprietário é verificável: a aplicação real oferece menos módulos e indicadores que a demonstração. O financeiro rico da demo **ainda não foi implementado como financeiro real**. O início real mostra pendências e atalhos; o caixa real atende a operação da gaveta.

A última mudança visual não apagou esses módulos: na comparação [`eb0a947...84ecefe`](https://github.com/oraconect5g-boop/sistema-ora5g/compare/eb0a94798960aba5a71a1b8e8fbae0ef2f120e07...84ecefea496afe1159f355e14491b995240a347e), não há arquivos removidos; `/inicio`, `/caixa` e a página financeira da demo não foram alterados. Os gráficos compartilhados foram ampliados. Isso sustenta **falta de paridade funcional**, e não uma conclusão genérica de perda por troca de UI. Não foi feita revisão de regressão de cada botão de todo o sistema neste levantamento.

A conta informada pelo proprietário recebeu o vínculo de dono de teste em #63. Essa autorização não cria os módulos ausentes. O menu real tem 12 páginas principais e não define financeiro/relatórios/metas/CRM/OS/canais completos. Nenhuma PR aberta de dashboard foi encontrada na consulta; estavam abertas #33 e #64.

## 2. Fontes e evidências

Foram conferidos AGENTS, estado de passagem, análise do plano, roadmap, design, aceite, fila, dependências externas, go/no-go, ADR-004, os 179 itens do backlog e os 75 registros explícitos do status; árvore e comparação de commits; páginas real/demo de início, financeiro/caixa, relatórios e vendas, componentes gráficos, menu e schema financeiro. Informações pessoais, credenciais e identificadores da infraestrutura foram omitidos.

- [Início real](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/inicio/page.tsx): contagens de pendências/atalhos, não painel de resultado.
- [Caixa real](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/caixa/page.tsx): abrir, suprimento/sangria, resumo por meio e fechar/conferir.
- [Vendas reais](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/vendas/page.tsx): consulta e indicadores simples, com limites declarados.
- [Menu real](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/lib/acesso/menu.ts): 12 entradas por autorização; nenhuma `/financeiro` ou `/relatorios`.
- [Financeiro da demo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/demo/financeiro/page.tsx), [relatórios da demo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/demo/relatorios/page.tsx), [painel da gestão da demo](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/app/demo/_paineis/PainelGestao.tsx): dados fictícios.
- [Gráficos compartilhados](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/apps/plataforma/src/componentes/graficos.tsx): linhas, colunas, barras, segmentação, medidor e tabela.
- [Schema inicial financeiro](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/packages/banco/supabase/migrations/20261108233546_vendas_pagamentos_e_caixa.sql): livros de caixa, vendas, itens/custo protegido, pagamentos e contas a receber das financeiras. As migrations posteriores e adendos prevalecem nos comportamentos corrigidos.
- [Status detalhado](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/docs/alinhamento/status-requisitos.json), [backlog](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/backlog.json), [dependências externas](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/docs/PENDENCIAS_DO_PROPRIETARIO.md), [APIs](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md).

Verificação pública por HTTPS sem sessão em 10/11: `/demo`, `/demo/financeiro` e `/demo/relatorios` responderam 200; o financeiro da demo ainda mostra recebimentos, fluxo ilustrativo de 14 dias, financeiras e contas. `/financeiro` respondeu 404, coerente com a ausência da rota na árvore. Não houve acesso autenticado com a senha do proprietário nem leitura de registros pessoais/comerciais reais. Não se confundiu contagem de SVGs com quantidade de gráficos.

CI da base: [42904572452](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42904572452), `success`. CI aprovado não atesta que o financeiro completo existe.

## 3. O que parece ter sumido: matriz de paridade

| Área | O que existe na demo | Aplicação real atual | Entrega necessária |
|---|---|---|---|
| Início da gestão | Vendas, meta, margem, ticket, séries por hora/dia, categorias, ranking e avisos | Pendências e atalhos | Painel gerencial com agregações reais |
| Financeiro | Recebimentos por meio, caixas, financeiras, contas e fluxo de 14 dias | Caixa operacional por pessoa/loja; rota financeira completa ausente | Financeiro real em etapas, #65 primeiro |
| Relatórios | Períodos, evolução, margem, ticket, descontos e ranking | Lista de vendas e resumo simples; sem módulo de relatórios | Agregações/extratos completos e exportação autorizada |
| Metas/comissões | Painéis e metas ilustrativas | Parte da produção Connect; regras/fechamento geral ausentes | Metas e comissão por evento idempotente |
| Catálogo/fotos | Produtos e preços de exemplo | Busca, fotos, preços e custos protegidos; cadastro/importação incompletos | Concluir administração/importador e completar fotos |
| Estoque | Consultas, histórico e transferências fictícias | Estoque/IMEI/ICCID, reservas e transferências persistentes, DEFEITOS | Dados/cadastros da rede, compras, inventário e ajustes |
| PDV | Carrinho e pagamentos simulados | Vendas, misto/financiamento, desconto, cancelamento, devolução/troca em desenvolvimento | Homologar percursos com vendedor/gerente e dados corretos |
| Ora Connect | Operações e indicadores simulados | Cliente/worker, estados e três operações implementadas/testadas, habilitação real pendente | Nogle oficial, cobrança/recorrência/repasse e prova de contrato |
| Fiscal | Estados e exemplos | Solicitação/aprovação e chave manual | Emissor/contador, contingência e conciliação fiscal |
| Clientes/WhatsApp | Conversas/cadastros de exemplo | CRM e WhatsApp completos ausentes | Persistência, vínculos, consentimento e atendimento oficial |
| Assistência | OS e etapas de exemplo | Seis requisitos ainda não iniciados no registro | Custódia, orçamento, aprovação, peças e cobrança |
| Canais online | Painéis de exemplo | Loja/marketplaces/logística operacionais ausentes | Pedidos e estoque unificados, checkout e adaptadores |
| Auditoria/equipe | Controles fictícios | Módulos reais já existem; primeiro acesso foi ajustado | Concluir convites/worker/SMTP, demais perfis e testes reais |

Esta matriz deve acompanhar cada PR: funcionalidade da referência → rota real → fonte persistente → permissão → teste → situação. Reaproveitar apresentação sem carregar fixtures da demo no sistema real.

## 4. Situação documental dos 179 requisitos

Contagem derivada do backlog e do registro de status na base, não da aparência da UI:

- **19 testados em desenvolvimento**;
- **42 parciais**;
- **10 só em demonstração**;
- **2 bloqueados**;
- **105 não iniciados** (incluem 104 sem entrada explícita e 1 entrada declarada não iniciada);
- **1 restrição respeitada**: não consumir API da Rein;
- **0 homologados** no registro.

Os 75 registros explícitos não são 75 entregas. “Testado” ainda depende de revisão/aceite; não se pode converter estes totais em um percentual confiável de plataforma concluída.

| Domínio | Total | Testado dev | Parcial | Demo | Bloqueado | Não iniciado | Respeitado |
|---|---:|---:|---:|---:|---:|---:|---:|
| ORG | 10 | 1 | 5 | 0 | 0 | 4 | 0 |
| CAT | 11 | 0 | 6 | 0 | 0 | 4 | 1 |
| INV | 12 | 3 | 5 | 0 | 0 | 4 | 0 |
| CRM | 10 | 0 | 0 | 0 | 0 | 10 | 0 |
| POS | 16 | 5 | 7 | 0 | 0 | 4 | 0 |
| PAY | 14 | 2 | 5 | 1 | 0 | 6 | 0 |
| FIN | 10 | 0 | 1 | 2 | 0 | 7 | 0 |
| PERF | 10 | 0 | 1 | 1 | 0 | 8 | 0 |
| FISC | 10 | 2 | 2 | 0 | 2 | 4 | 0 |
| CONNECT | 11 | 6 | 4 | 0 | 0 | 1 | 0 |
| ONLINE | 8 | 0 | 0 | 0 | 0 | 8 | 0 |
| MKTPL | 8 | 0 | 0 | 0 | 0 | 8 | 0 |
| WHATS | 8 | 0 | 0 | 0 | 0 | 8 | 0 |
| META | 6 | 0 | 0 | 0 | 0 | 6 | 0 |
| AI | 7 | 0 | 0 | 0 | 0 | 7 | 0 |
| REPORT | 8 | 0 | 1 | 6 | 0 | 1 | 0 |
| QUAL | 14 | 0 | 5 | 0 | 0 | 9 | 0 |
| OS | 6 | 0 | 0 | 0 | 0 | 6 | 0 |

Há inconsistência a reconciliar: **ORA-POS-011** aparece não iniciado, enquanto **ORA-FISC-001** consta testado e cobre solicitação fiscal da venda no celular. Não implementar outra fila para satisfazer um número. Conferir critérios/testes e atualizar a rastreabilidade, sem elevar status automaticamente.

## 5. Primeira entrega: gráficos financeiros que já podem funcionar

A #65 delimita a primeira fatia: `/financeiro` real e resumo no início, usando dados locais autorizados. Não precisa de nova API de pagamento para ler os fatos já registrados.

| Indicador/visão | Fonte possível atual | Limite a respeitar |
|---|---|---|
| Vendas e devoluções no período | Vendas, itens e devoluções persistidas | Definir data/cancelamento e não duplicar joins |
| Pagamentos por meio | Pagamentos e movimentos de caixa | Registro/confirmado local não prova liquidação bancária |
| Movimentação dos caixas | Livro de caixa e fechamentos | Fundo/suprimento não são receita; sangria não é despesa |
| Diferenças de fechamento | Esperado × contado e conferência | Valor da gaveta é diferente de saldo de banco |
| Recebíveis das financeiras | Contas a receber PayJoy/Aiva | Baixa, aging, prazo, taxa e repasse ainda incompletos |
| Margem bruta gerencial | Custo histórico autorizado dos itens | Não apresentar como lucro líquido ou DRE completa |
| Produção Nogle | Somente operações e evidência oficial confirmadas | Não computar pendência, estimativa ou saldo de carteira como repasse |

Primeiro implementar vendas/devoluções, pagamentos por meio e movimentação/fechamento dos caixas, com filtros e tabela. Após reconciliar cálculos, ampliar a consolidação e demais indicadores. Contas, metas, conciliação e previsão exigem seus modelos/fluxos; desenhar o gráfico não conclui esses domínios.

## 6. Contrato mínimo para cada número

Cada indicador precisa documentar: definição, fonte, status incluídos, data de competência/ocorrência, fuso, loja/vendedor/canal, moeda em centavos, origem clicável, autorização e estornos/devoluções.

- Separar venda, pagamento, recebimento, liquidação, repasse, margem e comissão.
- Separar movimentação da gaveta do fluxo financeiro empresarial. Eliminar transferências internas na consolidação quando houver modelo correlacionado; não inventar vínculos.
- Entrada financeira e principal a receber não podem somar o preço duas vezes. Vale é obrigação/crédito, não ingresso de dinheiro.
- Estorno pendente não prova saída bancária concluída. Troco e devolução não podem ser abatidos duas vezes.
- O valor de face de recarga não é receita integral da Ora. Só a Nogle confirma fatos externos e seus repasses.
- Tabelas com múltiplos itens/pagamentos/devoluções devem ser agregadas sem multiplicação de joins.
- A consulta do relatório deve cobrir todo o período. O resumo limitado de `/vendas` avisa parcialidade; não usá-lo como total gerencial. A leitura de movimentos em `/caixa` também precisa de teste acima do limite REST antes de servir como consolidação.
- Comparar períodos equivalentes e sinalizar falta de histórico; não fabricar ontem/meses anteriores.
- Quando não há fatos numa fonte implementada, mostrar vazio/zero de forma clara. Quando falta módulo/contrato, mostrar indisponibilidade. “Não conciliado” não é “recebido”.
- Margem e custo só para quem possui autorização no servidor/banco. Gráfico e exportação também podem vazar custo.
- Sem importar `demo/dados`, contexto da demo ou fórmulas ilustrativas. Por exemplo, a distribuição horária anterior da demo usa perfil ilustrativo; não é evidência de horário de vendas reais.

## 7. Ordem proposta para concluir a plataforma

A ordem abaixo é por dependência e valor; **não é calendário contratado**. Segurança/qualidade são transversais. Coleta de contratos Nogle/fiscal e preparação comercial começam agora, paralelamente ao código. A coluna de fase do anexo indica a trilha principal de conclusão, não proíbe fundações antecipadas.

| Fase | Entrega | Dependência principal / aceite |
|---|---|---|
| 0, transversal | Acessos, três perfis de teste, convites/SMTP/worker, isolamento de ambientes, RLS, auditoria, backup/restauração, alertas e contingência | Dono inicial já vinculado em #63; faltam vendedor/gerente e prova autenticada. PR #64 prepara gerente. Evidência por perfil/loja; infraestrutura separada antes dos dados comerciais |
| 1, próxima | Painel financeiro real e relatório operacional inicial (#65) | Leituras agregadas corretas, cartões/gráficos/tabela batendo com livros, vazio sem simulação |
| 2 | Cadastros das 11 lojas + DEFEITOS, catálogo/fotos, preços/custos, importador Rein por arquivos, inventário, compras e estoque | B1/B2, prévia de importação, fotos completas, IMEI/ICCID e saldo físico conferidos; fundação do vínculo cliente e contratos de dados sem duplicação |
| 3 | Concluir e homologar PDV, pagamentos, caixa, descontos, cancelamento/devolução/troca e pedido fiscal já existente | Vendedor/gerente completam casos em celular; pagamento misto/financiado e reembolso reconciliáveis |
| 4, paralela ao núcleo | Nogle: ativação, recarga, portabilidade, eSIM, chip/transferências oficiais; cobrança, carteira, extrato, recorrência e repasse | C1/C2 e #54. Credenciais no worker, contrato verificável e operação de teste oficialmente confirmada |
| 5 | Financeiro completo: títulos a pagar/receber, baixa/vencimento/aging, taxas/parcelas, conciliação de extratos e repasses, DRE gerencial e projeção | Dados e regras contratuais; entrada/saída real identificada; sem falsa liquidação ou lucro |
| 6, contrato em paralelo | Fiscal: natureza/UF/CNPJ, emissor, documentos corretos, devolução/cancelamento e contingência | Contador e emissor homologados; enquanto aplicável, portal atual + referência manual conforme go/no-go |
| 7 | CRM, clientes/consentimento, histórico; metas e produção por evento; regras e fechamento de comissão | Fontes vendas/estoque/Connect corretas; reversão idempotente e regras comerciais definidas |
| 8 | Assistência: OS obrigatória, custódia de aparelhos/acessórios, trânsito ao técnico, orçamento e aprovação, peças/entrega/cobrança | CRM/estoque/PDV, fotos e provas de entrega. Aparelho de cliente não vira estoque de venda |
| 9 | WhatsApp oficial e atendimento: atribuição, histórico, modelos, notificações, pós-venda e supervisão | Conta/número Meta habilitados e consentimento; fila de falhas e correlação com cliente/OS/venda |
| 10 | Loja online, checkout/frete/retirada, marketplaces, logística e expansão multi-CNPJ | Estoque/pedidos unificados, anti-overselling, contratos de canal, fiscal e pilotos por onda |
| 11 | Meta Ads/atribuição, BI ampliado e IA supervisionada | Dados rastreáveis e mensuráveis; autorização humana para decisões críticas; custo/qualidade/LGPD |

O núcleo prioritário segue sendo **vendas, pagamentos/caixa e Ora Connect**, com seus dados e segurança. As novas visualizações devem entrar desde o núcleo, não só ao fim do projeto. A evolução continua incremental sem trocar a linguagem ou o banco.

## 8. Dependências que realmente exigem ação externa

| Grupo | O que falta / precisa ser confirmado | Pode avançar sem isso |
|---|---|---|
| Acesso | Vendedor/gerente de teste, segredo administrativo no worker quando usado, SMTP/retorno/convites | Leitura e gráficos locais; testes de banco; dono já recebeu perfil |
| Dados da operação | Exportação Rein de produtos/preços/estoque; códigos/CNPJ/endereço das 11 lojas e DEFEITOS; fotos e custos reais | Importador, validações e testes com fixtures; não inventar cadastro oficial |
| Nogle | Tipo/habilitação de chave, conta/linha/ICCID autorizados, contratos de cobrança/consulta/recorrência/repasse e correlação | Adaptadores/fixtures/contratos documentados; nenhuma operação externa declarada confirmada por simulação |
| Pagamentos/financeiras | Terminais, extratos, prazo/taxas PayJoy/Aiva, condições PicPay/PagBank e checkout | Registro manual auditável e painéis dos fatos locais |
| Fiscal | Contador, modelo tributário/documento, emissor e certificado | Fila/pedido/chave manual e controles previstos no fluxo atual |
| Políticas comerciais | Limites de desconto, troca, bonificação, cobrança, contingência e fechamento | Estrutura e estados; sem presumir aprovação do que permanece pendente |
| Canais/atendimento | WhatsApp/Meta e credenciais/contratos de marketplaces/logística | Adaptadores e módulos locais em etapas |

Valores de chaves e dados operacionais reais seguem nos canais seguros definidos, não em GitHub/chat. **Não há API Rein**; a carga é por arquivos. A Nogle é um sistema integrado por API, não um servidor externo nosso. Contabilidade oficial da Ora Connect precisa reconciliar com esse provedor.

## 9. Como implementar sem perder a apresentação ou duplicar código

1. Converter a referência visual em matriz de aceite por papel e rota, incluindo computador/celular e entradas no “Mais”.
2. Reusar componentes de apresentação/gráficos e manter contexto de dados real separado da simulação. Não reescrever componentes que já atendem.
3. Criar contratos/DTOs e leituras autorizadas do domínio antes de ligar um gráfico. Não fazer conta financeira definitiva só no browser.
4. Entregar fatias completas: fonte persistente → regra → autorização → tela → testes → evidência → aceite. Um botão ou gráfico sozinho não encerra requisito.
5. Ajustar banco por migrations aditivas/revisadas quando necessário, preservando histórico e reversão. Não prometer zero migrations ou zero mudanças futuras.
6. Cada PR registra o que da demo passou a ser real e o que ainda não tem backend. Não esconder funcionalidade implementada ao trocar o menu.
7. Claude Code implementa no ambiente autorizado; Codex faz revisão independente. Sem mudança simultânea na mesma área. Não foram criados novos endpoints ou alterados dados nesta análise.

## 10. Aceite antes de assumir a operação comercial

Aplicar os 13 critérios de [go/no-go](https://github.com/oraconect5g-boop/sistema-ora5g/blob/84ecefea496afe1159f355e14491b995240a347e/docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md): catálogo/estoque importados e conferidos; usuários/fotos; vendas/pagamentos reconciliáveis; caixa fechado; Nogle homologada por tipo; fiscal atendido; cancelamento/devolução; ausência de duplicidade; isolamento; PDV no celular; restauração; contingência/suporte; monitoramento.

O paralelo com a Rein e sua saída dependem desse aceite. A fase atual é aplicação real em desenvolvimento/homologação com dados de teste. A leitura dos fontes/CI não substitui homologação do proprietário, do contador ou do provedor.

## 11. Anexo completo — 179 requisitos, estado e trilha de conclusão

Legenda: estados são os **declarados** na base, sujeitos às revisões indicadas. ID aparece exatamente uma vez. “Fase 0” é trabalho transversal; nem todos os testes avançados bloqueiam o desenvolvimento dos gráficos. O agrupamento é proposta de execução, não alteração silenciosa do status.

### Fase 0 — Acesso, ambientes e segurança transversal (20 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-ORG-002 | Associar usuários a uma ou múltiplas lojas com função e vigência | Parcial |
| ORA-ORG-003 | Gerir perfis diretoria, regional, gerente, vendedor, financeiro, fiscal, marketing e atendimento | Parcial |
| ORA-ORG-004 | Isolar dados por loja na API e PostgreSQL/RLS | Parcial |
| ORA-ORG-005 | Histórico de alterações de papéis, políticas e configurações | Testado em desenvolvimento |
| ORA-ORG-006 | Login, recuperação de conta e revogação de sessão | Parcial |
| ORA-ORG-007 | Autenticação reforçada para perfis privilegiados | Não iniciado |
| ORA-QUAL-001 | CI, lint, typecheck, testes e code review obrigatórios | Parcial |
| ORA-QUAL-002 | RLS e autorização negada por padrão, testadas por loja | Parcial |
| ORA-QUAL-003 | Auditoria imutável de operações e aprovações críticas | Parcial |
| ORA-QUAL-004 | Segredos em ambientes seguros sem exposição no Git/cliente | Parcial |
| ORA-QUAL-005 | Backups e ensaio de restauração de banco e anexos | Não iniciado |
| ORA-QUAL-006 | Observabilidade de erros, latência, filas e conciliação | Não iniciado |
| ORA-QUAL-007 | Migrations versionadas, não destrutivas, testadas | Parcial |
| ORA-QUAL-008 | Plano de contingência para internet, pagamentos e fiscal | Não iniciado |
| ORA-QUAL-009 | Piloto com testes de usuário, caixa e fechamento diário | Não iniciado |
| ORA-QUAL-010 | Performance mobile e testes em dispositivos/internet reais | Não iniciado |
| ORA-QUAL-011 | LGPD: bases legais, retenção, direitos do titular e minimização | Não iniciado |
| ORA-QUAL-012 | Testes de carga, concorrência e disaster recovery | Não iniciado |
| ORA-QUAL-013 | Processo de resposta a incidentes e suporte às lojas | Não iniciado |
| ORA-QUAL-014 | Análise de segurança periódica e monitoramento de dependências | Não iniciado |

### Fase 1 — Painéis e gráficos financeiros reais (8 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-FIN-001 | Resumo diário de vendas x recebimentos x produção comercial | Não iniciado |
| ORA-FIN-008 | Relatório financeiro consolidado por loja/região/rede | Só demonstração |
| ORA-FIN-009 | Exportações CSV/XLSX/PDF de relatórios autorizados | Só demonstração |
| ORA-REPORT-001 | Dashboard diretoria consolidado de todas as lojas (11 hoje; meta de 14) | Só demonstração |
| ORA-REPORT-002 | Dashboard gerente de loja: caixa, metas, aprovação de desconto/NF | Só demonstração |
| ORA-REPORT-003 | Dashboard vendedor mobile: produção do dia, metas e atalhos | Parcial |
| ORA-REPORT-005 | Relatório por método de pagamento e terminal PicPay | Só demonstração |
| ORA-REPORT-007 | Alertas de estoque mínimo/IMEI/caixa divergente/fiscal pendente | Só demonstração |

### Fase 2 — Cadastros, catálogo, fotos e estoque (23 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-ORG-001 | Cadastrar empresa, organização, 11 lojas comerciais, o local DEFEITOS e a loja piloto (meta de 14 lojas) | Parcial |
| ORA-ORG-008 | Configurar horários, endereços, caixas e dados fiscais por loja | Não iniciado |
| ORA-CAT-001 | Cadastrar categorias, marcas, produtos, variantes e SKUs | Parcial |
| ORA-CAT-002 | Importar produtos e preços da Rein somente por CSV/XLSX | Não iniciado |
| ORA-CAT-003 | Não consumir API Rein em nenhuma operação diária | Restrição respeitada |
| ORA-CAT-004 | Cadastrar preços vigentes por loja/canal conforme regra | Parcial |
| ORA-CAT-005 | Diferenciar smartphone, acessório, chip e serviço comercial | Parcial |
| ORA-CAT-006 | Pesquisar por nome, SKU e, quando aplicável, IMEI/ICCID | Parcial |
| ORA-CAT-007 | Programar vigência de promoções e campanhas comerciais | Não iniciado |
| ORA-CAT-008 | Custo de produto/lote/entrada e margem gerencial | Parcial |
| ORA-CAT-010 | Permitir importação assistida em lote de fotos/atributos | Não iniciado |
| ORA-CAT-011 | Exigir foto principal por produto e imagem própria para variantes visualmente diferentes | Parcial |
| ORA-INV-001 | Manter disponibilidade por loja e localização física | Parcial |
| ORA-INV-002 | Identificar aparelho por IMEI/serial e impedir venda duplicada | Testado em desenvolvimento |
| ORA-INV-003 | Registrar cada entrada/saída em livro auditável de estoque | Testado em desenvolvimento |
| ORA-INV-004 | Receber estoque inicial validado por contagem real | Parcial |
| ORA-INV-005 | Reservar estoque durante checkout e liberar em expiração/cancelamento | Parcial |
| ORA-INV-006 | Bloquear venda de IMEI indisponível/transferido/reservado | Parcial |
| ORA-INV-007 | Transferência entre lojas com trânsito/recebimento | Testado em desenvolvimento |
| ORA-INV-008 | Inventário cíclico e ajuste com aprovação | Não iniciado |
| ORA-INV-009 | Compras e recebimento de fornecedores | Não iniciado |
| ORA-INV-010 | Histórico de reparo/devolução e condição de unidade | Não iniciado |
| ORA-INV-011 | Controle de ICCID de chip físico quando exigido | Parcial |

### Fase 3 — Núcleo de vendas, pagamentos e caixa (24 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-POS-001 | Efetuar venda completa em celular sem notebook | Parcial |
| ORA-POS-002 | Busca rápida por nome/SKU/IMEI e carrinho responsivo | Parcial |
| ORA-POS-003 | Itens mistos em venda: aparelho, acessório, chip, ativação, recarga | Parcial |
| ORA-POS-004 | Selecionar IMEI físico disponível antes de concluir | Testado em desenvolvimento |
| ORA-POS-005 | Calcular preço/desconto e totais server-side | Testado em desenvolvimento |
| ORA-POS-006 | Solicitar aprovação do gerente para desconto acima do limite | Testado em desenvolvimento |
| ORA-POS-007 | Suportar múltiplos pagamentos na mesma venda | Testado em desenvolvimento |
| ORA-POS-008 | Vincular venda a vendedor, loja, cliente quando aplicável e canal | Parcial |
| ORA-POS-009 | Consultar status e comprovantes sem concluir pagamento pendente | Parcial |
| ORA-POS-010 | Cancelar e devolver sem apagar origem | Parcial |
| ORA-POS-011 | Gerar solicitação fiscal a partir da venda em poucos toques | Não iniciado |
| ORA-POS-012 | Troca com diferença de preço e meios de pagamento | Testado em desenvolvimento |
| ORA-POS-013 | Venda parcelada/PayJoy/boleto por fluxo homologado | Parcial |
| ORA-POS-014 | Aplicar campanhas, combos e regras por loja | Não iniciado |
| ORA-POS-015 | Atalhos para supervisor e estados offline/sem rede | Não iniciado |
| ORA-POS-016 | Entrada por leitor USB/Bluetooth ou câmera | Não iniciado |
| ORA-PAY-001 | Registrar dinheiro, Pix direto, Pix PicPay POS e cartões | Parcial |
| ORA-PAY-002 | Suportar financiamento, boleto, parcelamento e pagamentos online | Parcial |
| ORA-PAY-003 | Diferenciar autorizado, pago, liquidado, estornado e conciliado | Só demonstração |
| ORA-PAY-004 | Abrir caixa com saldo inicial e responsável | Testado em desenvolvimento |
| ORA-PAY-005 | Registrar sangria, suprimento, reforço, devolução e saída autorizada | Parcial |
| ORA-PAY-006 | Fechar caixa com valor contado e diferença | Testado em desenvolvimento |
| ORA-PAY-007 | Conciliação manual PicPay POS usando referência/comprovante | Parcial |
| ORA-PAY-008 | Evitar confirmação duplicada via webhook/retry | Parcial |

### Fase 4 — Ora Connect oficial pela Nogle (12 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-CONNECT-001 | Cadastrar e vender chip físico ligado ao estoque e vendedor | Testado em desenvolvimento |
| ORA-CONNECT-002 | Separar evento de venda de chip do evento de ativação | Testado em desenvolvimento |
| ORA-CONNECT-003 | Separar recarga como operação telecom com status próprio | Parcial |
| ORA-CONNECT-004 | Registrar Nogle como integração externa por adapter | Testado em desenvolvimento |
| ORA-CONNECT-005 | Refletir ativação somente após resposta verificada da Nogle | Testado em desenvolvimento |
| ORA-CONNECT-006 | Atribuir performance de ativação/recarga ao vendedor de origem | Testado em desenvolvimento |
| ORA-CONNECT-007 | Consulta/atualização de linha e plano conforme API disponível | Parcial |
| ORA-CONNECT-008 | Portabilidade, contrato e venda de plano conforme contrato | Parcial |
| ORA-CONNECT-009 | Reconciliar repasses/bonificações Nogle e operação local | Não iniciado |
| ORA-CONNECT-010 | Recuperar falha de rede com reconsulta sem reativação duplicada | Testado em desenvolvimento |
| ORA-CONNECT-011 | eSIM, contratação digital e entrega de chip nacional | Parcial |
| ORA-REPORT-004 | Relatório de chips vendidos, ativações e recargas separadamente | Só demonstração |

### Fase 5 — Financeiro completo e conciliação (13 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-PAY-009 | Importar extratos de adquirente/banco por arquivo validado | Não iniciado |
| ORA-PAY-010 | Reconciliar taxas, parcelas e datas de repasse | Não iniciado |
| ORA-PAY-011 | Gerir chargebacks, estornos, antecipação e ajustes | Não iniciado |
| ORA-PAY-012 | Permitir múltiplas maquininhas/provedores por loja | Não iniciado |
| ORA-PAY-013 | Integração automática com PicPay POS se API contratual confirmada | Não iniciado |
| ORA-PAY-014 | Pix/checkout web e links por provedores validados | Não iniciado |
| ORA-FIN-002 | DRE/margem gerencial com custo, taxa e desconto | Não iniciado |
| ORA-FIN-003 | Contas a receber ligadas a venda, vencimento e meio | Parcial |
| ORA-FIN-004 | Contas a pagar ligadas a fornecedor/origem | Não iniciado |
| ORA-FIN-005 | Rastrear recebíveis e repasses por loja/adquirente | Não iniciado |
| ORA-FIN-006 | Conciliação bancária e contas multiempresa | Não iniciado |
| ORA-FIN-007 | Gestão de inadimplência e cobranças autorizadas | Não iniciado |
| ORA-FIN-010 | Previsão de fluxo de caixa e simulações | Não iniciado |

### Fase 6 — Fiscal e obrigações legais (10 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-FISC-001 | Solicitar nota diretamente da venda no celular | Testado em desenvolvimento |
| ORA-FISC-002 | Fluxo interno de aprovação de solicitações pelo gestor conforme política | Testado em desenvolvimento |
| ORA-FISC-003 | Identificar perfil fiscal por produto/serviço/UF/CNPJ | Bloqueado |
| ORA-FISC-004 | Integrar provedor fiscal homologado para documento correto | Bloqueado |
| ORA-FISC-005 | Guardar chave, protocolo, referência e evidências legais com segurança | Parcial |
| ORA-FISC-006 | Tratar falha fiscal, reprocesso, contingência e cancelamento | Parcial |
| ORA-FISC-007 | Mapear cenários NF-e/NFC-e/NFS-e/NFCom conforme natureza | Não iniciado |
| ORA-FISC-008 | Conciliação fiscal de vendas, tributos e documentos | Não iniciado |
| ORA-FISC-009 | Devolução, troca, cancelamento e correção fiscal | Não iniciado |
| ORA-FISC-010 | Multi-UF/multi-CNPJ e reforma tributária preparada | Não iniciado |

### Fase 7 — CRM, metas, produção e comissões (21 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-CRM-001 | Cadastro de cliente com dados mínimos e finalidade | Não iniciado |
| ORA-CRM-002 | Relacionar cliente às compras/IMEIs/chips/linhas e atendimentos | Não iniciado |
| ORA-CRM-003 | Pesquisar cliente por identificadores protegidos | Não iniciado |
| ORA-CRM-004 | Registrar lead, origem, atendente, vendedor responsável e etapa | Não iniciado |
| ORA-CRM-005 | Atividades, lembretes, follow-up e motivos de perda | Não iniciado |
| ORA-CRM-006 | Detecção e mesclagem controlada de cadastros duplicados | Não iniciado |
| ORA-CRM-007 | Registros de consentimento/preferência de comunicação | Não iniciado |
| ORA-CRM-008 | Contratos/anexos de venda, garantia, financiamento e telecom | Não iniciado |
| ORA-CRM-009 | Histórico omnichannel de compras físicas/online | Não iniciado |
| ORA-CRM-010 | Segmentação comercial e valor de vida do cliente | Não iniciado |
| ORA-PERF-001 | Contar individualmente aparelhos, acessórios, chips, ativações e recargas | Parcial |
| ORA-PERF-002 | Registrar performance_event único por origem/ação confirmada | Não iniciado |
| ORA-PERF-003 | Distinguir quantidade, valor bruto, margem, receita elegível e comissão | Não iniciado |
| ORA-PERF-004 | Definir meta por vendedor, loja, categoria e período | Não iniciado |
| ORA-PERF-005 | Painel do gestor mostra metas e resultados da equipe | Só demonstração |
| ORA-PERF-006 | Regras de bonificação por categoria/campanha/margem/escala | Não iniciado |
| ORA-PERF-007 | Ajustar comissão por cancelamento/devolução conforme regra | Não iniciado |
| ORA-PERF-008 | Apurar e aprovar fechamento de bonificação | Não iniciado |
| ORA-PERF-009 | Metas coletivas/regional e rankings configuráveis | Não iniciado |
| ORA-PERF-010 | IA recomenda campanhas/metas com aprovação humana | Não iniciado |
| ORA-REPORT-006 | Relatórios de margem, vendedor e ranking configurável | Só demonstração |

### Fase 8 — Assistência técnica e custódia (6 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-OS-001 | Abrir OS obrigatória para todo aparelho de cliente que entra (até limpeza), com cliente, IMEI, defeito, estado, fotos e acessórios deixados (custódia) | Não iniciado |
| ORA-OS-002 | Registrar saída para o técnico central e retorno à loja (custódia em trânsito) | Não iniciado |
| ORA-OS-003 | Orçamento do técnico dentro da OS (diagnóstico, peças, valor), com histórico | Não iniciado |
| ORA-OS-004 | Aprovação ou recusa do orçamento pelo cliente, registrada | Não iniciado |
| ORA-OS-005 | Avisos ao cliente e ao técnico (comprovante, orçamento, aparelho pronto, entrega) | Não iniciado |
| ORA-OS-006 | Entrega com cobrança pelo PDV e produção do vendedor; peças só saem do estoque ligadas a uma OS | Não iniciado |

### Fase 9 — WhatsApp e atendimento (8 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-WHATS-001 | WhatsApp Business Platform oficial conectado ao CRM | Não iniciado |
| ORA-WHATS-002 | Caixa de entrada multiatendente com atribuição à loja/vendedor | Não iniciado |
| ORA-WHATS-003 | Leads orgânicos e pagos identificados por origem consentida | Não iniciado |
| ORA-WHATS-004 | Histórico 360 de conversas/negócios por cliente | Não iniciado |
| ORA-WHATS-005 | Respostas rápidas, etiquetas, SLA e repasse para humano | Não iniciado |
| ORA-WHATS-006 | Templates e mensagens proativas em conformidade Meta | Não iniciado |
| ORA-WHATS-007 | IA supervisionada para qualificação e sugestão de respostas | Não iniciado |
| ORA-WHATS-008 | Recuperação de carrinho e pós-venda sob consentimento | Não iniciado |

### Fase 10 — Online, marketplaces e expansão (21 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-ORG-009 | Gerir unidades regionais, grupos e metas agregadas | Não iniciado |
| ORA-ORG-010 | Preparar multi-CNPJ/UF para expansão física nacional | Não iniciado |
| ORA-CAT-009 | Canais externos usam mapeamento de SKU e IDs próprios | Não iniciado |
| ORA-INV-012 | Transferência para CD e alocação futura a canais nacionais | Não iniciado |
| ORA-ONLINE-001 | Site de aparelhos, acessórios e planos Ora Connect | Não iniciado |
| ORA-ONLINE-002 | Carrinho/checkout online e pedido com status | Não iniciado |
| ORA-ONLINE-003 | Atribuir origem online, campanhas e vendedor quando aplicável | Não iniciado |
| ORA-ONLINE-004 | Frete, CEP, retirada em loja e entrega com rastreio | Não iniciado |
| ORA-ONLINE-005 | Devolução, arrependimento e reembolso de venda online | Não iniciado |
| ORA-ONLINE-006 | Reserva de IMEI por pedido/canal anti-overselling | Não iniciado |
| ORA-ONLINE-007 | Contratação online de planos/chips/eSIM se habilitado | Não iniciado |
| ORA-ONLINE-008 | Expansão interestadual com parâmetros fiscais e logísticos | Não iniciado |
| ORA-MKTPL-001 | Preparar adaptadores separados Mercado Livre/Shopee/TikTok Shop | Não iniciado |
| ORA-MKTPL-002 | Sincronizar SKU/preço/estoque/anúncio conforme recursos | Não iniciado |
| ORA-MKTPL-003 | Importar pedido marketplace com ID externo e dedupe | Não iniciado |
| ORA-MKTPL-004 | Tratar entrega/frete/etiquetas/rastreio por canal | Não iniciado |
| ORA-MKTPL-005 | Conciliação de tarifas, comissões e repasses por marketplace | Não iniciado |
| ORA-MKTPL-006 | Cancelamentos, devoluções e reembolsos por canal | Não iniciado |
| ORA-MKTPL-007 | Sincronização near-real-time por webhooks/adapters | Não iniciado |
| ORA-MKTPL-008 | Métricas por anúncio/canal/produto e margem | Não iniciado |
| ORA-REPORT-008 | Dashboard expansão nacional por marketplace, ads e canais | Não iniciado |

### Fase 11 — Marketing, BI ampliado e IA (13 requisitos)

| ID | Função planejada | Estado declarado |
|---|---|---|
| ORA-META-001 | Importar insights autorizados de Meta Ads por conta/campanha | Não iniciado |
| ORA-META-002 | Capturar UTM e origem de leads de site/WhatsApp | Não iniciado |
| ORA-META-003 | Mostrar gasto, CTR, CPC, CPL, CPA e ROAS quando calculáveis | Não iniciado |
| ORA-META-004 | Funil por vendedor/loja/campanha e atribuição | Não iniciado |
| ORA-META-005 | Conversions API/eventos com consentimento e dedupe | Não iniciado |
| ORA-META-006 | Analisar margem e CAC por campanha | Não iniciado |
| ORA-AI-001 | Painéis básicos e alertas desde o MVP | Não iniciado |
| ORA-AI-002 | IA auxilia atendimento e qualificação de leads | Não iniciado |
| ORA-AI-003 | IA sugere produtos, respostas e roteamento de cliente | Não iniciado |
| ORA-AI-004 | IA resume campanhas, metas e falhas operacionais | Não iniciado |
| ORA-AI-005 | Autorização humana obrigatória para operações financeiras/fiscais | Não iniciado |
| ORA-AI-006 | Controle de custo por chamada de modelo e retenção | Não iniciado |
| ORA-AI-007 | Avaliação de qualidade e red-team de agentes | Não iniciado |


---

## Comentário 6780678382 — issue/PR #65

Fonte: https://github.com/oraconect5g-boop/sistema-ora5g/issues/65#issuecomment-6780678382
Criado em: 2026-11-10T22:12:07Z. Conteúdo integral com supressões de dados potencialmente sensíveis.

Prompt completo de execução e relatório integral versionados em **PR #66**, branch `docs/prompt-financeiro-real-20261110`, commit `9216f9247c376c1dbe6b26a409c0daf131d93a33`.

- `docs/alinhamento/PROMPT_CLAUDE_FINANCEIRO_REAL_E_PLANO_COMPLETO_2026-11-10.md`
- `docs/analises/PARIDADE_DEMO_REAL_E_PLANO_COMPLETO_2026-11-10.md`

O Claude pode ler ambos por `git fetch`/`git show`, sem depender da API do GitHub. O prompt manda começar pela primeira implementação da #65, preserva a nova UI/stack/regras financeiras e contém a ordem para as demais trilhas, acesso/perfis, Nogle e lista única de dependências. O relatório contém os 179 requisitos, sem duplicação. Nenhum código de produto foi alterado nesta preparação.

---

