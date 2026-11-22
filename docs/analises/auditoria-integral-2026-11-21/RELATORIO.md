# Diagnóstico técnico e funcional — 21/11/2026

## Conclusão

**A Ora evoluiu de demonstração para fluxos internos reais, mas ainda não cumpre o planejamento integral nem está pronta para substituir a Rein em operação comercial.** O problema atual não é uma linguagem inadequada. Há dois defeitos reproduzidos, dados de implantação ausentes, integrações não finalizadas e documentos de status contraditórios.

O código auditado é `c1b8e6086d509f388e6080eb829af7a8b6ac316b`; o domínio entrega esse mesmo SHA e a build de **21/11 às 10:45:36, Brasília**, com `ambiente: homologacao`. Não há evidência de atraso de versão no corte. O último lote J3-f acrescentou teste financeiro com login e documentação; não implementou uma API financeira nova.

Desde o corte de 18/11 (`27b4f6e`): **115 commits e 294 arquivos alterados**. A árvore tem **1.465 arquivos**, dos quais **1.449 textos/códigos foram obtidos e tiveram o blob SHA conferido**. Os 16 binários visuais estão inventariados, mas não foram baixados pelo conector. Isso é inventário integral e revisão dirigida por risco; não significa execução de cada linha ou homologação de todos os fluxos.

## 1. Quantos dos 179 estão cumpridos?

| Estado declarado no projeto | Quantidade | Interpretação |
|---|---:|---|
| Testado | 69 | Implementação declarada com testes de desenvolvimento; não equivale a requisito aceito em produção |
| Parcial | 80 | Parte entregue; as notas integrais indicam o restante |
| Não iniciado | 15 | Ainda sem implementação suficiente |
| Bloqueado | 13 | Dependência externa ou decisão, além de código que ainda pode faltar |
| Restrição respeitada | 2 | Regras negativas cumpridas, não funcionalidades adicionais |
| Integralmente homologado | 0 | Nenhum requisito com todos os lotes aceitos e pendências encerradas |

São **69/179 = 38,5% no estado “testado”**, não 38,5% de esforço ou conclusão comercial. Somar “parcial” como “pronto” produziria uma medida enganosa. Há **43 registros de aceite de lotes: 1 aceito (PWA-b) e 42 sem resposta**. Um lote aceito não encerra automaticamente um requisito inteiro. Desde 18/11, apenas ORA-CONNECT-009 mudou de categoria, de não iniciado para parcial; muitos dos 115 commits melhoraram implementação e testes sem fechar o restante do requisito.

## 2. Defeitos reproduzidos e ações prioritárias

### F21-01 — P1 — a planilha original ainda não conclui o contrato de leitura

**Reprodução:** o teste do próprio projeto `apps/plataforma/src/lib/importacao/auditoria-planilha-real.test.ts`, com o arquivo privado original, falha: esperava **2.271 produtos**, recebeu **2.272 linhas**. `linhaDeTotal` devolve `null`; `candidatoARodape` também. Uma prova nova inteiramente sintética reproduz o formato.

**Causa:** a exportação da Rein tem **18 células na linha 2.273** com tipo XML `t="n"`, mas conteúdo no formato brasileiro (exemplo sintético: `1.234,00`). `numeroComoNoExcel`, em `lib/importacao/xlsx.ts:291`, mantém o texto quando `Number(...)` não o entende; a origem é marcada como numérica. `numeroDaCelula`, em `lib/importacao/catalogo.ts:139`, volta a usar `Number(texto)` e devolve `null`. `avaliarUltimaLinha`, na linha 195, recusa o rodapé antes da confirmação das somas. Os produtos de verdade não podem ser descartados para fazer a contagem passar.

**Impacto:** o rodapé permanece na segunda parte como item sem SKU/nome e impede considerar o catálogo integralmente validado. O CI pula esse teste sem `ARQUIVO_ESTOQUE_AUDITORIA`; por isso o CI verde não comprova compatibilidade com a planilha entregue. As 18 células fora do padrão numérico XML estão apenas no rodapé, no arquivo analisado.

**Correção a projetar:** tratar explicitamente o formato defeituoso da origem, preservar a origem/célula e confirmar o rodapé por somas/identidade; nunca transformar o número Excel válido `0.625` em 625 nem descartar o último produto só porque falta código. Manter uma amostra sintética desse formato no CI e rodar o original em ambiente privado. Aceite: 83 colunas, 2.271 produtos, partes 2.000/271, rodapé identificado, F18-01/F18-02 verdes e prévia sem perda silenciosa.

