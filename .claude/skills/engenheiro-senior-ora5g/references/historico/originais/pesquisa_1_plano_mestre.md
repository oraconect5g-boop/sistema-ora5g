> Relatório extraído integralmente de documento de Pesquisa Aprofundada da Biblioteca. Conteúdo histórico; verificar fatos, preços, normas, integrações e referências antes de implementação.

# Plano mestre de desenvolvimento da plataforma Ora 5G

## Visão do produto e decisões que devem entrar na fundação

O sistema da Ora 5G deve nascer como uma **plataforma comercial única**, e não como um conjunto de módulos isolados. A venda de um smartphone, de um acessório, de um chip, a ativação de uma linha, uma recarga, um plano da Ora Connect ou uma venda online precisam alimentar a mesma estrutura de cliente, vendedor, loja, pagamento, meta, comissão, financeiro, estoque, fiscal e relatórios. Essa decisão é o que evita, no futuro, ter um “sistema da loja” e outro “sistema da operadora” que não conseguem produzir um fechamento diário confiável.

A arquitetura recomendada continua sendo um **monólito modular em Next.js/TypeScript + PostgreSQL/Supabase**, com módulos bem separados internamente, mas compartilhando autenticação, dados e regras centrais. O Next.js documenta suporte a aplicações web completas, self-hosting, testes e Progressive Web Apps, o que é particularmente útil para a Ora porque parte dos vendedores precisará trabalhar pelo celular. citeturn941715search6 O PostgreSQL fornece constraints, chaves estrangeiras, unicidade e outras garantias no próprio banco, importantes para impedir, por exemplo, duplicidade de IMEI ou registros financeiros inválidos. citeturn355290search5

Há uma correção importante no objetivo de “não precisar criar novas migrações nunca”. **Nenhum sistema empresarial que evolui pode garantir zero migrações futuras.** O objetivo correto é evitar **reescritas estruturais e migrações destrutivas**. O próprio Supabase recomenda que mudanças de schema sejam feitas por migrações versionadas e mantidas no controle de versão; isso é um mecanismo de segurança e rastreabilidade, não um problema. citeturn941715search4turn941715search5 Portanto, o projeto deve nascer com um modelo suficientemente geral para acomodar novos produtos, meios de pagamento, serviços e integrações sem alterar as estruturas centrais, mas ainda devemos aceitar migrações incrementais e controladas quando o sistema evoluir.

A Rein permanece fora da arquitetura operacional: ela servirá apenas como fonte para importação inicial de produtos e preços. Já a Nogle deve ser tratada como **adaptador externo da vertical de telecom**, porque a própria Nogle descreve sua plataforma como responsável por clientes, linhas, planos, recargas, billing e integrações, e informa oferecer API para conectar esses dados ao ecossistema do cliente. citeturn355290search0turn355290search2 A base da Ora deverá continuar funcionando mesmo quando a Nogle estiver indisponível; operações que dependam diretamente da operadora ficam em estado pendente e são retomadas posteriormente.

O desenho geral deve ser este:

```text
                        ORA 5G PLATFORM
                              │
       ┌──────────────────────┼───────────────────────┐
       │                      │                       │
   PDV / MOBILE            E-COMMERCE            ADMIN / CRM
       │                      │                       │
       └─────────────── CAMADA COMERCIAL ────────────┘
                              │
             Venda / item / vendedor / cliente
                              │
       ┌──────────────┬───────┼────────┬─────────────┐
       │              │       │        │             │
   ESTOQUE        PAGAMENTOS FISCAL   METAS       FINANCEIRO
       │              │       │        │             │
   IMEI/SKU       PicPay/Pix NF-e/   Comissão    Recebíveis
                              NFC-e/
                              NFCom
                              │
                     INTEGRAÇÕES EXTERNAS
                     Nogle / fiscal / pagamentos
```

