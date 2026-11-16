# Revisão do Claude Code — avanços, defeitos e aderência ao programa integral

**Data:** 11/11/2026, São Paulo. **Revisor:** Codex. **Base auditada:** [`953b21e0b90f4823759de9bba8f38452dd6769e8`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/953b21e0b90f4823759de9bba8f38452dd6769e8).
**Comparação:** desde `0b6b45e`, base do pacote da PR #67. **Pedido:** conferir minuciosamente o que o Claude fez e está fazendo, confrontando código, relatórios, planejamento e versões do GitHub.

## Parecer

O desenvolvimento avançou nas dependências corretas do núcleo: lojas, cadastro do catálogo, preços/campanhas, importação CSV e recebimento de mercadoria. A stack TypeScript/Next.js/Node.js/PostgreSQL/Supabase foi preservada. O financeiro inicial não foi refeito; a correção de seu redirecionamento e a semente do gerente também foram integradas.

**Ainda não considero os novos lotes prontos para uso com dados reais.** Reproduzi seis defeitos, incluindo vazamento de custo ao vendedor e falhas na aplicação/reversão da importação. Há duas lacunas de volume nas telas operacionais. A suíte existente passa, mas não cobre esses casos. Os módulos restantes continuam em grande parte pendentes; a operação oficial da Nogle não foi homologada por esta revisão.

O site ainda serve `0b6b45e`, build 10/11 às 20:45; as cinco novas rotas consultadas retornaram 404. Isso é diferença de publicação, não prova de ausência de implementação. Não reconstruir esses módulos para resolver o atraso.

## 1. Cobertura e método

- Árvore atual sem truncamento: **556 arquivos**, **544 textos recuperados e conferidos por Git blob SHA**, **109 Markdown**, **28 migrations**. Os 12 arquivos visuais permanecem inventariados; não houve nova análise quadro a quadro.
- Diferença desde a revisão anterior: **16 commits, 69 arquivos, 49 adicionados, 20 modificados, nenhum removido; 10.163 linhas adicionadas e 64 removidas**. Quatro Markdown mudaram, contando o novo checkpoint.
- As fontes de planejamento e os relatórios já levantados na PR #67 foram reconciliados pelos hashes; as versões históricas permanecem no índice/manifesto daquele pacote. Não tratei uma recomendação antiga como ordem atual.
- **62 branches** conferidas: 35 heads já apareciam no histórico da main coletado; os outros 27 foram comparados por ancestralidade. Só divergem as três branches documentais das PRs #33, #66 e #67. Não apareceu feature mais nova, fora da main, nessa coleta.
- **9 PRs, 67 issues/PRs e 71 comentários** consultados; soma das contagens de comentários cruzada. As nove coleções de reviews formais estavam vazias. Revisões em documentos e Conversation não foram confundidas com ausência de revisão.
- Revisão dirigida dos cinco novos contratos SQL, migrações/reversões, RLS/grants, entradas/saídas, consumidores TypeScript, telas/ações e testes. Revisão dos 179 estados e do checkpoint contra o programa completo.
- Instalação limpa local e checks existentes executados. Sete casos adicionais observaram o comportamento atual; dois usam PostgreSQL 17 com conexões reais, cinco usam PGlite com o Supabase simulado do projeto.

Inventário e matrizes: [VERSOES_E_COBERTURA_2026-11-11.md](VERSOES_E_COBERTURA_2026-11-11.md), [PLANO_X_IMPLEMENTACAO_2026-11-11.md](PLANO_X_IMPLEMENTACAO_2026-11-11.md), [evidências reproduzíveis](evidencias/2026-11-11-lotes/LEIA-ME.md).

**Limites:** não vejo a sessão privada/terminal nem alterações não enviadas do Claude. “Está fazendo” significa o que seus commits, branches e checkpoint registram. Não houve acesso à VPS, `.env`, senhas, produção ou dados reais; aplicação remota de migrations é declaração do programador em `aplicadas-dev.json`, não nova conferência remota do Codex. Não houve login real de vendedor/gerente/dono, operação Nogle, emissão fiscal ou movimentação financeira externa. Esta é revisão detalhada dos novos lotes e reconciliação do conjunto documental, não certificação linha a linha de todo o histórico do produto.

## 2. O que o Claude entregou