### F21-02 — P1 — o mesmo crédito pode conciliar duas obrigações diferentes

**Reprodução local, com todas as migrations:** criar uma venda Pix e um pedido independente do Mercado Livre, ambos de R$ 79 fictícios, e importar uma única linha de crédito de R$ 79. É possível (a) conciliar a venda e depois casar o repasse, e (b) casar o repasse e depois conciliar a venda. As duas provas que esperam recusa falham com `expected null not to be null`: as RPCs aceitaram o segundo uso.

**Causa:** `public.marketplace_repasse_casar`, migration `20261118202002_repasses_dos_marketplaces.sql:89`, verifica repetição apenas dentro de `marketplace_repasses`; não confere `extrato_linhas.situacao/pagamento_id`. Já `public.extrato_conciliar`, migration `20261117225818_extratos_e_conciliacao.sql:276`, confere o estado da linha, mas não sua utilização por um repasse. Casar repasse deixa a linha `pendente`; as sugestões também não excluem todos os usos incompatíveis. Uma consulta de metadados no Supabase confirma essa separação nas duas funções instaladas.

**Impacto:** duas obrigações distintas podem parecer liquidadas com o mesmo recebimento. Isso não significa que o saldo bancário seja automaticamente somado duas vezes: o defeito demonstrado é a dupla vinculação da evidência financeira. Como o banco tem zero extratos importados, não foi constatado dano financeiro real.

**Correção a projetar:** exclusividade de utilização da linha entre os dois fluxos, trava comum na própria linha, validação em ambas as RPCs, filtros de sugestões e desfazer coerente. Se houver rateio legítimo de um crédito em várias obrigações, modelá-lo explicitamente e exigir soma/alocações válidas. Aceite: as duas ordens recusadas, concorrência real com duas conexões PostgreSQL, repetição idempotente, desfazer e RLS entre redes. Não basta esconder a opção na tela.

### F21-03 — P2 — a fonte de “próximo passo” ficou desatualizada

O checkpoint ainda registra `b061e86` e J3-f como “falta publicar”; o domínio já entrega `c1b8e60`. `APIS_E_HABILITACOES_NECESSARIAS.md`, `MATRIZ_DAS_APIS.md/json` e trechos do próximo passo ainda tratam a chave secreta do Supabase, contas de teste e provas com login como ausentes. `PONTOS_EM_ABERTO_2026-11-18.md` registra a chegada das chaves em 18/11 e as jornadas posteriores; o banco já tem seis usuários. O início da lista de APIs também contradiz suas atualizações posteriores.

**Impacto:** o Claude pode voltar a pedir uma entrega já feita ou parar num bloqueio superado; o proprietário não distingue “não publicado” de documento atrasado. Consolidar o estado atual, manter história separada e registrar publicação por execução/SHA/build após o deploy, sem tentar gravar o próprio SHA de um commit dentro dele. A presença real de valores no servidor não foi inspecionada pelo Codex.

### F21-04 — P2 — dados de teste chegaram a um destino de loja real

Supabase: **duas transferências enviadas, total de duas unidades, de Santa Cândida (teste) para Muffato Santa**. As outras 18 transferências estão recebidas entre as duas lojas de teste. O problema já está documentado em T1 de `PONTOS_EM_ABERTO_2026-11-18.md`. Resolver com procedimento operacional auditado, sem apagar movimentos ou inventar recebimento físico. Conferir/regularizar antes da carga inicial da loja real.

## 3. Correções da auditoria anterior

| Achado de 18/11 | Estado no corte atual | Evidência e limite |
|---|---|---|
| F18-01: decimal XLSX virava milhar na quantidade | Corrigido nos casos reexecutados | Metadado `numericas`; `auditoria-20261118.test.ts` e contratos de carga verdes. O novo F21-01 é um formato diferente da exportação |
| F18-02: último item incompleto sumia como rodapé | Corrigido no caso EAN/preço reexecutado | Rodapé comprovado separado de candidato; não usar a correção nova para reintroduzir a perda de item |
| F18-03: físico maior que disponível era liberado inteiro | Corrigido no código/testes dirigidos | REIN-c exige resolução auditada; OR042 bloqueia pendência. Não houve carga comercial no banco |
| F18-04: status e dependências divergentes | Parcial; ainda aberto | F21-03 descreve contradições atuais |
| F18-05: solicitação não reduzia disponível | Corrigido no código/testes dirigidos | TRF-c reserva ao pedir; envio baixa físico uma vez; testes de concorrência/idempotência no repositório |
| F18-06: webhook poderia confirmar sem reconsulta | Corrigido na regra de domínio | PAY-b exige reconsulta; os adaptadores de cobrança continuam não implementados/ativados |