A consequência prática é que **não haverá uma tabela de “vendas de celular”, outra de “chips”, outra de “recargas” e outra de “vendas online” desconectadas**. Todos esses eventos entram em um núcleo comercial comum e recebem classificações diferentes. Essa é provavelmente a decisão de arquitetura mais importante de todo o projeto.

## Núcleo comercial, pagamentos, chips, recargas e metas

O sistema deve possuir um conceito central de **transação comercial**. Uma transação terá origem (`loja`, `mobile`, `ecommerce`, `connect`), loja, vendedor responsável, cliente, horário, status, itens, pagamentos, documentos fiscais e eventos relacionados. Assim, a venda física de um aparelho e a ativação de uma linha podem fazer parte da mesma jornada comercial, embora cada item mantenha sua natureza própria.

O cadastro de item comercial deve suportar, desde o começo, categorias como `produto_fisico`, `chip`, `esim`, `ativacao`, `recarga`, `plano`, `servico`, `acessorio`, `garantia`, `financiamento` e futuras categorias sem mudança estrutural do banco. Um celular pode exigir controle de IMEI; um chip pode exigir ICCID; uma linha pode exigir MSISDN; uma recarga não movimenta estoque físico; um serviço pode depender da Nogle. Essa diferenciação deve ser determinada por metadados e regras de categoria, e não por tabelas completamente independentes.

Isso permite que o fechamento diário do vendedor seja realmente completo. Se Maria vender dois aparelhos, três acessórios, oito chips, realizar seis ativações e quinze recargas, o painel dela deve enxergar tudo como produção comercial daquele dia, mas também permitir decompor o resultado por categoria. O mesmo princípio vale para o gestor, que deve conseguir analisar vendedor, loja, região, período, categoria, margem, pagamento, quantidade, meta e bonificação.

Para isso, eu acrescentaria ao modelo inicial um **ledger de performance**. Em vez de calcular bonificações diretamente contando registros de várias tabelas, cada evento comercial confirmado gera um `performance_event`. Por exemplo: `SALE_PRODUCT`, `SALE_CHIP`, `ACTIVATION`, `RECHARGE`, `PLAN_SALE`, `ACCESSORY_SALE`. Cada evento guarda vendedor, loja, cliente, transação de origem, valor, quantidade, categoria, data e regra de meta aplicável. A mesma origem nunca pode gerar o mesmo evento duas vezes, protegido por chave de idempotência e constraint de unicidade; isso reduz drasticamente o risco de comissão duplicada. O PostgreSQL oferece constraints de unicidade, checks e integridade referencial adequadas para esse tipo de garantia. citeturn355290search5

As metas devem ser configuráveis e versionadas. Uma meta pode ser “R$ 80 mil em vendas”, “40 chips”, “30 ativações”, “R$ 5 mil em acessórios” ou uma combinação ponderada. A plataforma deve conseguir configurar metas por vendedor, função, loja, período e categoria sem alterar código. A bonificação também deve ser modelada como regra, e nunca como um número fixo dentro da tela. Assim é possível mudar a política comercial mensalmente mantendo o histórico da política que valeu para cada venda.

O núcleo mínimo de dados dessa área deve conter aproximadamente:

| Domínio | Entidades principais |
|---|---|
| Comercial | `sales`, `sale_items`, `sale_status_history`, `sales_channels` |
| Atribuição | `sale_attributions`, `performance_events`, `targets`, `target_rules`, `commission_rules`, `commission_results` |
| Telecom | `sim_cards`, `telecom_lines`, `activations`, `recharges`, `portabilities`, `telecom_operations` |
| Estoque | `products`, `variants`, `serial_units`, `stock_balances`, `stock_movements`, `reservations`, `inventories` |
| Pagamentos | `payments`, `payment_attempts`, `payment_methods`, `payment_providers`, `cash_sessions`, `cash_movements`, `reconciliations` |
| Fiscal | `fiscal_documents`, `fiscal_document_items`, `fiscal_events`, `fiscal_profiles` |
| CRM | `customers`, `addresses`, `consents`, `interactions`, `opportunities`, `tasks` |
| Auditoria | `audit_logs`, `access_events`, `approval_events`, `integration_events` |