| Frente | Evidência integrada | Resultado e limite |
|---|---|---|
| Financeiro/acesso | `38fc068`, PR #64 em `2ac6a25` | Layout confere sessão antes de transmitir `/financeiro`; semente inclui gerente. Não prova três contas Auth nem UAT autenticado |
| L2 — lojas | `0ecb2f2`, migration `20261111132503` | `/lojas`, cadastro/edição, configuração com vigência, inativação com pendências, auditoria e trava contra movimento concorrente. Cadastros reais dependem de B2 |
| L3a — catálogo | `ed4a468`, migration `20261111132621` | `/produtos`, categorias, marcas, produtos, variações, inativação e política de desconto. Usa as entidades existentes; não duplica o catálogo físico |
| L3b — preços | `0271a96`, migration `20261111133804` | Preço de rede/loja/canal, agendamento, campanha com vigência, cancelamento e proteção de histórico. Consistência entre este caminho e o importador precisa das correções abaixo |
| L3c — importação | `5476869`, migration `20261111135906` | CSV, mapeamento, prévia persistente, aprovação por outra pessoa, aplicação transacional e desfazer lógico. Falta arquivo real da Rein e há defeitos de integridade |
| L4a — recebimento | `953b21e`, migration `20261111141337` | `/estoque/entrada`, fornecedor, compra/carga inicial, IMEI/ICCID ou quantidade, custo e estorno pelo livro. Há vazamento de custo e lacunas de correção |
| Continuidade | `EXECUCAO_INTEGRAL_STATUS.md` e JSON de 179 IDs | Fila persistente segue além do piloto. O checkpoint ficou um merge atrás e sua cobertura de leitura precisa de atualização |

## 3. Defeitos reproduzidos e correções necessárias

### REV-NOV-001 — P1: vendedor lê custo pelas tabelas de recebimento