## 4. O que existe e falta por área

Estados abaixo são os da matriz; as colunas funcionais cruzam código, testes, relatos de aceite e contagens do banco. Os testes J1/J2/J3 no domínio foram executados pelo Claude e estão documentados; não foram repetidos nesta sessão com senha.

| Área | Testados | Parciais | Não iniciados | Bloqueados | Restrições |
|---|---:|---:|---:|---:|---:|
| Organização, lojas e usuários | 3 | 7 | 0 | 0 | 0 |
| Catálogo e precificação | 8 | 2 | 0 | 0 | 1 |
| Estoque, serial/IMEI e suprimentos | 8 | 4 | 0 | 0 | 0 |
| Clientes, CRM, oportunidades e contratos | 6 | 4 | 0 | 0 | 0 |
| PDV mobile e vendas | 7 | 9 | 0 | 0 | 0 |
| Pagamentos, PicPay e caixa | 5 | 7 | 0 | 2 | 0 |
| Financeiro e controladoria | 5 | 4 | 1 | 0 | 0 |
| Vendedor, metas, comissões e bonificações | 5 | 4 | 1 | 0 | 0 |
| Fiscal, nota e conformidade | 2 | 4 | 0 | 4 | 0 |
| Ora Connect, chips, ativações e recargas | 6 | 5 | 0 | 0 | 0 |
| E-commerce e vendas online | 1 | 4 | 1 | 2 | 0 |
| Marketplaces e channel manager | 0 | 5 | 0 | 3 | 0 |
| WhatsApp, atendimento e automação | 0 | 1 | 6 | 1 | 0 |
| Meta Ads e atribuição | 3 | 2 | 0 | 1 | 0 |
| Inteligência artificial e análise | 1 | 0 | 5 | 0 | 1 |
| Gestão, BI e relatórios | 3 | 5 | 0 | 0 | 0 |
| Segurança, qualidade, operação e compliance | 2 | 11 | 1 | 0 | 0 |
| Assistência técnica e ordens de serviço | 4 | 2 | 0 | 0 | 0 |

### Organização, lojas e usuários

**Existe:** Cadastro das 11 lojas + DEFEITOS; vínculos, seleção de loja, RBAC/RLS; seis usuários no Auth, incluindo os perfis de teste.

**Falta:** Dados fiscais e endereço das lojas, SMTP/convites da equipe, piloto e aceite. CNPJ das 11 lojas reais ausente.

**Fontes:** `apps/plataforma/src/app/lojas`, `apps/plataforma/src/app/equipe`, `packages/banco/src/acesso.test.ts`.

### Catálogo e precificação

**Existe:** Produtos, variantes, preços/custos, fotos e importador CSV/XLSX com prévia e auditoria.

**Falta:** F21-01; importação real dos 2.271 produtos, classificação das variantes e fotos. Só 7 produtos e nenhuma foto no banco.

**Fontes:** `apps/plataforma/src/lib/importacao`, `apps/plataforma/src/app/produtos`, `packages/banco/src/importacao.test.ts`.

### Estoque, serial/IMEI e suprimentos

**Existe:** Saldos por loja, entrada, inventário, IMEI/ICCID, remessa multiitem e reserva na solicitação; REIN-c bloqueia divergências sem resolução.

**Falta:** Carga inicial reconciliada, seriais reais, dois trânsitos de teste para Muffato Santa e piloto com saldos conferidos.

**Fontes:** `apps/plataforma/src/app/estoque`, `apps/plataforma/src/app/transferencias`, `packages/banco/src/estoque-carga.test.ts`.

### Clientes, CRM, oportunidades e contratos

**Existe:** Nome completo + WhatsApp no cadastro rápido; e-mail opcional, endereço fiscal, máscara/revelação auditada, funil, atividades e anexos. J3-e registra teste no site.