A venda deve permitir **múltiplos meios de pagamento na mesma operação**. Por exemplo, R$ 500 em dinheiro + R$ 1.000 em Pix + saldo em cartão. Isso significa que `sale.total` não pode conter simplesmente um campo `forma_pagamento`; ele deve estar ligado a N registros em `payments`.

Os meios iniciais devem incluir dinheiro, Pix, Pix na maquininha, cartão de débito, cartão de crédito, financiamento, boleto e outros meios futuros. PicPay já distingue soluções presenciais e digitais, incluindo POS, TEF, PicPay Tap, links, checkout e API; por isso, o modelo da Ora não deve ser amarrado a “PicPay = cartão”. citeturn720996search0 A documentação oficial também confirma que a maquininha pode receber Pix diretamente e que o fluxo aguarda confirmação do pagamento. citeturn720996search2

Para a Ora, eu faria a integração PicPay em duas camadas. Na primeira versão, a venda registra `Pix — PicPay POS`, `débito — PicPay POS`, `crédito — PicPay POS` etc., e o fechamento concilia esses pagamentos com os dados do estabelecimento. Depois, quando tivermos acesso comercial e técnico adequado, implementamos integrações automáticas. A API Pix publicada pelo PicPay oferece criação de cobrança, consulta, estorno e webhook, mas sua documentação atual é apresentada para e-commerce; portanto, não devemos presumir que ela controla diretamente a maquininha física. citeturn720996search1turn720996search4

Para dinheiro, o sistema precisa ir além de “forma de pagamento”. Cada loja deve possuir sessões de caixa com abertura, saldo inicial, recebimentos, sangrias, suprimentos, estornos, fechamento, saldo calculado, saldo informado e diferença. Assim o gestor enxerga não apenas “R$ 3.000 vendidos em dinheiro”, mas se havia R$ 3.000 efetivamente no caixa no fechamento.

## Experiência do vendedor, celular, nota fiscal e painel do gestor

A interface do vendedor deve ser construída **mobile-first**, mesmo para os PDVs que depois utilizarão notebook. Next.js possui guia oficial para construção de PWA, permitindo que a mesma aplicação web seja preparada para experiência semelhante a aplicativo sem exigir, na primeira fase, dois projetos separados para Android e iOS. citeturn941715search6 Isso encaixa diretamente na realidade das lojas que hoje não possuem notebook.

Eu desenharia a tela de venda como um fluxo contínuo de quatro áreas: cliente → itens/serviços → pagamento → concluir. Em um celular, isso funciona como etapas de uma mesma venda; em notebook/tablet, as mesmas informações aparecem lado a lado. O vendedor não deve navegar por vários módulos para vender um aparelho, ativar o chip e receber. Todas essas ações precisam acontecer dentro da **sessão da venda**.

A busca inicial deve aceitar CPF ou telefone. Depois disso, o vendedor consegue adicionar produto digitando nome, SKU ou futuramente lendo código de barras. Como vocês ainda não possuem leitores, a leitura não deve ser requisito para a primeira versão. Contudo, o projeto já deve abstrair a entrada de código para que um scanner USB, câmera do celular ou leitor dedicado possam ser incorporados depois sem modificar a lógica comercial.

Para celulares, selecionar o produto deve levar à escolha de um IMEI disponível naquela loja. Para chips, poderá existir seleção de ICCID. Para ativações ou recargas, a tela abre a operação de telecom correspondente. Se a Nogle confirmar a ativação, a transação recebe o evento de performance correspondente. A Nogle afirma que seu ERP contempla ativação de chips, recargas, clientes, planos, faturamento e integração via API, portanto esse desenho é coerente com a função pública descrita pelo fornecedor, embora os endpoints exatos devam ser implementados somente com a documentação privada da conta da Ora. citeturn355290search0turn355290search1

