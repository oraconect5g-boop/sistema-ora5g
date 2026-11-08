# Auditoria do Claude Code — requisitos, código e Supabase — 08/11/2026

**Autor:** Codex (revisor). **Base:** `7f5fd413eee756015723a53b29680db0ec655a1f`. **Comparação incremental:** `56ec9dec83e291729aa58d36fda132df3a1b3655..7f5fd413eee756015723a53b29680db0ec655a1f`. Foram 29 commits, incluindo merges e as contribuições anteriores do Codex; 90 arquivos alterados, 6.639 linhas adicionadas e 218 removidas no diff. A revisão anterior de 07/11 é histórica e permanece preservada.

## 1. Parecer

O Claude avançou a fundação real: auditoria automática de acesso, catálogo, preço/custo com histórico, estoque serializado, livro, reservas e conferência. A demonstração ganhou nove abas de Ora Connect e um catálogo de 62 operações da documentação oficial. A linguagem e a arquitetura continuam **TypeScript + React/Next.js + Tailwind + Node.js + SQL/PostgreSQL/Supabase**.

**Não liberar operação comercial real com o estoque atual:** quatro defeitos de integridade foram reproduzidos em banco descartável (#19 a #22). Há também dois bugs de fluxo na demonstração (#23/#24). Os testes existentes e o CI passam; a cobertura atual não detectava esses casos.

O inventário de requisitos fica em **1 testado em desenvolvimento, 28 parciais, 22 de demonstração, 2 bloqueados, 118 não iniciados e 1 restrição respeitada**. Nenhum está homologado pelo proprietário. As telas e o catálogo de API não representam vendas, ativações ou pagamentos funcionando de ponta a ponta.

## 2. Método, fontes e limites

- Leitura das alterações, contratos, regras, testes, estado, ADRs e planejamento do repositório; inventário dos arquivos no apêndice. Esta auditoria continua as revisões anteriores e se concentra no delta indicado.
- Testes reais da aplicação, regras e migrations em ambiente local descartável; navegador em 360 px e 1280 px. Reproduções adversariais separadas da suíte normal.
- Supabase de desenvolvimento: somente metadados, contagens agregadas, hashes e diagnósticos. Nenhum registro pessoal individual, chave, senha, arquivo de Storage ou valor de ambiente foi consultado.
- Não houve SSH, acesso ao servidor, leitura do ambiente real, DDL/DML remoto, repair/reset, criação de usuário, autenticação válida de uma pessoa, chamada operacional Nogle, implantação ou merge na main pelo Codex.
- Os passos do Claude aqui são os observáveis nos commits e objetos consultados. Não há gravação da sessão interna do Claude Code. O link privado do projeto ChatGPT não disponibilizou a conversa; a comparação usa as decisões presentes no repositório e nesta conversa disponível, sem atribuir conteúdo ao link inacessível.
- PGlite usa PostgreSQL 18.6; o remoto usa PostgreSQL 17.11. As constraints NOT NULL específicas do catálogo PG18 foram excluídas da comparação de constraints; nulabilidade foi comparada nas colunas.

## 3. O que o Claude fez, passo a passo

| Etapa observável | Entrega | Verificação e resultado |
|---|---|---|
| Resíduos de dinheiro | BigInt no limite de desconto e na margem | 82 testes de domínio passaram; #10 encerrada |
| Falha de consulta | Teste de /conta com bibliotecas Supabase reais e transporte simulado | Cobertos 503, 403, falha de rede, ausência legítima e sucesso; REV-014 conferido |
| Configuração | Grupos públicos/servidor explicados e CLI validado | 53 testes de configuração e inicialização com somente par público passaram; #12 encerrada |
| Parâmetros externos | Chaves próprias de catálogo e rejeição de listas | Login e quatro buscas não retornam 500 nos casos cobertos; #16 encerrada |
| Documentação Nogle | Coleção oficial completa e catálogo gerado | Download independente da fonte oficial teve SHA-256 idêntico ao arquivo versionado; 62 funções em 16 grupos |
| Ora Connect | Operações, ativação, linha, recarga, portabilidade, atendimento, chips, carteira e integração | 18 execuções E2E existentes da Connect passaram; dois novos defeitos reproduzidos nos dois viewports |
| Release | Identidade por commit + hash do arquivo e cópia de configuração por versão | Fixture isolada comprovou reaproveitamento, mudança de configuração, ambiente limpo, modo 600 e retorno automático; #14 encerrada |
| Histórico SQL | Renomeou as três migrations anteriores para as versões efetivamente aplicadas | Conteúdos anteriores preservados; seis versões, nomes e hashes atuais iguais ao remoto; #17 encerrada |
| Estoque na demonstração | Limite do carrinho por saldo | Zero/uma unidade, limite exato, aumento e nova busca cobertos; #18 encerrada |
| Auditoria | Gatilhos de organizações, empresas, unidades, perfis, papéis, permissões, matriz, vínculos e categorias | ORA-ORG-005 mantém testado em dev; falta aceite em homologação |
| ADR-003 e banco | Dez tabelas de catálogo/estoque, funções, RLS, índices e reversões | Schema corresponde ao remoto; #19–#22 impedem aceitar integridade do fluxo transacional |
| Dados de desenvolvimento | Semente fictícia e script para ligar usuários previamente criados no Auth | Semente idempotente passou; existem 3 unidades e 17 itens sintéticos, mas nenhum usuário no Auth |
| Passagem de contexto | Pendências do proprietário e rastreabilidade | Contagem revisada abaixo; ORA-INV-003 retorna a parcial |

As aprovações mencionadas nos documentos do Claude são declarações do histórico do projeto. O ADR-003 permanece explicitamente **proposto** e ainda precisa do aceite do proprietário para a arquitetura definitiva/produção. Sua aplicação em desenvolvimento está registrada como pedido recente do proprietário; esta revisão não presume autorização de produção.

## 4. Quantos requisitos foram cumpridos

| Situação | Main antes desta revisão | Após esta revisão |
|---|---:|---:|
| Testado em desenvolvimento | 2 | 1 |
| Parcial | 27 | 28 |
| Apenas demonstração | 22 | 22 |
| Bloqueado | 2 | 2 |
| Não iniciado | 118 | 118 |
| Restrição respeitada | 1 | 1 |
| Homologado pelo proprietário | 0 | 0 |
| **Total de requisitos** | **172** | **172** |

O único requisito mantido como testado é **ORA-ORG-005**, auditoria automática de acesso/configuração. **ORA-CAT-003** é a restrição cumprida de não usar API da Rein. **ORA-INV-003** saiu de testado para parcial por entradas sem movimento e saldo serializado incorreto. Nenhum requisito recebeu aceite de homologação nesta auditoria.

A matriz com os 172 IDs, funções, evidências e pendências está em [MATRIZ_DOS_172_REQUISITOS_2026-11-08.md](MATRIZ_DOS_172_REQUISITOS_2026-11-08.md). O status atual está no JSON de alinhamento e a rastreabilidade foi regenerada. O backlog original continua sendo o catálogo histórico de planejamento, com campos planned-not-implemented; o status real vem do arquivo de alinhamento.

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

## 5. Erros e bugs reproduzidos

Os quatro primeiros achados são **P1, bloqueantes para uso transacional real**, conforme as regras do projeto para estoque/dinheiro. Os dois últimos são **P2 da demonstração**. Não foi demonstrada venda indevida ou cobrança real; os cenários usaram somente fixtures.

### REV-020 — IMEI principal pode se repetir no IMEI2 de outro aparelho

Issue [#19](https://github.com/oraconect5g-boop/sistema-ora5g/issues/19); requisitos ORA-INV-002, ORA-INV-006; [packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql:198](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L198).

Os índices únicos de `imei` e `imei2` são independentes. Com dois aparelhos distintos, atualizar o IMEI2 do segundo para o IMEI principal do primeiro é aceito. Ambos passam pelo Luhn e pela validação do tipo; o mesmo identificador passa a apontar para dois aparelhos.

Reproduzido em PGlite com todas as seis migrations da main e as fixtures de `cenario-catalogo.ts`: `update public.itens_serializados set imei2 = cat.imei1 where id = itens.a2`. O teste exigindo rejeição recebeu sucesso. Nenhum dado remoto foi alterado.

Garantir unicidade do conjunto dos IMEIs de cada organização, incluindo cruzamento entre principal e secundário e concorrência. Uma tabela de identificadores com índice único é uma opção; uma consulta de gatilho sem trava não basta. Preservar devoluções e os dois IMEIs válidos do mesmo aparelho.

### REV-021 — Reserva aceita outra quantidade ou origem com a mesma chave

Issue [#20](https://github.com/oraconect5g-boop/sistema-ora5g/issues/20); requisitos ORA-INV-005, ORA-POS-004; [packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql:603](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L603).

O caminho de repetição em `reservar_estoque` compara autor, variante, item e unidade, mas ignora quantidade e origem. Reservar 1 acessório e repetir a chave pedindo 9 devolve sucesso com a reserva antiga de 1. Trocar `pdv` por `online` também é aceito. Isso quebra o contrato declarado de OR004 para chave usada em outra operação e pode deixar o checkout acreditar que reservou outra quantidade.

Dois testes independentes, como `authenticated` e com unidade selecionada, esperavam OR004 e receberam sucesso. Testes executados somente em banco descartável.

Comparar o conteúdo normalizado relevante antes de aceitar repetição, incluindo quantidade e origem; definir o contrato do prazo. Repetição idêntica deve devolver a mesma reserva, sem efeito adicional. Também falta testar duas conexões simultâneas repetindo a mesma chave: a consulta anterior à trava não resolve sozinha essa corrida.

### REV-022 — Colisão de chave na entrada pode devolver outro IMEI ou criar item sem movimento

Issue [#21](https://github.com/oraconect5g-boop/sistema-ora5g/issues/21); requisitos ORA-INV-003, ORA-INV-004, ORA-QUAL-007; [packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql:439](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L439).

`registrar_item_serializado` trata qualquer movimento com a mesma chave como a mesma entrada, sem conferir variante, loja e identificadores. Com a chave de um aparelho existente e outro IMEI, devolve o aparelho antigo. Com a chave de uma entrada de acessórios, a consulta encontra `item_serializado_id = null`, cria o novo aparelho e chama `lancar_movimento`; o ON CONFLICT desse lançamento ignora a colisão. A função devolve o item novo, mas ele não possui entrada correspondente no livro.

Os dois caminhos foram reproduzidos sobre as seis migrations e fixtures, em banco descartável. Os testes que exigiam OR004 receberam sucesso. Isso afeta a declaração de ORA-INV-003 como testado: nem toda entrada produz o fato correspondente.

Validar o conteúdo da chave em `registrar_item_serializado` e `lancar_movimento`; rejeitar colisões de outra operação, garantindo rollback de item e movimento juntos. Preparar teste de duas chamadas simultâneas com a mesma chave.

### REV-023 — Livro aceita nova entrada do mesmo aparelho já presente e infla saldo

Issue [#22](https://github.com/oraconect5g-boop/sistema-ora5g/issues/22); requisitos ORA-INV-002, ORA-INV-003; [packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql:324](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql#L324).

O gatilho `validar_movimento` confere variante, loja e quantidade ±1, mas não impede registrar outra entrada +1 do mesmo item serializado já presente. `privado.lancar_movimento` aceita a segunda entrada com chave nova. No cenário de teste, o saldo da loja passa de 2 para 3 aparelhos, embora existam apenas 2 aparelhos disponíveis.

Reproduzido em banco descartável: chamar `privado.lancar_movimento` com +1, `entrada_compra`, `itens.a1` e chave inédita. A igualdade saldo × quantidade de itens disponíveis falhou: 3 versus 2. A soma do livro continua igual ao saldo, por isso o teste existente não detecta o erro.

Controlar a posição de estoque por item e suas transições sob trava; uma entrada não pode tornar positivo duas vezes o mesmo item. Não criar uma unicidade permanente do item no livro, pois saída e devolução legítimas precisam continuar possíveis. Função interna sem acesso direto de authenticated; o risco está no caminho privilegiado de importação/operação, não em escrita direta pela interface.

### REV-024 — Demonstração transfere eSIM acima do estoque central sem baixá-lo

Issue [#23](https://github.com/oraconect5g-boop/sistema-ora5g/issues/23); requisitos ORA-CONNECT-001, ORA-CONNECT-011; [apps/plataforma/src/app/demo/connect/_abas/ChipsConnect.tsx:54](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/ChipsConnect.tsx#L54).

O caminho de transferência eSIM apenas valida quantidade de 1 a 100 e soma ao estoque da loja. Não limita pela quantidade em `virgem` nem remove unidades da origem. A tela informa 4 eSIM no estoque central, mas aceita transferir 5 (e até repetir), elevando 15 para 20 na loja e mantendo a origem em 4.

Reproduzido em Playwright, como gerente, em 360 px e 1280 px: Chips e entrega → eSIM → quantidade 5 → Transferir. A mensagem de sucesso aparece. Os dois testes que exigiam recusa falharam.

Simular também a reserva/baixa da origem e recusar quantidade acima do disponível. Definir a identidade do eSIM transferido para não reaproveitar unidades. É bug da demonstração: nenhuma operação real foi enviada à Contel.

### REV-025 — Recarga paga pelo LINK aparece como saldo e recebimento na loja

Issue [#24](https://github.com/oraconect5g-boop/sistema-ora5g/issues/24); requisitos ORA-CONNECT-003, ORA-PAY-003, ORA-FIN-001; [apps/plataforma/src/app/demo/connect/_abas/RecargaConnect.tsx:65](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/RecargaConnect.tsx#L65).

Depois de escolher LINK, solicitar e clicar em `Cliente pagou (simulação)`, o pedido mantém `pagamento: LINK`, mas o ramo confirmado mostra sempre `feita pelo saldo` e `O cliente pagou ... na loja`. O valor da carteira permanece sem débito nesse caminho. Assim a mesma operação aparece como link antes e saldo/recebimento na loja depois.

Reproduzido em Playwright nos dois tamanhos de tela; o teste que exigia ausência de `feita pelo saldo` após pagamento LINK falhou em ambos.

Renderizar a confirmação conforme `pedido.pagamento`, mantendo separados pagamento do cliente, débito da carteira da Ora e recebimento do caixa. Cobrir LINK confirmado e SALDO confirmado. É bug de informação na demonstração; não houve movimentação financeira real.

### Como reproduzir com segurança

As fontes dos testes estão em [evidencias/2026-11-08/LEIA-ME.md](evidencias/2026-11-08/LEIA-ME.md). São seis casos de banco e dois casos de tela executados em dois viewports (quatro falhas de navegador). Os dez resultados adversariais falharam exatamente nas invariantes verificadas. As cópias temporárias foram retiradas das pastas de testes do produto; as evidências ficam em documentação para o Claude transformar em regressões ao corrigir.

**Correção esperada:** criar migrations novas, preservar hashes e histórico já aplicados, validar o conteúdo das chaves, controlar posição por item sob trava e provar repetição/concorrência. A main não deve ter migrations aplicadas reescritas.

## 6. Inventário funcional atual

### Front-end

Há 17 páginas sob /demo, contando o seletor de perfil. Rotas: /demo; /demo/perfil; /demo/vender; /demo/vendas; /demo/produtos; /demo/estoque; /demo/clientes; /demo/aprovacoes; /demo/connect; /demo/assistencia; /demo/metas; /demo/financeiro; /demo/relatorios; /demo/canais; /demo/lojas; /demo/importacao; /demo/auditoria.

A Connect tem nove abas. Cinco perfis e troca de loja usam cookies da demonstração. Os dados vêm de fixtures e as ações alteram estado local. O selo de demonstração permanece e APP_ENV=producao bloqueia essas rotas. O técnico na demonstração continua sendo proposta para P5; o ranking do vendedor depende de P3.

/entrar e /conta são a parte real do front-end: autenticação por senha/SSR e consulta de perfil/unidades via RLS. Ainda faltam seleção real da unidade pela aplicação, recuperação de senha, sessão por turno e validação com usuário autorizado.

### Backend e domínio

- Server Actions entrar/sair; renovação SSR no proxy; configuração e /saude. /saude é liveness e consulta a saúde do Auth, não prova de venda, reserva ou consulta SQL completa.
- A aplicação real consulta perfil e unidades. Ainda não chama as funções novas de catálogo/estoque nem persiste vendas, pagamentos, clientes, aprovações, fiscal, OS ou telecom.
- As regras puras de dinheiro, identificadores, itens, desconto, pagamentos e produção permanecem reutilizáveis em TypeScript. A regra no cliente deve ser repetida/validada no servidor antes de qualquer escrita real.
- Não há cliente HTTP operacional da Nogle, worker operacional, emissor fiscal, integração PicPay/PagSeguro ou canais externos implementados. O catálogo Nogle e os 14 testes de normalização são fundação parcial do adaptador.

### Supabase e banco

Foram confirmadas **20 tabelas, todas com RLS**, 20 policies SELECT e 20 grants SELECT de authenticated examinados; 33 funções em public/privado, 167 colunas, 131 constraints comparáveis, 83 índices e 19 gatilhos. Todos esses objetos comparados correspondem ao banco limpo criado com as seis migrations do Git. Isso prova correspondência estrutural, não correção de todas as regras: os achados acima existem também na migration correspondente.

| Grupo | Tabelas | Situação consultada |
|---|---|---|
| Acesso | organizacoes, empresas, unidades, perfis_usuario, papeis, permissoes, papel_permissoes, vinculos, contexto_sessao, auditoria | 1 organização e 1 empresa sintéticas; 3 unidades; 5 papéis; 31 permissões; 69 relações; nenhum perfil/vínculo ou usuário/sessão de Auth |
| Catálogo | categorias, marcas, produtos, variantes, precos, custos | 3 categorias, 3 marcas, 6 produtos, 6 variantes, 6 preços e 5 custos sintéticos |
| Estoque | itens_serializados, estoque_movimentos, estoque_saldos, estoque_reservas | 17 itens sintéticos, 21 movimentos, 10 linhas de saldo e nenhuma reserva; isso não é estoque real importado da Rein |

RPCs públicas atuais: unidade_atual, tem_permissao, selecionar_unidade, preco_vigente, disponibilidade_na_rede, reservar_estoque, liberar_reserva e conferir_item. A leitura do custo é protegida no banco. O livro recusa UPDATE/DELETE/TRUNCATE; os defeitos apontados se encontram na criação e identidade dos fatos.

Não existem tabelas de vendas, pagamentos, caixa, clientes CRM, fiscal ou OS. Storage possui zero buckets e a publicação Realtime possui zero tabelas públicas do aplicativo na consulta. Nenhum resultado de Auth válido foi obtido; a ausência de usuários explica por que ainda não é possível usar o sistema real de ponta a ponta com uma pessoa.

O advisor de segurança retorna oito avisos esperados de RPC SECURITY DEFINER acessível ao usuário autenticado; as guardas internas devem continuar testadas. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable. O advisor de desempenho informa 37 índices sem uso, compatíveis com a ausência de tráfego real; nenhuma remoção foi sugerida apenas por esse contador. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index.

### Ambiente e integrações

O modelo de ambiente da raiz possui 60 nomes previstos e o da plataforma possui seis (quatro da aplicação e dois opcionais para Auth público). Não falta um novo .env.example para apresentar o mockup. O .env real é local/ignorado e não foi inspecionado; seu preenchimento não pode ser inferido pelo modelo.

O login depende somente da URL e da chave pública válidas; chave secreta e conexão SQL são de tarefas administrativas/worker. SMTP do Auth e SMTP da aplicação exigem configuração própria. Nogle, fiscal, pagamentos e canais só devem exigir suas variáveis quando seus módulos forem ativados. O guia [CONFIGURACAO_E_TRANSICAO_DO_MOCKUP](../alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md) já descreve essa sequência.

## 7. Melhorias para preservar o trabalho e o escopo

1. Reutilizar componentes visuais e regras puras; criar consultas/serviços de servidor e DTOs por papel. O PDV e a Connect enviam listas completas de fixtures ao navegador, incluindo custos e documentos fictícios. Ao ligar dados reais, custo, margem e cadastros completos não podem seguir esse contrato; busca exata deve ocorrer no servidor e ser auditada.
2. Gerar e versionar os tipos Supabase ao integrar a primeira tela real. Definir transporte e limite de centavos: PostgreSQL bigint aceita valores além do inteiro seguro JavaScript; evitar conversões silenciosas.
3. Provar concorrência com duas conexões reais em desenvolvimento: mesmo IMEI, mesma chave simultânea, liberação versus nova reserva e expiração. Os testes atuais de PGlite são sequenciais. Avaliar ordem de locks, reconsulta de chaves e tratamento de conflito/deadlock.
4. Definir autoria/autorização da liberação de reserva: hoje qualquer usuário com venda.registrar na unidade consegue liberá-la. O contrato precisa dizer quando um vendedor pode cancelar reserva de colega e exigir auditoria/gestão se necessário.
5. Na Connect, quantidade de renovações e observações são recolhidas, mas não são preservadas no estado final correspondente; saldo de ativação/recarga usa fator 0,8 de exemplo, sem validar saldo suficiente. Completar esses contratos antes de integração financeira. Não tratar valores ilustrativos como taxa real aprovada.
6. definir-chave.sh oculta entrada, restringe nomes e grava arquivo 600 por troca atômica. A leitura foi estática: não foi usado com ambiente real. Ele rejeita aspas, cifrão e barra invertida; dar suporte a escape compatível com o carregador de ambiente ou documentar caminho seguro para credenciais de terceiro que contenham esses caracteres, sem pedir credenciais mais fracas.
7. O catálogo Nogle representa a documentação, não 62 adaptadores implementados. A coleção oficial corresponde exatamente ao arquivo versionado (SHA-256 002d13dab3099a95c1e018bdc9d0d63dba30adcacfa141efccdd062f29c88ead). Continuam abertas as dúvidas de GET com corpo (25 operações), autenticação P9, sandbox, validade de token, idempotência, recarga e exemplo de portabilidade inconsistente.
8. Atualizar sumários antigos de planejamento à luz desta auditoria: contagens de testes, três versus seis migrations, auditoria antes ausente e estoque antes inexistente estão desatualizados em documentos históricos. Não apagar evidências anteriores nem apresentar documentação antiga como fotografia atual.
9. Registrar os requisitos próprios de OS e manter issue → requisito → PR → teste → aceite. As 60 variáveis previstas não equivalem a 60 serviços que precisam ser configurados agora.

## 8. Próximos passos em ordem

| Ordem | Entrega | Critério para avançar | Dependência |
|---|---|---|---|
| 1 | Corrigir #19–#22 por novas migrations; corrigir #23/#24 no mockup | Reproduções viram regressões verdes; posição serializada, chave/payload e rollback corretos | Claude Code; revisão Codex |
| 2 | Concluir ORA-006: usuário autorizado, escolha real da unidade, revogação, renovação e recuperação | Entrar, alternar loja permitida, negar loja estranha, expirar/renovar sessão, bloquear vínculo e recuperar senha | Usuários pelo painel/fluxo autorizado; SMTP para recuperação; #11 |
| 3 | Aceitar/ajustar ADR-003 e integrar catálogo/estoque nas telas | Consultas via RLS; custos restritos; tipos gerados; conferência e reservas reais com teste de concorrência | Decisões Q1–Q4/P14; acesso de teste; conexão de dev para duas sessões |
| 4 | Importador Rein em prévia, aprovação e conciliação | Mesmo arquivo não duplica; erros por linha; entradas/preços/custos rastreáveis; saldo físico piloto conferido | CSV anonimizado e dados autorizados das lojas; nenhuma API da Rein |
| 5 | ADR-004 e PDV mobile persistente | Rascunho → reserva → pagamento → conclusão idempotente; preço e política registrados no momento; cancelamento compensatório | Catálogo/estoque íntegros e política de desconto |
| 6 | Caixa, pagamento misto e financeiro básico | Abertura, entradas/saídas, troco correto, fechamento e diferença; repasses e conciliação separados | Condições PayJoy/Aiva, métodos reais e contratos verificados |
| 7 | Fila de aprovação e fiscal inicial, CRM e comunicações | Pedido auditável; autoridade correta; alertas; vínculo cliente/venda; aprovação interna respeita prazo fiscal | Matriz de aprovação; contador, emissor e SMTP/WhatsApp conforme módulo |
| 8 | Turnos, metas, performance e OS | Produção/comissão por fato confirmado e idempotente; fluxo técnico/cliente rastreável | P3, P5; formalização dos IDs de OS |
| 9 | Adaptador Nogle no servidor e operação telecom | Segredos somente no servidor; estados pendentes; reconsulta; confirmação externa; reconciliação e atribuição | P9, credenciais no gerenciador, transporte confirmado e linha de teste |
| 10 | Piloto paralelo Santa Cândida | 2–4 semanas de caixas/estoque/relatórios batendo com Rein; usuário real e restauração aprovados | Dados conferidos, suporte, contingência, segurança e aceite |
| 11 | Fiscal automatizado e go/no-go | Homologação contador/provedor; notas/estornos e pagamento conciliáveis; autorização de saída da Rein | Certificado, contratos e evidências do piloto |
| 12 | Ondas 1 → 3 → 7 → 14 e canais | Cada onda estabilizada; estoque/preço/pedido online consistente; Mercado Livre, depois TikTok/loja básica/WhatsApp no plano | CNPJs, logística, contas e acesso aos provedores |
| 13 | Escopo posterior | Shopee, Meta avançado, IA e BI avançado conforme priorização | Núcleo estável e decisões do proprietário |

O plano de seis meses permanece: mês 1 fundação/catálogo/importação/estoque; mês 2 PDV/caixa; mês 3 piloto paralelo/turnos/OS/Nogle; mês 4 fiscal e go/no-go; mês 5 expansão/Mercado Livre; mês 6 TikTok, loja básica e WhatsApp. Segurança, LGPD, observabilidade, backup e teste de restauração devem acompanhar o piloto e cada onda.

Pendências do proprietário já organizadas em [PENDENCIAS_DO_PROPRIETARIO.md](../PENDENCIAS_DO_PROPRIETARIO.md): lojas/CNPJs, usuários autorizados, arquivo Rein, políticas de desconto, P3/P5, contador/fiscal, repasses, tipo de chave Nogle e definições de operação online. A documentação atual não comprova que esses dados já foram fornecidos no servidor.

## 9. Testes e CI

| Verificação | Resultado |
|---|---|
| CI main 0a19c71 | [42481975289](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42481975289), sucesso |
| CI main 7f5fd41 | [42510057118](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42510057118), sucesso, inclusive npm ci, lint, tipos, testes, build, audit, navegador e verificações de catálogo/rastreabilidade/segredos |
| Local lint/typecheck/build | Passaram em Node 22.23.4 |
| Testes locais existentes | **314 passaram**: plataforma 86, banco 93, configuração 53, domínio 82; **4 TODO** no banco |
| E2E locais existentes | **106 passaram e 10 pulados**, em 116 execuções parametrizadas; seis repetições desnecessárias por viewport e quatro dependentes de configuração pública de Auth ausente neste ambiente |
| Adversariais do banco | **6 falhas reproduziram #19–#22**, em banco descartável com as seis migrations |
| Adversariais de tela | **4 falhas reproduziram #23/#24** nos dois viewports |
| Histórico e objetos remotos | Seis migrations/hash e sete grupos de metadados correspondentes ao banco limpo |
| Fonte Nogle | Download oficial e arquivo versionado com SHA-256 idêntico; gerador --conferir passou |
| Release isolada | Seis propriedades conferidas, três builds/servidor simulados; nenhum acesso ao ambiente real |
| Scanner/auditoria de dependências locais | Nenhum segredo encontrado; npm audit --omit=dev: zero vulnerabilidades |

Os quatro TODO de banco continuam ligados a aprovações próprias e ao isolamento das futuras consultas de cliente/OS; não contam como passados. Falta sessão válida real (#11), autenticação multifator, prova com duas conexões e homologação dos fluxos externos. As reversões foram lidas e permanecem restritas a banco descartável; não foram executadas nesta revisão.

## 10. Acompanhamento dos achados anteriores

Encerradas nesta revisão após evidência independente: **#10, #12, #14, #16, #17 e #18**. O REV-014 teve cobertura adicional conferida sem issue própria. **#11 permanece aberta**, por falta de renovação de sessão testada com usuário real. Os novos achados são **#19 a #24**. Não reabrir as issues anteriores para os defeitos novos: os cenários e contratos são diferentes.

A PR #15 anterior foi incorporada pelo Claude; esta auditoria é um novo conjunto de documentos e ajustes de rastreabilidade, com data e base próprias.

## Apêndice A — commits examinados no intervalo

| Commit | Registro no Git |
|---|---|
| [73990bc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/73990bcc676e2efcfbbd596ed9623b6272582f95) | docs(review): analisar ajustes do Claude em Apache e apresentação |
| [cca1fcf](https://github.com/oraconect5g-boop/sistema-ora5g/commit/cca1fcfd9907a1306e13d46c830434cc12862e97) | fix(dominio): limite de desconto e margem em inteiros exatos (REV-008, #10) |
| [4b8ce8f](https://github.com/oraconect5g-boop/sistema-ora5g/commit/4b8ce8fc768b4bd7369eb4d806410f6773e5557a) | test(plataforma): /conta com falha de consulta e serviço simulado (REV-014, sem issue própria) |
| [5f4dec7](https://github.com/oraconect5g-boop/sistema-ora5g/commit/5f4dec7079b57effa0e555b536ad7f0550ec5e87) | docs(audit): mapear front-end, backend, migrations e Supabase real |
| [4b17905](https://github.com/oraconect5g-boop/sistema-ora5g/commit/4b179050800f89c8caae79253a549394ff3011a6) | fix(config): grupos atuais do verificar-env nas instruções (CONFIG-001, #12) |
| [fceb372](https://github.com/oraconect5g-boop/sistema-ora5g/commit/fceb37209a9bb318862a986fe1067c620abded21) | fix(plataforma): código de erro e filtros do endereço validados (REV-017, #16) |
| [3c3731e](https://github.com/oraconect5g-boop/sistema-ora5g/commit/3c3731e37d4a1bebf9d8626f44ba75f34d3c77c7) | docs(integracoes): API Nogle lida por inteiro (62 funções) com cópia da coleção oficial |
| [bbb6e5b](https://github.com/oraconect5g-boop/sistema-ora5g/commit/bbb6e5b059fe4192cf034df7423ae3f813add7b7) | feat(integracoes): catálogo gerado e regras da API Nogle (ORA-CONNECT-004) |
| [f5edc8a](https://github.com/oraconect5g-boop/sistema-ora5g/commit/f5edc8ae86c7ee40981c451c643e33217c9d9e2a) | feat(connect): todas as funções da Nogle na tela Ora Connect da demonstração (ORA-CONNECT-001 a 011) |
| [ff67f14](https://github.com/oraconect5g-boop/sistema-ora5g/commit/ff67f14ee8b9d97b5291c897298e131781a42570) | docs: estado e rastreabilidade da Ora Connect |
| [33d5e6e](https://github.com/oraconect5g-boop/sistema-ora5g/commit/33d5e6e7ff5f8ba18a22c7747d572ec949f89712) | fix(deploy): versão identificada por commit e configuração (REV-016, #14) |
| [5560efa](https://github.com/oraconect5g-boop/sistema-ora5g/commit/5560efa13c820e4beaf3b66fa3babb051aa61d3f) | Merge branch 'feature/ORA-connect-nogle' |
| [cd0975e](https://github.com/oraconect5g-boop/sistema-ora5g/commit/cd0975e06b087b098d0263c994dba47ee2ecc4f7) | docs(deploy): configuração por versão, teste isolado e domínio principal (REV-016, #14) |
| [f72f521](https://github.com/oraconect5g-boop/sistema-ora5g/commit/f72f52103b617579ade85aaee0dfbd9c2ea4ff26) | Merge origin/main (Ora Connect, 5560efa) na branch dos resíduos do Codex |
| [6889719](https://github.com/oraconect5g-boop/sistema-ora5g/commit/68897191f26781c0deacf65ac50760643afb8a25) | Merge da revisão do Codex (73990bc e 5f4dec7): revisão incremental de 8e1625d e auditoria funcional |
| [ccfcfd4](https://github.com/oraconect5g-boop/sistema-ora5g/commit/ccfcfd4eb2bf163adbf890a22d95627c0c06689d) | docs: respostas de 08/11, fila de revisão e rastreabilidade (REV-008 #10, REV-014, REV-016 #14, CONFIG-001 #12, REV-017 #16, REV-015 #13) |
| [5775f60](https://github.com/oraconect5g-boop/sistema-ora5g/commit/5775f60fb3ce204b246b656773f38a426bd4ae8a) | docs: resultado da sequência do CI antes do merge (REV-008 #10, REV-014, REV-016 #14, CONFIG-001 #12, REV-017 #16) |
| [0a19c71](https://github.com/oraconect5g-boop/sistema-ora5g/commit/0a19c713ffa73ffb01a4e7a7e51f6b9949879339) | Merge branch 'fix/residuos-codex-2026-11-07' (resíduos da conferência do Codex e #16) |
| [88207f6](https://github.com/oraconect5g-boop/sistema-ora5g/commit/88207f679dacbd2dbd30fc0e85ced2a38d816596) | fix(banco): versões das migrations iguais às do Supabase (REV-018, #17) |
| [e2c4841](https://github.com/oraconect5g-boop/sistema-ora5g/commit/e2c4841fa2c00008b0b650ed5ca0f4cc56d5f31a) | fix(demo): acessório não passa do estoque da loja no PDV (REV-019, #18) |
| [04248ab](https://github.com/oraconect5g-boop/sistema-ora5g/commit/04248abb7d431f2fcdd71614a9162370a07c29c2) | docs: tudo o que depende do proprietário e comando para gravar chaves sem exibir |
| [345bd0b](https://github.com/oraconect5g-boop/sistema-ora5g/commit/345bd0bb63637647423573754d80dd1a87c073bf) | feat(banco): auditoria automática das mudanças de acesso (ORA-ORG-005) |
| [d4fcda9](https://github.com/oraconect5g-boop/sistema-ora5g/commit/d4fcda9707b6ccb190582e1be81dc9fc7d72b732) | feat(banco): catálogo, preço, custo e estoque com IMEI/ICCID (ADR-003, ORA-007/010/011) |
| [544ff16](https://github.com/oraconect5g-boop/sistema-ora5g/commit/544ff16c188392ff3e46f870b6debf435c114fbe) | feat(banco): semente fictícia do desenvolvimento e ligação dos usuários de teste |
| [6b851fd](https://github.com/oraconect5g-boop/sistema-ora5g/commit/6b851fdd17c0b62a530d0eb485f38ed131b35344) | perf(banco): índices das chaves compostas do catálogo e estoque |
| [7aa5d87](https://github.com/oraconect5g-boop/sistema-ora5g/commit/7aa5d87bfb268f91c50b310cb680a131ae4f8a18) | docs: revisão do planejamento, estado de 08/11, pedido de revisão e respostas (#17, #18) |
| [5be57cc](https://github.com/oraconect5g-boop/sistema-ora5g/commit/5be57cc783bbf70816cb091270c17c5032f3937b) | test(e2e): aviso de limite do REV-019 some ao começar nova busca |
| [cb7bfe9](https://github.com/oraconect5g-boop/sistema-ora5g/commit/cb7bfe9fc408722acb765957a0dee63fdbae485e) | docs: resultado da sequência do CI antes do merge (implantação do piloto, 08/11) |
| [7f5fd41](https://github.com/oraconect5g-boop/sistema-ora5g/commit/7f5fd413eee756015723a53b29680db0ec655a1f) | Merge branch 'feature/ORA-implantacao-piloto' (back-end do piloto: #17, #18, ORA-ORG-005, ADR-003 catálogo e estoque, pendências do proprietário) |

## Apêndice B — arquivos do diff

A classificação abaixo registra o método aplicado: leitura de código/testes/documentos; os arquivos gerados foram conferidos por origem, hash e gerador. Reversões e o gravador de chaves receberam leitura estática; as limitações estão acima.

| Arquivo | Método e observação |
|---|---|
| [.github/workflows/ci.yml](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/.github/workflows/ci.yml) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/README.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/README.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/e2e/connect.spec.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/e2e/connect.spec.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/e2e/demonstracao.spec.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/e2e/demonstracao.spec.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/e2e/entrar.spec.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/e2e/entrar.spec.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/e2e/inicializacao.spec.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/e2e/inicializacao.spec.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/e2e/servidor-auxiliar.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/e2e/servidor-auxiliar.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/playwright.config.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/playwright.config.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/conta/page.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/conta/page.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/src/app/demo/clientes/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/clientes/page.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/AtendimentoConnect.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/AtendimentoConnect.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/AtivarChip.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/AtivarChip.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/Carteira.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/Carteira.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/ChipsConnect.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/ChipsConnect.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/ConsultarLinha.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/ConsultarLinha.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/Integracao.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/Integracao.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/Operacoes.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/Operacoes.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/PortabilidadeConnect.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/PortabilidadeConnect.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/RecargaConnect.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/RecargaConnect.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/_abas/util.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/_abas/util.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/connect/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/connect/page.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/estoque/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/estoque/page.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/produtos/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/produtos/page.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/vendas/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/vendas/page.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/vender/PDV.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/vender/PDV.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/demo/vender/estoque.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/vender/estoque.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/src/app/demo/vender/estoque.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/demo/vender/estoque.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/app/entrar/page.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/app/entrar/page.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/componentes/ui.tsx](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/componentes/ui.tsx) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/demo/dados/connect.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/demo/dados/connect.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/demo/dados/index.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/demo/dados/index.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/demo/perfis.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/demo/perfis.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/integracoes/nogle/catalogo.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/integracoes/nogle/catalogo.ts) | Gerador --conferir, catálogo e testes |
| [apps/plataforma/src/integracoes/nogle/nogle.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/integracoes/nogle/nogle.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/src/integracoes/nogle/regras.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/integracoes/nogle/regras.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/src/lib/parametros.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/lib/parametros.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [apps/plataforma/src/lib/parametros.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/src/lib/parametros.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [apps/plataforma/vitest.config.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/apps/plataforma/vitest.config.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [deploy/homologacao/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/deploy/homologacao/LEIA-ME.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [deploy/homologacao/definir-chave.sh](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/deploy/homologacao/definir-chave.sh) | Leitura estática, entrada oculta e escrita atômica |
| [deploy/homologacao/garantir-no-ar.sh](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/deploy/homologacao/garantir-no-ar.sh) | Leitura e fixture de configuração/reversão isolada |
| [deploy/homologacao/publicar.sh](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/deploy/homologacao/publicar.sh) | Leitura e fixture de configuração/reversão isolada |
| [docs/06_INTEGRACOES.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/06_INTEGRACOES.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/ESTADO_ATUAL_E_PASSAGEM.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/ESTADO_ATUAL_E_PASSAGEM.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/PENDENCIAS_DO_PROPRIETARIO.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/PENDENCIAS_DO_PROPRIETARIO.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/RASTREABILIDADE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/RASTREABILIDADE.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/REVISAO_DO_PLANEJAMENTO_2026-11-08.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/REVISAO_DO_PLANEJAMENTO_2026-11-08.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/REVISOES_CODEX.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/REVISOES_CODEX.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/alinhamento/status-requisitos.json](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/alinhamento/status-requisitos.json) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/analises/REVISAO_INCREMENTAL_2026-11-07_8e1625d.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/integracoes/NOGLE_API_REFERENCIA.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/integracoes/NOGLE_API_REFERENCIA.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/integracoes/VARIAVEIS_DE_AMBIENTE.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/integracoes/VARIAVEIS_DE_AMBIENTE.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [docs/integracoes/nogle/colecao-postman-2026-11-07.json](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/docs/integracoes/nogle/colecao-postman-2026-11-07.json) | Origem oficial e SHA-256 independente |
| [packages/banco/README.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/README.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/banco/src/auditoria-acesso.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/auditoria-acesso.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/banco/src/banco-de-teste.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/banco-de-teste.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/banco/src/catalogo-estoque.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/catalogo-estoque.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/banco/src/cenario-catalogo.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/cenario-catalogo.ts) | Gerador --conferir, catálogo e testes |
| [packages/banco/src/migrations.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/migrations.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/banco/src/revisao-codex.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/revisao-codex.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/banco/src/semente.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/src/semente.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/banco/supabase/aplicadas-dev.json](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/aplicadas-dev.json) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/banco/supabase/migrations/20261107140352_fundacao_acesso.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261107140352_fundacao_acesso.sql) | SQL, histórico/hash e objetos; testes de banco; renomeado, conteúdo preservado ou referência atualizada |
| [packages/banco/supabase/migrations/20261107140448_indices_chaves_estrangeiras.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261107140448_indices_chaves_estrangeiras.sql) | SQL, histórico/hash e objetos; testes de banco; renomeado, conteúdo preservado ou referência atualizada |
| [packages/banco/supabase/migrations/20261107151305_correcoes_revisao_codex.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261107151305_correcoes_revisao_codex.sql) | SQL, histórico/hash e objetos; testes de banco; renomeado, conteúdo preservado ou referência atualizada |
| [packages/banco/supabase/migrations/20261108150432_auditoria_automatica_acesso.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150432_auditoria_automatica_acesso.sql) | SQL, histórico/hash e objetos; testes de banco |
| [packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108150620_catalogo_estoque.sql) | SQL, histórico/hash e objetos; testes de banco |
| [packages/banco/supabase/migrations/20261108151325_indices_catalogo_estoque.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/migrations/20261108151325_indices_catalogo_estoque.sql) | SQL, histórico/hash e objetos; testes de banco |
| [packages/banco/supabase/reversao/20261107140352_fundacao_acesso.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/reversao/20261107140352_fundacao_acesso.sql) | Leitura estática; não executada; renomeado, conteúdo preservado ou referência atualizada |
| [packages/banco/supabase/reversao/20261107140448_indices_chaves_estrangeiras.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/reversao/20261107140448_indices_chaves_estrangeiras.sql) | Leitura estática; não executada; renomeado, conteúdo preservado ou referência atualizada |
| [packages/banco/supabase/reversao/20261107151305_correcoes_revisao_codex.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/reversao/20261107151305_correcoes_revisao_codex.sql) | Leitura estática; não executada; renomeado, conteúdo preservado ou referência atualizada |
| [packages/banco/supabase/reversao/20261108150432_auditoria_automatica_acesso.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/reversao/20261108150432_auditoria_automatica_acesso.sql) | Leitura estática; não executada |
| [packages/banco/supabase/reversao/20261108150620_catalogo_estoque.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/reversao/20261108150620_catalogo_estoque.sql) | Leitura estática; não executada |
| [packages/banco/supabase/reversao/20261108151325_indices_catalogo_estoque.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/reversao/20261108151325_indices_catalogo_estoque.sql) | Leitura estática; não executada |
| [packages/banco/supabase/semente/LEIA-ME.md](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/semente/LEIA-ME.md) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/banco/supabase/semente/desenvolvimento.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/semente/desenvolvimento.sql) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/banco/supabase/semente/vincular-usuarios-de-teste.sql](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/banco/supabase/semente/vincular-usuarios-de-teste.sql) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/config/scripts/verificar-env.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/config/scripts/verificar-env.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/config/src/ambiente.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/config/src/ambiente.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/config/src/ambiente.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/config/src/ambiente.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/config/src/verificar-env.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/config/src/verificar-env.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [packages/dominio/src/desconto.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/dominio/src/desconto.ts) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |
| [packages/dominio/src/revisao-codex.test.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/packages/dominio/src/revisao-codex.test.ts) | Leitura e execução da suíte; lacunas cobertas pelos adversariais |
| [scripts/gerar-catalogo-nogle.mjs](https://github.com/oraconect5g-boop/sistema-ora5g/blob/7f5fd413eee756015723a53b29680db0ec655a1f/scripts/gerar-catalogo-nogle.mjs) | Leitura de código e verificações aplicáveis de lint/tipos/build/E2E |

## Apêndice C — inventário das 33 funções SQL

Somente os schemas public e privado da aplicação; funções gerenciadas de Auth/PostgreSQL não entram neste total. Assinatura e definição foram comparadas com as migrations; os privilégios abaixo foram lidos no banco de desenvolvimento. O schema privado não está exposto como RPC pública. As oito funções públicas têm EXECUTE negado para anon e search_path vazio. Os testes de regra e as falhas de integridade estão descritos acima; o inventário não representa homologação de todos os fluxos.

| Função e assinatura | SECURITY DEFINER | EXECUTE de authenticated |
|---|---|---|
| `privado.atualizar_saldo()` | Sim | Não |
| `privado.auditar_mudanca()` | Sim | Não |
| `privado.auditoria_completar_organizacao()` | Não | Sim |
| `privado.auditoria_imutavel()` | Não | Sim |
| `privado.cnpj_valido(p_cnpj text)` | Não | Sim |
| `privado.encerrar_reserva(p_reserva uuid, p_situacao text)` | Sim | Não |
| `privado.expirar_reservas(p_unidade uuid, p_variante uuid)` | Sim | Não |
| `privado.iccid_valido(p_iccid text)` | Não | Não |
| `privado.imei_valido(p_imei text)` | Não | Não |
| `privado.lancar_movimento(p_unidade uuid, p_variante uuid, p_quantidade integer, p_tipo text, p_item uuid, p_motivo text, p_referencia_tipo text, p_referencia_id text, p_chave text, p_usuario uuid)` | Sim | Não |
| `privado.livro_imutavel()` | Não | Não |
| `privado.luhn_valido(p_digitos text)` | Não | Não |
| `privado.organizacoes_com_permissao(p_permissao text)` | Sim | Sim |
| `privado.perfis_que_gero()` | Sim | Sim |
| `privado.registrar_item_serializado(p_unidade uuid, p_variante uuid, p_imei text, p_imei2 text, p_iccid text, p_tipo text, p_chave text, p_usuario uuid, p_condicao text, p_numero_serie text)` | Sim | Não |
| `privado.sessao_atual()` | Não | Sim |
| `privado.tipo_da_variante(p_variante uuid)` | Sim | Não |
| `privado.unidades_com_permissao(p_permissao text)` | Sim | Sim |
| `privado.unidades_visiveis()` | Sim | Sim |
| `privado.usuario_ativo()` | Sim | Sim |
| `privado.validar_item_serializado()` | Não | Não |
| `privado.validar_movimento()` | Não | Não |
| `privado.validar_unidade()` | Não | Sim |
| `privado.validar_vinculo()` | Não | Sim |
| `privado.vinculos_vigentes()` | Sim | Sim |
| `public.conferir_item(p_item uuid)` | Sim | Sim |
| `public.disponibilidade_na_rede(p_variante uuid)` | Sim | Sim |
| `public.liberar_reserva(p_reserva uuid)` | Sim | Sim |
| `public.preco_vigente(p_variante uuid, p_unidade uuid, p_canal text, p_momento timestamp with time zone)` | Sim | Sim |
| `public.reservar_estoque(p_variante uuid, p_quantidade integer, p_item uuid, p_chave text, p_origem text, p_minutos integer)` | Sim | Sim |
| `public.selecionar_unidade(p_unidade uuid)` | Sim | Sim |
| `public.tem_permissao(p_permissao text, p_unidade uuid)` | Sim | Sim |
| `public.unidade_atual()` | Sim | Sim |