**Falta:** Leads/conversas automáticos, integração de contratos quando definida, histórico de linhas telecom e homologação com cenários comerciais.

**Fontes:** `apps/plataforma/src/lib/clientes/regras.ts`, `apps/plataforma/src/app/crm`, `apps/plataforma/e2e/clientes-e-os-real.spec.ts`.

### PDV mobile e vendas

**Existe:** Venda, desconto, pagamentos mistos por linha, entrada separada, financiamento só do celular, devolução, cancelamento, vale-troca e comprovante.

**Falta:** Regras comerciais finais, dados reais do piloto, integração do financiamento e pagamento online separados do PDV.

**Fontes:** `apps/plataforma/src/app/vender`, `apps/plataforma/src/lib/vendas/formas-de-pagamento.ts`, `apps/plataforma/e2e/venda-real.spec.ts`.

### Pagamentos, PicPay e caixa

**Existe:** Abertura, movimentação, fechamento, comprovantes, conciliação manual e por arquivo; regra PAY-b exige reconsulta antes da confirmação externa.

**Falta:** F21-02, primeiros extratos reais, escolha/contrato do checkout; adaptadores PicPay/PagBank ainda false. Automação POS é condicional a contrato.

**Fontes:** `apps/worker/src/cobranca/cobranca.ts`, `packages/banco/src/extratos.test.ts`, `apps/plataforma/e2e/caixa-real.spec.ts`.

### Financeiro e controladoria

**Existe:** Painéis/gráficos reais, resultado, previsão, contas a pagar/receber, cadastro bancário e saldo por extrato; J3-f testou fluxo manual.

**Falta:** F21-02, fechamento operacional, inadimplência/cobrança, saldo final OFX e extratos reais. Contabilidade gerencial não substitui a formal.

**Fontes:** `apps/plataforma/src/app/financeiro/ConteudoFinanceiro.tsx`, `packages/banco/src/contas-bancarias.test.ts`, `apps/plataforma/e2e/financeiro-real.spec.ts`.

### Vendedor, metas, comissões e bonificações

**Existe:** Metas, produção, chip contado separadamente e motor de bônus mensal.

**Falta:** Política de bônus aceita e fechamento do mês; fonte oficial de remuneração Nogle; recomendação por IA não iniciada. Testar virada mensal com relógio/fixtures isolados.

**Fontes:** `apps/plataforma/src/app/metas`, `packages/banco/src/metas.test.ts`, `apps/plataforma/e2e/nota-e-metas-real.spec.ts`.

### Fiscal, nota e conformidade

**Existe:** Pedido, aprovação, destinatário completo, registro de documento emitido, PDF/XML privado, cancelamento/correção e fila de envio.

**Falta:** Escolha e contratação do emissor, contador, certificado/regime/CFOP/NCM/UF, emissão e rejeição reais, contingência, integração WhatsApp. 2 pedidos e 0 documentos.

**Fontes:** `apps/plataforma/src/app/notas`, `packages/banco/src/destinatario-fiscal.test.ts`, `docs/integracoes/MATRIZ_DAS_APIS.md`.

### Ora Connect, chips, ativações e recargas

**Existe:** Adaptador Nogle documentado, worker, filas/estados, evidência/reconsulta e conciliação dos relatórios oficiais de ativação/recarga (CONNECT-c).

**Falta:** Tipo de chave/segunda chave conforme contrato; leitura oficial autorizada, operações homologadas, carteira, extrato, recorrência, gateway e repasses completos. 0 operações/habilitações.

**Fontes:** `apps/worker/src/connect`, `apps/worker/src/executar-connect.ts`, `packages/banco/src/connect-conciliacao.test.ts`.

### E-commerce e vendas online

**Existe:** Rota /loja, entrada Comprar na página inicial, vitrine, produto, carrinho, pedido/reserva e retirada.

**Falta:** Catálogo publicado/fotos/estoque, checkout/pagamento online, entrega/frete, retorno/arrependimento e expansão fiscal. A página pública ainda diz pagamento na loja.

**Fontes:** `apps/plataforma/src/app/loja`, `apps/worker/src/cobranca/cobranca.ts`, `packages/banco/src/loja-online-cota-concorrencia.test.ts`.

### Marketplaces e channel manager