O vendedor também precisa possuir um botão simples de **“Emitir documento fiscal”**, mas a simplicidade da interface não pode esconder a complexidade fiscal. Para mercadorias de varejo, a NFC-e é um documento fiscal próprio do comércio varejista; o Portal Nacional mantém MOC, regras de validação, DANFE/QR Code e procedimentos de contingência. citeturn720996search5turn720996search7 Já serviços de comunicação utilizam NFCom, modelo 62, cuja finalidade é substituir os modelos anteriores de comunicação/telecomunicações. citeturn614998search0

Isso é especialmente relevante para a Ora Connect. A documentação fiscal vigente inclui classificação específica para “Carga/Recarga de Créditos — Telefonia Móvel”, e material do SPED indica emissão de NFCom em determinados cenários de venda/ativação de pré-pago. citeturn614998search3turn614998search10 Como a responsabilidade fiscal depende de quem presta o serviço, do papel da Ora/Nogle e da operação específica, o sistema deverá ter um `fiscal_profile` por tipo de item e um **adaptador fiscal**, com a classificação final validada por contador/especialista tributário. Essa separação é ainda mais importante em 2026, porque documentos fiscais eletrônicos estão passando por alterações decorrentes da reforma tributária, e o Portal NFCom publicou novas notas técnicas inclusive em 30 de outubro de 2026. citeturn614998search1turn720996search9

O vendedor não deveria escolher manualmente “NFC-e ou NFCom”. Ele deve clicar em emitir; o backend identifica os itens e seus perfis fiscais e determina quais solicitações precisam ser enviadas. Se uma venda possuir aparelho + acessório + serviço de telecomunicação, o sistema poderá gerar mais de um documento fiscal conforme a obrigação aplicável, mantendo todos ligados à mesma venda comercial.

No painel do gestor, a mesma base permite exibir:

| Indicador | Exemplo |
|---|---|
| Vendas do dia | R$ 82.430 |
| Aparelhos vendidos | 42 |
| Chips vendidos | 67 |
| Ativações | 55 |
| Recargas | 128 / R$ 4.280 |
| Acessórios | 96 / R$ 12.500 |
| Pix | R$ 28.400 |
| Dinheiro | R$ 9.200 |
| Cartões | R$ 31.000 |
| Financiamentos | R$ 13.830 |
| Ticket médio | calculado |
| Margem | calculada |
| Descontos | valor e percentual |
| Metas | realizado x planejado |
| Bonificação | projetada x fechada |
| Caixa | esperado x informado |
| Fiscal | autorizado / pendente / rejeitado |
| Nogle | confirmado / aguardando / erro |

Esses números devem ser filtráveis por data, vendedor, loja, região, meio de pagamento, produto, categoria e canal. O gestor também precisa navegar do indicador até a transação que gerou o número; um dashboard que mostra “55 ativações” mas não permite descobrir quais foram é inadequado para auditoria.

A atribuição individual deve ser obrigatória na finalização de qualquer venda. Isso significa que nenhuma venda deve ser criada simplesmente “pela loja”. Ela sempre possui ao menos um responsável comercial. Se no futuro houver venda compartilhada, `sale_attributions` permite dividir crédito entre vendedores sem alterar `sales`.

## Banco de dados, integrações e prevenção de reescrita

O modelo de dados deve ser elaborado antes da implementação massiva das telas. Entretanto, ele não deve tentar prever todos os campos possíveis: o objetivo é acertar **as fronteiras dos domínios e as identidades**.

A estrutura de organização deve começar com `companies → stores → users → user_store_access`. Clientes são globais à empresa, enquanto estoque, caixa e metas possuem dimensão de loja. Produtos também são globais, mas estoque e condições comerciais podem variar por loja. Essa distinção evita duplicar o mesmo cliente ou produto em cada unidade.