**Código:** [`20261111141337_entrada_estoque.sql:97`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111141337_entrada_estoque.sql#L97).

`GRANT SELECT` abrange as tabelas inteiras. A policy da entrada exige somente `estoque.consultar`; os itens herdam o acesso à entrada. Assim, `total_custo_centavos` e `custo_unitario_centavos` ficam legíveis pelo vendedor. Esconder a rota na UI não protege a Data API.

**Prova:** dono registra duas unidades fictícias a 1.234 centavos; vendedor da mesma loja, com `custo.ver = false`, consulta o join e recebe custo unitário 1.234 e total 2.468. Outro vendedor de outra loja ser recusado não cobre essa fuga de coluna.

**Comparação com relatórios:** repete, em outro módulo, o padrão já corrigido em **#56 / REV-053** para a carteira Nogle: custo precisa de proteção própria, inclusive tabelas, agregados, evidências e logs.

**Corrigir:** separar custos em estrutura com RLS `custo.ver`, ou fornecer projeção/RPC segura e revogar acesso direto às colunas sensíveis. Preservar consultas operacionais sem revelar custo. Testar vendedor da própria loja, outra loja, gerente, dono, revogado e acesso direto pela API; testar também o total agregado. É bloqueante para homologar o recebimento com custo real.

### REV-NOV-002 — P2: aprovação aplica uma prévia desatualizada sem mostrar o impacto atual

**Código:** [`20261111135906_importacao_catalogo.sql:423`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111135906_importacao_catalogo.sql#L423).

As diferenças são calculadas na prévia, mas a aplicação lê o cadastro atual e sobrescreve os campos do arquivo sem conferir se continuam iguais à base comparada. `antes` é gravado no instante da aplicação; a tela continua mostrando `diferencas` antigas. Uma única transação evita metade da carga, mas não torna atual a aprovação humana.

**Prova:** prévia propõe preço de R$ 79 para R$ 90; depois o dono muda para R$ 120; aprovar a prévia antiga grava R$ 90 sem conflito/nova conferência. O impacto real R$ 120 → R$ 90 não era o apresentado na comparação.

**Corrigir:** guardar versão/estado relevante da prévia e validar sob as travas usadas por todos os caminhos de cadastro/preço/custo. Se houve mudança, invalidar a aprovação e gerar nova comparação, incluindo linhas antes “sem mudança”. Não aceitar automaticamente uma alteração diferente porque o SKU já existia. Testar duas pessoas entre prévia e aplicação e disputa com edição manual.

### REV-NOV-004 — P2: estorno de IMEI deixa a correção de loja sem caminho operacional

**Código:** [`20261111141337_entrada_estoque.sql:298`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111141337_entrada_estoque.sql#L298) e estorno em `:375`.

**Prova:** registrar um aparelho, estornar por loja errada e tentar recebê-lo na loja correta deixa o item como `baixado`, fora de estoque; a nova entrada recebe `23505` por IMEI já cadastrado. O mesmo caminho vale para ICCID. A mensagem manda usar transferência/devolução/ajuste, mas transferência exige item em estoque, devolução exige venda e não há ajuste público equivalente entregue. A própria tela sugere estornar uma entrada “lançada na loja errada”.

**Corrigir:** entregar correção/reentrada autorizada e auditada da identidade existente, sem apagar ou duplicar IMEI/ICCID nem reescrever o livro. Recusar item vendido/reservado/em trânsito e repetir de forma idempotente. Testar correção da loja, da variação e repetição após erro. Se o caminho escolhido for transferir antes do estorno, a UI precisa conduzir ao procedimento e impedir o beco sem saída.

### REV-NOV-005 — P2: recebimento permite estoque novo de produto inativo

**Código:** [`20261111141337_entrada_estoque.sql:257`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111141337_entrada_estoque.sql#L257).

Só `variantes.ativa` é conferida. A inativação do produto não inativa suas variações, e o recebimento não exige `produtos.ativo`. A proteção “inativar exige estoque zerado” deixa de valer depois que outro módulo recebe mercadoria.

**Prova:** criar produto/variação sem saldo, inativar o produto pela função pública e registrar entrada de duas unidades da variação. Resultado: produto `ativo = false`, saldo 2. O PDV recusa reservar esse produto; o cadastro normal de produtos o omite.

**Corrigir:** alinhar a regra no servidor e na busca de recebimento. Se a política vigente exigir reativação, negar a entrada até reativar. O protocolo de travas deve impedir também inativação × recebimento simultâneos. Não depender só de esconder resultado na busca.

### REV-NOV-006 — P2: caminhos concorrentes criam categorias equivalentes por maiúsculas

**Código:** [`20261111135906_importacao_catalogo.sql:382`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111135906_importacao_catalogo.sql#L382), confrontado com a trava de `catalogo_salvar_categoria` e a unicidade original `(organizacao_id, nome)`.

**Prova em PostgreSQL 17, duas conexões:** administrador cadastra `CATEGORIA CONCORRENTE` e mantém a transação aberta; dono aplica uma prévia com `categoria concorrente`. O importador não usa a trava por nome normalizado do CRUD; a constraint original diferencia maiúsculas. Ambas confirmam e sobram duas categorias cujo `lower(nome)` é igual.

Esse é um caso concreto de regras novas que não se alinharam entre lotes; não é duplicidade gerada automaticamente pelo Git. A mesma estratégia de criação de marcas merece cobertura equivalente.

**Corrigir:** usar uma identidade normalizada e um protocolo de trava comum a todos os escritores; reconciliar duplicidades existentes por migration segura antes de criar unicidade normalizada. Não apagar categorias/marcas usadas. Testar CRUD × importação e importação × importação com grafias equivalentes.

### REV-NOV-007 — P2: desfazer importação reverte um preço manual posterior

**Código:** [`20261111135906_importacao_catalogo.sql:517`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/packages/banco/supabase/migrations/20261111135906_importacao_catalogo.sql#L517).

A reversão compara o valor atual ao valor importado, sem conferir a identidade/proveniência da alteração que ainda está vigente. Igualdade de valor não significa ausência de edição posterior.

**Prova em PostgreSQL 17:** importar R$ 90 sobre R$ 79; em transações posteriores o dono define manualmente R$ 120 e depois R$ 90. O vigente tem origem `manual`. Desfazer a importação substitui esse preço manual por R$ 79, apesar da promessa de preservar o que mudou depois.

**Corrigir:** guardar os IDs/versões de preço/custo criados pelo lote e reverter somente se a alteração vigente ainda pertencer àquele lote e não tiver sucessora. Manter edição posterior, inclusive se voltou ao mesmo valor. Aplicar o mesmo cuidado a custo e outros campos com histórico/versionamento.

## 4. Lacunas de volume confirmadas por leitura da tela

### REV-NOV-008 — P2: prévia limitada a 300 linhas não permite conferir o arquivo aceito

[`produtos/importar/page.tsx:84`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/produtos/importar/page.tsx#L84) busca só as primeiras 300 linhas com mudança/erro. A tela admite até 2.000, mostra totais completos e informa o recorte, mas não oferece próxima página nem exportação integral. Erros depois desse limite não podem ser localizados na interface; a aprovação pode atingir itens que a pessoa não consegue conferir.

Entregar paginação estável, filtro de erros e acesso completo às mudanças, com totais do lote independentes da página. Testar 301/2.000 linhas, erro na última linha e permissões. É lacuna operacional; não exige carregar milhares de itens de uma vez.

### REV-NOV-009 — P2: entrada antiga perde o acesso ao estorno na interface

[`estoque/entrada/page.tsx:60`](https://github.com/oraconect5g-boop/sistema-ora5g/blob/953b21e0b90f4823759de9bba8f38452dd6769e8/apps/plataforma/src/app/estoque/entrada/page.tsx#L60) lê apenas 15 entradas, sem paginação, pesquisa ou carregamento de detalhe pelo ID. As ações redirecionam com `entrada=UUID`, mas a página não o usa. Uma entrada que saiu da lista perde seu caminho de consulta/estorno na UI, embora o RPC ainda exista.

Entregar histórico paginado e detalhe por ID/número com o mesmo escopo. Testar 16+ entradas e o retorno à entrada específica após erro de estorno. Relatórios anteriores já alertavam para limites REST e busca/ações perdidas por recorte; o cuidado deve valer para os novos módulos.

## 5. Comportamento observado que precisa de contrato claro

**OBS / prova REV-NOV-003:** desfazer uma importação inativa a variação criada por ela e ainda sem uso no livro, mesmo que alguém já tenha editado seu nome. A regra específica “criadas e ainda não usadas saem de circulação” explica esse comportamento, enquanto a mensagem geral “o que mudou depois fica” sugere outra coisa. Não contabilizei isso entre os seis defeitos reproduzidos. Precisar o contrato e avisar as consequências; não apresentar a contagem de linhas mantidas como preservação de todo o trabalho posterior.

O custo de entrada adotado como custo atual é “último custo”, não média ponderada. A regra para estorno/correção desse custo precisa ser explícita antes de usar margem/DRE. Não inventar método contábil para esconder a pendência. Conferir também a inativação de loja com pendências Connect e a recuperação de operações históricas; esses cenários não foram novos defeitos reproduzidos nesta revisão.

## 6. Comparação com o programa e os relatórios

### Decisões respeitadas

Stack mantida; 11 lojas comerciais + DEFEITOS; Rein por arquivos; assistência no backlog; Nogle como integração oficial única; fiscal manual separado de emissão automática; histórico preservado por compensação; financeiro existente reaproveitado. `/catalogo` para consulta/fotos e `/produtos` para gestão usam as mesmas entidades: sua coexistência não é uma duplicação de banco a remover.

As novas migrations são aditivas; não encontrei migrations anteriores reescritas nesse intervalo. A revisão confirma os 28 arquivos e sua aplicação do zero localmente; a igualdade com o banco remoto continua dependente da evidência de ambiente do programador.

### O que não foi cumprido integralmente

- O pedido de ler todos os relatórios ainda não tem comprovação integral no checkpoint. Ele registra que corpos antigos de issues, documentos 00–13, alguns ADRs e pesquisas seriam lidos por domínio. Isso é melhor que declarar leitura inexistente, mas não satisfaz sozinho o inventário completo exigido pelo prompt. Registrar fonte/ref/hash e conclusão aplicada, incluindo as lições de custo, idempotência, concorrência e paginação.
- `EXECUCAO_INTEGRAL_STATUS.md` ainda chama `5476869` de main e L4a de branch aguardando CI/merge; a main é `953b21e`. A seção de leitura menciona “0 novos/alterados” sem preservar claramente o SHA/data daquela comparação. Desde a base do pacote são 49 novos e 20 alterados.
- `ESTADO_ATUAL_E_PASSAGEM.md` ainda diz que a PR #64 não foi integrada e conserva contagens antigas. Atualizar os resumos vivos; manter análises antigas datadas como histórico.
- L2–L4a passaram por branches e merges, mas não têm PRs próprias na coleção consultada. Criar rastreio revisável por lote/achado com o SHA integrado, conforme AGENTS/CLAUDE; esta revisão não desfaz merges autorizados.
- O registro declara **23 testados em desenvolvimento, 48 parciais, 99 não iniciados, 6 em demonstração, 2 bloqueados e 1 restrição respeitada; nenhum homologado**. Eram 19 testados/47 parciais/104 não iniciados na base anterior. Não transformar isso em percentual de plataforma pronta.
- CRM, OS, canais online, marketplaces, WhatsApp, Meta e IA não ganharam implementação funcional nesse intervalo. O financeiro continua sem contas completas, margem/DRE, conciliação e repasses. A Nogle não recebeu nova funcionalidade nesse delta; worker/credenciais/contratos/homologação continuam específicos. Os gráficos/CRUDs locais não devem aguardar todos esses fornecedores.

## 7. CI, testes e publicação

| Verificação | Resultado |
|---|---|
| Instalação limpa local | 445 pacotes; Node 22.23.4; lockfile do SHA auditado |
| Lint, typecheck e build | Aprovados |
| Testes existentes | **854 passaram**: plataforma 290, worker 12, banco 384, configuração 56, domínio 112; **2 TODO** no banco (CRM e isolamento de OS) |
| Navegador local | **205 passaram, 11 ignorados**, 360 px e 1280 px; testes condicionais/repetidos e dependências de Supabase explicam os skips; não é UAT autenticado real |
| Provas adicionais | 5 em PGlite e 2 em PostgreSQL 17; seis defeitos observados e um comportamento de contrato discutível. Passam por confirmar o estado defeituoso, não por aprová-lo |
| Auditoria npm de produção | 0 vulnerabilidades reportadas |
| Rastreabilidade e catálogo Nogle | Em dia; catálogo com 62 funções |
| Integridade das fontes | 544 textos conferidos novamente por Git blob SHA ao final; nenhum texto original alterado pela revisão |

**GitHub Actions:** a execução [`43037485041`](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43037485041), do SHA atual, terminou **cancelada** durante a instalação do Chromium; o E2E não rodou ali. A anterior `43035529709` também foi cancelada nessa fase. A execução [`43032231948`](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43032231948) falhou ao baixar dependências Ubuntu, com `Temporary failure resolving 'azure.archive.ubuntu.com'`; testes, build e audit já tinham passado. A última main verde na coleta era `ed4a468` / `43030427432`. O CI da PR #67 terminou verde (`42922662088`).

Isso distingue falha de infraestrutura do runner de bug de produto. Não há CI verde no GitHub para `953b21e` nessa coleta. A validação local completa foi reproduzida; reexecutar o workflow remoto quando a infraestrutura estiver normal, sem pular a etapa de navegador para obter verde.

A suíte E2E inclui testes de demonstração. Para os novos setores reais, os casos adicionados verificam o acesso sem login e o 307; as telas/ações também têm testes com Supabase simulado. Isso não comprova o percurso autenticado completo de cadastrar, importar, aprovar, receber e estornar com os três perfis no ambiente publicado.

**Publicação pública:** consulta sem sessão em 11/11, aproximadamente 13:42 de São Paulo: `/saude` identificou `0b6b45e`, build 10/11 às 20:45; `/financeiro` respondeu 200 (a correção posterior do 307 não estava publicada); `/lojas`, `/produtos`, `/produtos/precos`, `/produtos/importar` e `/estoque/entrada` responderam 404. Revalidar antes de publicar, seguir a autorização vigente e conferir SHA/migrations/rotas. Os 404 dessas rotas não devem motivar nova implementação.

## 8. Ordem de correção e continuação

1. Corrigir **REV-NOV-001** e acrescentar testes de leitura de custos pelas tabelas novas, além do inventário de funções expostas.
2. Corrigir **REV-NOV-002/006/007** no importador com protocolo comum de cadastro/preço, aprovação atual e reversão por identidade do lote. Cobrir simultaneidade em PostgreSQL real.
3. Corrigir **REV-NOV-004/005** e o histórico **009** no recebimento. Não apagar o IMEI para desbloquear a tela.
4. Concluir a conferência integral **008** e definir claramente a reversão de cadastros sem uso.
5. Atualizar checkpoint, passagem, rastreabilidade, issues e provas. Converter os casos de observação em regressões com o resultado seguro esperado.
6. Reexecutar CI remoto; preparar publicação revisável com retorno e só publicar pelo procedimento autorizado. Homologar usuário de teste real por perfil/loja.
7. Retomar L4b e os próximos lotes independentes do programa: CRM, completar vendas/pagamentos e financeiro; avançar o núcleo local da Nogle e OS; continuar demais domínios sem encerrar no piloto. Dependências externas bloqueiam somente a parte correspondente.

**Esta entrega documenta e prova; não corrige automaticamente os módulos nem concede novo aceite operacional ou autorização de produção.**