**Existe:** Importação de pedidos por arquivo, códigos externos, custos/margens e repasses assistidos no banco (REPASSE-a).

**Falta:** F21-02; OAuth e adaptadores reais de Mercado Livre/TikTok/Shopee, sincronização de estoque/preço, pedidos/devoluções e reprocessamento. 0 importações.

**Fontes:** `apps/worker/src/marketplaces/adaptadores.ts`, `packages/banco/src/marketplace-repasses.test.ts`.

### WhatsApp, atendimento e automação

**Existe:** Fila de envio da nota, worker preparado e configuração explícita, sem marcar envio fictício como sucesso.

**Falta:** Meta/WABA/número/template, assinatura de callbacks, envio real e caixa multiatendente/histórico/SLA/recuperação.

**Fontes:** `apps/worker/src/whatsapp`, `apps/plataforma/src/lib/clientes/regras.ts`.

### Meta Ads e atribuição

**Existe:** UTMs/origem, importação de gastos e indicadores por arquivo.

**Falta:** Marketing API, Conversions API com consentimento/deduplicação; Meta Commerce é outro escopo/contrato. 0 importações de anúncios.

**Fontes:** `apps/worker/src/meta/conversoes.ts`, `apps/plataforma/src/app/relatorios/canais`.

### Inteligência artificial e análise

**Existe:** Indicadores determinísticos e restrição de não autorizar operações financeiras por IA.

**Falta:** Assistência supervisionada, fornecedor/orçamento, avaliação e retenção; não é a dependência para corrigir estoque/financeiro.

**Fontes:** `backlog.json`, `docs/10_DECISOES_PENDENTES.md`.

### Gestão, BI e relatórios

**Existe:** Gráficos e exportações reais de vendas, financeiro, estoque, metas, canais e operação; GRAF-a diferencia falha de vazio.

**Falta:** Paridade funcional/visual homologada com dados reconciliados e filtros por papel/loja/período. Gráfico vazio em loja real sem movimentos não prova ausência do componente.

**Fontes:** `apps/plataforma/src/componentes/graficos`, `apps/plataforma/src/app/financeiro`, `apps/plataforma/src/app/relatorios`.

### Segurança, qualidade, operação e compliance

**Existe:** CI, testes locais, E2E, RLS, auditoria, PWA/Web Push, rotinas agendadas e registro de falhas do servidor.

**Falta:** Piloto aceito, proteção de senhas vazadas, SMTP/backup/restore, política de branches e processo de produção; observabilidade persistente para múltiplos processos.

**Fontes:** `apps/plataforma/src/lib/saude/erros-do-servidor.ts`, `.github/workflows`, `deploy/homologacao`.

### Assistência técnica e ordens de serviço

**Existe:** Recepção, trânsito à assistência, orçamento, aprovação, peças, execução, cobrança e devolução/entrega. J3-e registra jornada de 10 passos.

**Falta:** Homologação comercial, equipe técnica real, documentos e comunicação externa.

**Fontes:** `apps/plataforma/src/app/assistencia`, `apps/plataforma/e2e/clientes-e-os-real.spec.ts`.

## 5. GitHub, pastas, duplicidades e versões

| Diretório | Leitura arquitetural | Resultado da revisão |
|---|---|---|
| `apps/plataforma` (756 arquivos) | Next.js/React/TypeScript; rotas, componentes, server actions e testes | UI real usa banco/RPC; `/demo` continua isolada no código. Mudanças recentes também atingem rotas reais de estoque, vendas, transferências, conciliação, equipe e operação |
| `apps/worker` (33) | TypeScript executado no Node: identidade, avisos, Nogle, WhatsApp e contratos de adaptadores | Não é necessário criar outro backend para começar; cobrança e marketplaces ainda têm `ADAPTADOR_PRONTO=false` |
| `packages/banco` (357) | PostgreSQL: migrations, reversões, sementes e testes | 121 versões locais = 121 versões aplicadas; dois fluxos de conciliação precisam do controle comum F21-02 |
| `packages/config` (16) | Ambiente, segredos e validação | Dois `.env.example` existem; não há motivo para pedir valores em chat ou versionar `.env` |
| `packages/dominio` (24) | Dinheiro, regras e contratos compartilhados | Reutilizar na evolução; não duplicar regras comerciais em uma linguagem nova |
| `deploy` (12) | Publicação/reinício/verificação e workers de homologação | Merge não publica a aplicação sozinho. O script de publicação é acionado pelo programador e confere SHA no domínio |
| `.github` (5) | CI, segurança semanal e templates | CI verde no corte; não há workflow de deploy da aplicação nessa pasta |
| `docs` (211) | Planejamento, ADRs, aceites, alinhamento, integrações e relatórios | Fonte principal de rastreabilidade, mas há trechos antigos ativos (F21-03) |
| `originais` (4), `.claude` (11) | Histórico e instruções locais | Espelhos históricos não são código em execução; decisões recentes prevalecem |
| `scripts` (9) | Rastreabilidade, catálogo Nogle, medidas e varredura | Testes de forma do status não detectam necessariamente contradições semânticas |
| `referencias_visuais` (14), `templates` (2), arquivos raiz | Protótipos, modelos e configuração do monorepo | Referência visual não comprova funcionalidade pronta |