Para estoque serializado, o ideal é separar `product_variant` de `serial_unit`. O produto “iPhone X / 256GB / preto” pode ter 30 unidades; cada unidade possui IMEI próprio e localização atual. Um chip físico também pode ser tratado como unidade serializada com ICCID. O movimento de uma unidade precisa produzir evento em `stock_movements`, evitando simplesmente sobrescrever `store_id` e perder histórico.

Vendas, pagamentos, estoque e ativações precisam usar **idempotência**. Se a conexão do celular cair depois de o vendedor apertar “concluir”, pressionar novamente não pode vender duas vezes, ativar duas linhas ou baixar dois aparelhos. Esse requisito deve existir desde a primeira sprint, não como melhoria futura.

Para segurança, todas as tabelas acessíveis por APIs Supabase precisam ter políticas de Row Level Security apropriadas. A documentação atual do Supabase afirma explicitamente que RLS deve ser habilitada nas tabelas de schemas expostos e que políticas são executadas na própria consulta. citeturn941715search3 Na Ora isso significa, por exemplo, um vendedor não conseguir simplesmente alterar a requisição do navegador e consultar vendas de outra loja.

A estrutura deve considerar três ambientes independentes: desenvolvimento, homologação e produção. Mudanças no schema entram em arquivos de migração versionados, passam por testes locais/homologação e só depois vão para produção. O Supabase recomenda justamente um fluxo local com schema versionado e orienta equipes a não alterarem diretamente o banco remoto quando já trabalham com migrações. citeturn941715search4turn941715search5

Eu usaria adaptadores explícitos para sistemas externos:

```text
integrations/
├── nogle/
│   ├── client.ts
│   ├── activation-adapter.ts
│   ├── recharge-adapter.ts
│   └── webhook-handler.ts
├── payments/
│   ├── picpay/
│   ├── generic-pos/
│   └── pix/
├── fiscal/
│   ├── provider.ts
│   ├── nfce.ts
│   └── nfcom.ts
└── rein-import/
    ├── csv-parser.ts
    ├── xlsx-parser.ts
    └── mapping.ts
```

A Nogle, PicPay ou qualquer futuro fornecedor nunca deve aparecer diretamente dentro de `sales.service.ts`. O núcleo faz algo como `telecomProvider.activate(...)` ou `paymentProvider.createPix(...)`; o adaptador é que sabe conversar com o terceiro. Essa pequena disciplina é o que permitirá trocar ou adicionar fornecedores sem reescrever o PDV.

Também recomendo o padrão **outbox/event log** para integrações críticas: a transação da Ora é salva primeiro com o evento a enviar, e um worker processa a integração externa. Isso é especialmente útil para relatórios, Nogle, mensagens e conciliações. Para ações que precisam de resposta imediata, como uma aprovação de pagamento, o processo permanece síncrono até o resultado, mas ainda registra eventos para auditoria.

A camada fiscal precisa ser particularmente isolada porque os padrões estão evoluindo. A Receita e os portais fiscais mantêm cronogramas e notas técnicas atualizados, e a NFCom teve mudanças publicadas poucos dias antes da data deste relatório. citeturn614998search1turn614998search4 Dessa forma, atualização de layout fiscal não deve exigir mudança no modelo comercial de vendas.

## Claude Code e Codex trabalhando como uma equipe

Para este projeto, não recomendo colocar Claude Code e Codex editando simultaneamente os mesmos arquivos na mesma branch. Isso cria conflitos e, pior, decisões arquiteturais divergentes. O ideal é tratá-los como **dois engenheiros com papéis complementares e revisão cruzada**.

O Claude Code possui CLI, execução não interativa, controle de ferramentas, modo de planejamento e integração MCP. citeturn941715search0turn941715search2 A documentação da Anthropic também prevê `CLAUDE.md` no repositório para manter regras, padrões e contexto permanentes do projeto, além de integração com GitHub Actions. citeturn673899search5