Não foram encontrados marcadores de conflito de merge nos arquivos de código inventariados. Duplicatas byte a byte encontradas são principalmente espelhos de relatórios/originais, templates e configurações mínimas de lint/Vitest. Não há evidência, nessa verificação, de uma segunda aplicação esquecida servindo o domínio. Isso não exclui duplicação semântica: F21-02 mostra precisamente dois caminhos válidos isoladamente e inconsistentes entre si.

Migrations com `CREATE OR REPLACE` e arquivos de reversão são histórico de evolução; apagar as anteriores quebraria a reconstrução do banco. Não remover código da demo só para reduzir contagem: ela está desativada por configuração e preservada por decisão. Inventário lexical de funções não é um grafo completo de chamadas e não deve ser usado sozinho para apagar “funções sem uso”.

## 6. Supabase: estrutura e operação observada

Projeto `ora5g-dev`, PostgreSQL 17.11, região São Paulo, saudável no corte. **121 migrations**, sem versões faltantes nem excedentes em relação ao Git. A igualdade de versões não é uma prova integral de ausência de alterações manuais no corpo de todas as funções; foram conferidas adicionalmente as duas RPCs do F21-02.

**121 tabelas nos esquemas public/privado**, todas com RLS habilitada. Nenhuma tem `SELECT` direto para `anon` no levantamento; isso não impede as RPCs públicas deliberadas. Cinco buckets privados (`anexos`, `contas`, `notas`, `os`, `produtos`), sem objetos. **Zero Edge Functions**: a arquitetura atual usa Next.js, funções SQL e worker Node; a ausência não é, por si só, um defeito.

| Dado ao vivo | Quantidade / situação |
|---|---|
| Usuários Auth | 6; há dono, dono de teste, administrador, dois gerentes e vendedor |
| Unidades | 11 lojas comerciais + DEFEITOS + 3 unidades de teste |
| 11 lojas reais + DEFEITOS | Todas com físico/reservado zero; nenhuma das 11 lojas reais tem CNPJ preenchido |
| Estoque em teste | Santa Cândida (teste): 23 unidades; Loja de teste 2: 30; não representam a planilha comercial |
| Produtos / variantes / fotos | 7 / 7 / 0 |
| Importações de catálogo / cargas iniciais / linhas de carga | 0 / 0 / 0 |
| Entradas de estoque | 2, relacionadas ao cenário de teste |
| Clientes / vendas / transferências | 1 / 23 / 20; presença de operações de teste não é homologação comercial |
| Ora Connect operações / habilitações | 0 / 0 |
| Pedidos fiscais / documentos emitidos | 2 / 0 |
| Extratos / importações marketplaces / importações de anúncios | 0 / 0 / 0 |
| Produtos publicados online / pedidos online | 0 / 0 |
| Inscrições Web Push | 1 |

**Rotinas nas últimas 24 h:** alertas 144 sucessos, reservas 288, limpeza 1; nenhuma falha nessas execuções. **Logs HTTP:** 7 respostas 500 concentradas às 07:03:57–07:04:01 de 21/11, antes de ROB-a e da build atual: `estoque_painel` (2), `metas_painel` (2), `pendencias_da_loja`, `financeiro_painel`, `vendas_painel`. O PostgreSQL registrou sete timeouts 57014. Não afirmar que a versão atual segue falhando nem que o problema foi eliminado sob qualquer carga; repetir a medida com o volume do catálogo real, após corrigir sua importação. Houve ainda consultas com coluna/tabela inexistente e recusas de permissão; sem correlação com a jornada, não são automaticamente bugs do aplicativo (podem ser inspeções e testes negativos).

**Advisors:** proteção contra senha vazada desligada (WARN); 8 funções SECURITY DEFINER executáveis por `anon` e 206 por `authenticated` (WARN); 18 tabelas RLS sem policy (INFO). Parte é deliberada: esquema privado sem leitura direta, RPCs de vitrine/reserva/saúde e fila de avisos protegida por segredo. Não abrir policies para “zerar avisos”. Revisar autorização, limite de requisições e segredo por contrato; não há prova de invasão. Ver links oficiais em `evidencias/advisors-resumo.json`.

Performance: 1 FK sem índice cobrindo a relação `fotos_produto(produto_id, organizacao_id)` e 236 índices ainda sem uso observado. Avaliar o índice de fotos com o plano de consulta/volume; não apagar índices por estarem sem uso num banco ainda quase vazio. A fila de avisos usa segredo conferido por SHA-256, trava `FOR UPDATE SKIP LOCKED`, limite de lote e expiração da reivindicação; as RPCs anon não devem ser confundidas com leitura livre das tabelas privadas. Isso foi conferido no código SQL, sem consultar o segredo. Observabilidade OBS-a guarda até 200 erros em memória por processo e log; reinício apaga o resumo. Monitoramento persistente/alerta externo continua pendente para produção.

## 7. Domínio, demo e entrega após cada lote

Verificação HTTP e navegação pública automatizada: `/`, `/entrar`, `/loja` e `/loja/carrinho` abrem; `/financeiro` sem sessão redireciona para entrar; `/demo` retorna 404. Nas páginas públicas testadas, sem erro JavaScript nem rolagem horizontal a 390 px; isso não homologa o PDV, as integrações ou todo o aplicativo móvel.

A página inicial tem **Comprar** e **Entrar**. A vitrine diz **“Em breve”**, coerente com zero produtos publicados. O carrinho informa **“A compra e o pagamento são feitos na loja”**. Portanto a compra online com cobrança automática, exigida pelo proprietário, ainda não foi entregue.

A decisão D-051 de 18/11 registra que o proprietário dispensou a demo e autorizou desligá-la. Ela é posterior aos pedidos de atualizar real e demo presentes nesta conversa; a auditoria registra essa mudança documental e não recomenda religá-la automaticamente. O código da demo continua no repositório. Também não confundir domínio principal com ambiente de produção aprovado: `/saude/versao` informa homologação.

A integração GitHub–Supabase sincroniza migrations da `main` com o diretório `packages/banco`; **não publica o Next.js no cPanel**. O script `deploy/homologacao/publicar.sh` ainda é manual ao fim de cada lote, com autorização já documentada, rollback e conferência de SHA. Hoje está sincronizado. Para não voltar à divergência, registrar commit, CI, migrations, build, URL e prova funcional de cada etapa; a saúde HTTP sozinha não comprova a regra de negócio.

## 8. Testes, CI e limites

- CI da main: [run 44910397289](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/44910397289), concluído com sucesso em 21/11 às 10:59:43, Brasília; checks CI e Supabase Preview com sucesso.
- 3.176 testes unitários/integração aprovados: plataforma 1.842; worker 51; banco 1.095; config 64; domínio 124. Um teste da planilha privada pulado e um TODO.
- E2E do CI: **331 aprovados, 55 pulados**. As jornadas reais dependem de contas/URL e estão entre os casos condicionais; não somar os 55 como sucesso.
- Lint, typecheck, build e auditoria de dependências passaram no run. Os logs atuais registram zero vulnerabilidades; não transportar avisos antigos como se fossem atuais.
- Reexecução independente dirigida: **240 testes existentes aprovados e 1 falhou**, o teste do XLSX original. Além disso, **3 provas sintéticas novas falharam**, reproduzindo os dois defeitos F21-01/F21-02. O teste auxiliar de diagnóstico apenas extraiu metadados e não foi contado como cobertura funcional adicional.
- As suites de banco desta reexecução usam PGlite isolado; isso valida contratos SQL, não substitui teste de concorrência com duas conexões PostgreSQL real. O CI contém outras provas de concorrência; não executei operações financeiras de teste no Supabase conectado.
- Os registros J1/J2/J3 do Claude mostram login, papéis, vendas, transferências/IMEI, caixa, devolução, estoque, cliente/CRM/OS, pedido fiscal/metas e financeiro manual. A varredura ROB-a registra 339 telas por perfis. São evidências documentais complementadas por código/testes e contagens, não navegação autenticada repetida pelo Codex nesta sessão.
- O teste J3-f rodou uma vez: repetir consome o último aparelho disponível do cenário, segundo o roteiro. A fixture precisa de ciclo de preparação/limpeza autorizado e isolado; não usar mercadoria real nem parar todo o desenvolvimento porque faltou aparelho de teste.