Codex, por sua vez, suporta trabalho por terminal, agentes, worktrees e revisão de código; as orientações oficiais também utilizam `AGENTS.md` como fonte de regras de repositório. citeturn941715search9turn673899search1 A OpenAI recomenda manter regras de revisão específicas e duráveis em `AGENTS.md`, enquanto checks mecânicos devem permanecer no CI. citeturn673899search0

Portanto, eu estabeleceria o seguinte modelo de engenharia:

| Papel | Responsabilidade principal |
|---|---|
| Você | Product Owner; valida regras comerciais e operação |
| Claude Code | Implementador primário de uma issue/sprint |
| Codex | Revisor independente, testes, análise de segurança e arquitetura |
| Claude Code | Corrige achados da revisão |
| Codex | Segunda validação e aprovação técnica |
| GitHub Actions | Gate automático: lint, tipos, testes, build |
| Humano especializado | Fiscal, contábil, segurança/infra antes de produção |

Em algumas issues, os papéis podem ser invertidos: Codex implementa e Claude revisa. O importante é **quem implementa não ser o único que valida**.

O repositório deveria conter estes documentos desde o primeiro dia:

```text
/README.md
/CLAUDE.md
/AGENTS.md

/docs/
  PRODUCT.md
  ARCHITECTURE.md
  DATA_MODEL.md
  BUSINESS_RULES.md
  SECURITY.md
  FISCAL.md
  INTEGRATIONS.md
  UI_GUIDELINES.md
  TESTING.md
  DEPLOYMENT.md
  ADR/
    001-modular-monolith.md
    002-commercial-ledger.md
    003-stock-imei.md
    004-payment-model.md
    005-telecom-adapter.md
```

`CLAUDE.md` e `AGENTS.md` devem apontar para a mesma documentação canônica. Não devemos manter duas versões das regras da empresa, porque cedo ou tarde elas divergiriam.

Cada funcionalidade deve nascer como **Issue GitHub com contrato de entrega**. Por exemplo, “Registrar recarga”. A issue informa usuário, regra de negócio, tabelas afetadas, endpoint, interface, eventos gerados, integração Nogle, tratamento de erro, auditoria, testes e critérios de aceitação. Claude ou Codex trabalha em uma branch/worktree separada. O outro agente revisa o pull request. Codex possui suporte explícito a worktrees em seu fluxo atual, o que é adequado para isolar tarefas concorrentes. citeturn941715search9

Os agentes nunca devem receber acesso irrestrito à produção. Claude Code dispõe de controle explícito de ferramentas e permissões, e o uso de modos restritivos deve fazer parte da configuração. citeturn673899search3 Segredos de Nogle, PicPay, fiscal e Supabase ficam fora de prompts, commits e arquivos versionados.

A regra de trabalho dos dois agentes deve ser simples: **nenhuma funcionalidade é “pronta” porque a tela apareceu**. Só está pronta quando o banco, regras, permissões, auditoria, testes, estados de erro, experiência mobile, documentação e build estiverem aprovados.

## Sequência completa de construção

O projeto deve começar pela documentação e pelo modelo de domínio, não pelo dashboard. Minha proposta é um programa de aproximadamente **40 a 52 semanas**, tratado como estimativa de engenharia e não como promessa de prazo. Dois agentes podem acelerar bastante a produção de código, mas não eliminam tempo de definição de regras, testes reais nas lojas, integração com fornecedores, validação fiscal e homologação.