O Chromium deste ambiente não reconheceu inicialmente a autoridade do certificado. A validação TLS pelo cliente HTTP funcionou; apenas a inspeção visual pública foi repetida com a exceção de confiança do navegador local, sem autenticação nem envio de dados. Não foi tratado como defeito certificado do domínio.

## 9. Ordem recomendada de execução

1. Corrigir F21-02 e F21-01 com regressões, sem remover a proteção de decimal/EAN. Concluir um lote por vez, revalidar e publicar na homologação já autorizada.
2. Atualizar status/dependências (F21-03); relacionar commits, publicação e aceite sem declarar conclusão só por CI verde.
3. Regularizar os dois trânsitos de teste para Muffato (F21-04); confirmar CNPJ/endereço das lojas e vínculos operacionais. A carga fiscal não pode usar CNPJ fictício.
4. Disponibilizar a planilha privadamente ao programador; prévia integral do catálogo; carregar uma loja piloto com reconciliação físico/disponível, seriais e aprovação por pessoa distinta. O arquivo de 10/11 é uma posição histórica: reconciliar movimentos até a data da virada, não tratá-lo como estoque de 21/11 automaticamente.
5. Fotografar/importar imagens, conferir variantes e publicar produtos autorizados na vitrine. Homologar busca por loja e transferências com itens reais do piloto.
6. Fechar PDV/caixa/financeiro com extratos e jornadas de fim de dia; gráficos devem bater com o livro de movimentos. Definir política de bônus e testar fechamento mensal isoladamente.
7. Ora Connect: completar configuração contratual da Nogle, começar por consultas oficiais e homologar as operações uma a uma; finalizar carteira/extrato/recorrência/repasse e tratamento de resposta desconhecida. Não contar registro local como ativação oficial.
8. Emissor fiscal + envio de nota via WhatsApp oficial; manter e-mail opcional. Testar autorização, rejeição, cancelamento e retorno/consulta.
9. Checkout online completo, cobrança/reconsulta/webhook, expiração de reserva, pagamento tardio/estorno, logística e devolução. Isso deve aparecer em `/loja` no domínio.
10. PayJoy/Aiva via API obrigatórias no escopo final; marketplaces/Meta automáticos, respeitando contratos e estados. Arquivo/manual permanece uma etapa intermediária, não conclusão da automação.
11. Atendimento WhatsApp/CRM, demais pendências da matriz, automações e IA supervisionada; J7/QI Tech ficam como extensões futuras até contrato/identidade definidos.
12. Piloto acompanhado, backup/restore testado, segurança, observabilidade, conciliação e aceite; só então executar a transição comercial e saída da Rein conforme GO/NO-GO.

Um bloqueio contratual não impede corrigir bugs, preparar contratos internos, testes sintéticos e demais itens independentes. A lista completa dos 179 não é substituída por essa ordem resumida.

## 10. Linguagem e rapidez de desenvolvimento

**Node.js já é utilizado**: `package.json` exige Node >=22.12 e <23; Next.js e o worker executam TypeScript/JavaScript nesse runtime. Node não é uma nova linguagem. PostgreSQL continua responsável pelas transações e RLS.

Trocar para Firebase ou outra linguagem agora adicionaria migração e novos riscos sem resolver os problemas demonstrados. O caminho mais curto é reutilizar as RPCs, componentes de gráficos, worker, contratos e testes existentes; corrigir os controles compartilhados; colocar os dados do piloto; implementar adaptadores oficiais e provar sua publicação. Os exemplos de código em `SOLUCOES_PARA_AVALIACAO.md` são propostas para discussão, não patches autorizados para copiar diretamente.