| Fase | Semanas | Entrega |
|---|---:|---|
| Descoberta e arquitetura | 1–3 | Regras, ADRs, ERD, jornadas, backlog |
| Fundação | 4–7 | Next.js, Supabase, auth, RBAC, lojas, CI/CD |
| Cliente e CRM | 8–10 | CPF, clientes, histórico, consentimentos, tarefas |
| Catálogo e preços | 11–13 | Produtos, variantes, fornecedores, importação Rein |
| Estoque | 14–18 | Loja, IMEI, ICCID, entrada, transferência, inventário |
| Núcleo comercial | 19–23 | Venda, itens, vendedor, canais, status, auditoria |
| PDV mobile | 24–27 | Checkout rápido celular/tablet/desktop |
| Pagamentos e caixa | 28–31 | Dinheiro, Pix, POS, cartão, sessões e fechamento |
| Desconto e aprovação | 32–33 | Motor de regras, gerente, orçamento |
| Ora Connect | 34–37 | Chips, ativações, recargas, Nogle, eventos |
| Metas e comissão | 38–40 | Targets, performance, bônus, dashboards |
| Fiscal | 41–43 | NFC-e/NFCom por adaptador e homologação |
| Financeiro | 44–46 | Recebíveis, conciliação, inadimplência |
| E-commerce | 47–49 | Catálogo público, carrinho, checkout, reserva |
| Piloto e hardening | 50–52 | Segurança, carga, backup, piloto e expansão |

Algumas trilhas podem ocorrer paralelamente em worktrees diferentes quando não alterarem o mesmo domínio. Claude poderia, por exemplo, implementar componentes visuais do CRM enquanto Codex cria testes do módulo de estoque. Já dois agentes não deveriam alterar simultaneamente o schema de `sales`.

O piloto deve acontecer em uma única loja. Durante esse período precisamos comparar diariamente os números do novo sistema com a realidade física: estoque, dinheiro, Pix, vendas, chips, ativações, recargas, descontos e fiscal. Somente depois de vários fechamentos consistentes eu expandiria para as outras 13 unidades.

## Critério para considerar a Ora realmente completa

A definição de “completa” não deve significar “tem todas as telas”. Para a Ora, o sistema só estará pronto para substituir a operação atual quando uma jornada integral funcionar sem planilhas paralelas: um vendedor entra pelo celular, é identificado com sua loja e perfil, localiza/cadastra o cliente, vende um aparelho por IMEI, adiciona acessório e chip, realiza ativação ou recarga quando aplicável, recebe por dinheiro/Pix/cartão/financiamento, solicita ou gera o documento fiscal apropriado, atualiza estoque, caixa e financeiro, credita sua produção individual, atualiza meta/bonificação e faz tudo aparecer imediatamente no painel do gestor.

Cada etapa precisa manter histórico de quem fez, quando fez e de qual loja. Alterações críticas precisam de auditoria. O gestor deve conseguir sair de qualquer indicador agregado e chegar ao documento que originou aquele valor. A segurança por loja deve existir no banco, não apenas na tela; essa é justamente uma aplicação natural das políticas RLS do PostgreSQL/Supabase. citeturn941715search3

A conclusão também exige cenários de falha: Pix não confirmado, maquininha recusada, Nogle fora do ar, documento fiscal rejeitado, vendedor pressionando duas vezes, transferência concorrente de IMEI, perda de conexão do celular, tentativa de vender chip já utilizado, cancelamento após fechamento de caixa, devolução, estorno e aprovação de desconto. Esses cenários devem fazer parte dos testes desde o início e não de uma “fase de correção” no final.

O resultado esperado não é somente um CRM. É um **ERP/CRM/PDV/telecom/e-commerce próprio da Ora**, construído em torno de um único registro comercial e uma única identidade de vendedor, cliente e loja. Esse desenho resolve precisamente o requisito acrescentado agora: chip, ativação, recarga, aparelho, acessório, Pix, dinheiro e vendas online deixam de ser números independentes e passam a integrar a mesma produção diária, as mesmas metas, a mesma bonificação e o mesmo painel de gestão.

A arquitetura também deixa espaço para futuros leitores de código de barras, novas adquirentes, eSIM, novos meios de pagamento, outras operadoras ou novos canais sem reconstruir o núcleo. O que poderá evoluir por migrações versionadas são detalhes e novos campos; **a estrutura fundamental — organização → cliente → transação → item/serviço → pagamento → atribuição → estoque/telecom → fiscal → performance — permanece a mesma**. Essa é a meta tecnicamente correta para evitar reescritas e tornar o projeto sustentável por muitos anos.
