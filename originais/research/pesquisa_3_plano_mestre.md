> Relatório extraído integralmente de documento de Pesquisa Aprofundada da Biblioteca. Conteúdo histórico; verificar fatos, preços, normas, integrações e referências antes de implementação.

# Plano mestre de desenvolvimento da plataforma Ora 5G

A plataforma da Ora 5G deve ser tratada como um **sistema operacional de varejo omnichannel**, e não apenas como um CRM. O projeto precisa reunir CRM, PDV, estoque/IMEI, chips e telecom, financeiro, metas e comissões, emissão fiscal, e-commerce, marketplaces, atendimento WhatsApp, marketing, integrações e inteligência artificial em um único núcleo de dados. A arquitetura deve nascer pronta para começar em uma loja, ser validada em operação real e depois escalar para as 14 lojas, vendas online em todo o Brasil e futuras unidades físicas, sem transformar cada expansão em um projeto separado.

iturn358071image0

A referência visual acima, do Shopify POS, ilustra um princípio importante para a Ora: em uma operação de loja, o vendedor precisa enxergar poucas ações, grandes, rápidas e contextuais, enquanto o sistema mantém toda a complexidade de estoque, cliente, pagamento e omnichannel por trás. O Shopify sincroniza clientes, estoque e pedidos entre operações físicas e digitais; Odoo, Lightspeed e Salesforce seguem a mesma tendência de centralizar operações e dados em vez de manter sistemas isolados. citeturn419867search2turn419867search3turn419867search6turn419867search1

## Modelo do produto e referência aos melhores sistemas de varejo

O estudo de plataformas maduras mostra quatro padrões que vale adotar. Odoo combina PDV, pesquisa de produtos e clientes, múltiplas formas de pagamento, fechamento diário, estoque, fidelidade e funcionamento em navegador, tablet e dispositivos móveis; ele também oferece operação offline no PDV. citeturn419867search2 Shopify conecta perfis de clientes, histórico completo de compras, estoque em múltiplas localidades, vendas físicas e online, retirada em loja e relatórios por funcionário e localização. citeturn419867search3turn419867search4 Lightspeed acrescenta transferências entre lojas, preços por local, pagamentos divididos, estoque em tempo real, inventário, pedidos de compra, leitura móvel e relatórios de desempenho de funcionários e unidades. citeturn419867search5turn419867search6 Salesforce leva esse conceito a uma camada mais ampla de CRM, commerce, atendimento, marketing, dados e IA, com visão unificada do consumidor. citeturn419867search0turn419867search1

A Ora deve combinar esses conceitos, mas adaptados à sua realidade específica. A entidade central não deve ser simplesmente a “venda”; deve existir uma **operação comercial** que possa conter aparelhos, acessórios, chips, ativação de linha, recarga, plano, serviço, seguro, financiamento e outros itens. Cada operação deve conhecer quem vendeu, em qual loja, para qual cliente, por qual canal, de que campanha o cliente veio, como pagou, quanto de desconto recebeu, qual custo gerou, qual comissão produziu e qual documento fiscal está associado.

Isso permite que o vendedor tenha uma única meta diária, mas que o gestor possa decompor essa meta em dimensões diferentes: faturamento de aparelhos, acessórios, quantidade de chips, número de ativações, recargas, planos, margem, ticket médio, conversão, descontos e lucro. O vendedor poderá receber R\$ 2.000 em vendas no dia e, ao mesmo tempo, ter realizado três ativações, cinco recargas e sete vendas de acessórios; o sistema deve preservar todas essas dimensões em vez de convertê-las prematuramente em um único número.

A mesma estrutura permite implementar comissões e bonificações muito mais sofisticadas: valor fixo por ativação, percentual por categoria, bônus progressivo por meta, campanha por determinado modelo, incentivo por margem, bonificação da loja e campanhas temporárias. Essas regras devem ser versionadas e possuir data de vigência, evitando alterar retroativamente a remuneração de vendas anteriores.

Para o cliente, deve existir um **perfil 360°** com compras em loja, compras online, Mercado Livre, Shopee, TikTok Shop, contatos do WhatsApp, origem de campanhas, aparelhos, IMEIs associados, linhas Ora Connect, recargas, planos, notas fiscais, pagamentos, atendimentos e consentimentos. Esse modelo se aproxima da estratégia de “single customer view” adotada por plataformas de varejo maduras. Shopify, por exemplo, mantém perfis sincronizados entre venda física e online; Lightspeed também trabalha com base compartilhada de clientes entre lojas. citeturn419867search3turn419867search6

## Arquitetura que evita retrabalho quando a Ora crescer

A base recomendada continua sendo **Next.js + React + TypeScript + Tailwind CSS**, com PostgreSQL/Supabase, começando como um **monólito modular**. Essa escolha reduz complexidade operacional agora e permite separar serviços mais tarde somente quando houver uma razão real de escala. O Supabase fornece PostgreSQL, autenticação e integração direta com Row Level Security; sua documentação atual recomenda habilitar RLS, aplicar permissões específicas por operação e testar explicitamente os cenários permitidos e negados. citeturn530300search5turn530300search6

O sistema deve ser dividido internamente em domínios independentes, embora inicialmente executados na mesma aplicação:

```text
Ora Platform
│
├── Identity & Access
├── Organization
│   ├── Empresa
│   ├── Lojas
│   ├── Equipes
│   └── Vendedores
│
├── CRM
├── Catálogo e Preços
├── Estoque e IMEI
├── PDV / Checkout
├── Pagamentos e Caixa
├── Fiscal
├── Financeiro
├── Metas, Comissões e Bonificações
├── Ora Connect
├── E-commerce
├── Marketplaces
├── Marketing & Attribution
├── WhatsApp & Atendimento
├── Documentos e Contratos
├── Analytics / BI
├── IA
└── Integration Hub
```

O **Integration Hub** é especialmente importante. Mercado Livre, Shopee, TikTok, Meta, WhatsApp, PicPay, Nogle e serviços fiscais nunca devem ser chamados diretamente a partir das telas. Cada integração deve ter um adaptador próprio, filas de sincronização, registro de eventos, retries, idempotência e logs. Assim, se uma API mudar, somente o adaptador correspondente precisa ser modificado.

O Mercado Livre já oferece APIs para pedidos, anúncios, pagamentos e sincronização da operação do seller; em 2026 a própria documentação introduziu alterações e descontinuações de endpoints, o que demonstra por que a Ora não deve acoplar seu modelo interno ao formato de uma API externa. citeturn571697search2turn571697search3turn571697search4 TikTok Shop possui APIs separadas para produtos, promoções, pedidos, fulfillment, logística, devoluções, finanças, analytics, atendimento e afiliados, além de webhooks; sua documentação alerta que versões de API mudam regularmente e recomenda acompanhar o changelog. citeturn571697search5turn571697search6

Por isso, o banco deve possuir IDs próprios. Uma venda da Ora poderá guardar `external_order_id`, mas o ID do Mercado Livre ou da Shopee nunca deve ser a chave principal da venda interna.

Também é importante corrigir uma expectativa: **não existe arquitetura séria que possa garantir “nunca mais criar migrações”**. Evoluções fiscais, integrações e novos produtos inevitavelmente podem exigir mudanças de banco. O objetivo correto é projetar um modelo robusto agora e tornar qualquer migração futura versionada, testada, reversível quando possível e executável sem perda de dados. O próprio Supabase recomenda manter políticas e alterações de banco em migrations reproduzíveis. citeturn530300search5

Para produção, backups também precisam estar no projeto desde o início. Atualmente o Supabase faz backups diários automáticos em projetos Pro e mantém sete dias no plano Pro; o próprio serviço destaca que objetos do Storage não são restaurados pelo backup do PostgreSQL, portanto documentos e arquivos exigem estratégia adicional de backup. citeturn530300search7

## Integrações comerciais, marketing, WhatsApp e Ora Connect

A arquitetura omnichannel deve possuir um **Channel Manager**. Nele serão cadastrados:

```text
Loja física
E-commerce Ora
Mercado Livre
Shopee
TikTok Shop
WhatsApp
Venda assistida / link de pagamento
Ora Connect
```

Cada canal envia pedidos para o mesmo mecanismo de pedidos e reserva de estoque. Dessa forma, um aparelho disponível em uma loja pode futuramente ser anunciado online sem permitir duas vendas simultâneas da mesma unidade ou IMEI.

No Mercado Livre, o sistema deve inicialmente sincronizar anúncios, SKU, preço, estoque, pedidos, pagamentos, envio, cancelamentos e devoluções. A API oficial permite consultar pedidos por vendedor e disponibiliza recursos próprios de gerenciamento de orders; o modelo deve utilizar notificações/webhooks quando disponíveis em vez de consultas repetitivas desnecessárias. citeturn571697search2turn571697search3

A Shopee deve ser implementada como outro adapter do mesmo Channel Manager. A plataforma possui uma Open Platform oficial; como a documentação pública retornada nesta pesquisa expõe poucos detalhes sem sessão apropriada, Claude Code e Codex devem fazer o inventário de endpoints, permissões, webhooks, limites e homologação diretamente na documentação oficial quando a integração entrar em execução, em vez de codificar endpoints presumidos. citeturn379960search23

Para TikTok Shop, a integração pode ser mais ampla: produtos, pedidos, logística, devoluções, finanças, analytics e, futuramente, afiliados/creators. Esses domínios são explicitamente contemplados pela API oficial atual do TikTok Shop. citeturn571697search5

O Meta Ads deve entrar como módulo de **Marketing Analytics e Attribution**, não apenas como uma tela mostrando gasto. A API oficial permite obter insights por conta, campanha, conjunto e anúncio, incluindo métricas como impressões, cliques, conversões, CPC, CPM, CTR, alcance, frequência e gasto. citeturn118637search2turn118637search7turn118637search8 O sistema deve então relacionar `campaign → lead → atendimento → oportunidade → pedido → pagamento → margem`, permitindo que a Ora enxergue não só ROAS publicitário, mas receita e margem reais geradas por campanha.

Isso produz indicadores que normalmente ficam separados:

```text
Campanha Meta
        ↓
R$ 1.500 de investimento
        ↓
1.800 leads
        ↓
460 conversas WhatsApp
        ↓
120 oportunidades
        ↓
42 vendas
        ↓
R$ 31.400 faturados
        ↓
R$ 8.700 margem
```

O WhatsApp deve ser tratado como **canal nativo do CRM**. A API oficial WhatsApp Cloud permite integração programática com sistemas de CRM e atendimento, incluindo comunicação automatizada e atendimento humano em escala. citeturn118637search3turn118637search4 Cada conversa deve gerar ou localizar um cliente, registrar mensagens, atribuir atendimento, identificar origem e acompanhar o funil. A IA poderá classificar intenção, sugerir respostas, responder perguntas permitidas, recuperar produtos disponíveis, acompanhar pedidos, encaminhar casos sensíveis e reagendar follow-ups. O histórico humano precisa permanecer visível e auditável.

A IA não deve poder conceder descontos, alterar estoque, efetivar pagamento, emitir documento fiscal ou executar operações financeiras diretamente sem passar pelas mesmas regras de autorização do restante do sistema. Ela deverá chamar ferramentas internas autorizadas, por exemplo:

```text
buscar_produto()
verificar_estoque()
consultar_pedido()
criar_lead()
registrar_interacao()
gerar_link_checkout()
solicitar_desconto()
solicitar_emissao_fiscal()
```

Para a Ora Connect, a Nogle passa a ser uma integração de primeira classe. A própria Nogle descreve seu ERP como plataforma para clientes, linhas, planos, ativações, recargas, billing, cobranças e integrações, e afirma disponibilizar uma API para conexão com sistemas externos. citeturn719673search1turn719673search3 A documentação informada está acessível no endereço oficial `docs.nogle.tech`, mas a versão recuperável nesta pesquisa não expôs o catálogo de endpoints em texto indexável; portanto, o planejamento deve reservar uma etapa formal de **API discovery** antes de codificar a integração. citeturn502067view0

Essa etapa deverá levantar autenticação, ambientes, endpoints, webhooks, limites, erros e operações disponíveis. Nenhuma chave deve ser colocada no GitHub ou enviada em prompts. Claude Code e Codex devem consumir as chaves somente por variáveis de ambiente ou secret manager.

No sistema da Ora, o fluxo ideal será:

```text
Vendedor
   ↓
Seleciona "Chip / Ora Connect"
   ↓
Cliente ou CPF
   ↓
Escolhe plano
   ↓
Seleciona ICCID/chip
   ↓
Ora cria operação comercial
   ↓
Integração Nogle solicita ativação
   ↓
Nogle responde
   ↓
Ora registra status
   ↓
Venda + ativação + comissão + financeiro
```

A venda física do chip, a ativação e uma eventual recarga serão **eventos diferentes ligados à mesma operação**, porque podem possuir valores, datas, tributação e regras de remuneração diferentes.

Quanto ao PicPay, existe API pública documentada para pagamentos de e-commerce, consulta, cancelamento e callback. citeturn828974search0turn828974search1 Isso não significa automaticamente que a maquininha física utilizada hoje pela Ora ofereça a mesma integração. Portanto o PDV deve suportar dois níveis: inicialmente registrar “Cartão/Pix — PicPay POS” e os dados de conciliação disponíveis; posteriormente, se o contrato PicPay da Ora disponibilizar integração de terminal/TEF adequada, o adapter poderá automatizar autorização e conciliação sem alterar o núcleo do PDV.

## Caixa, fiscal, metas e visão gerencial

O caixa precisa distinguir **forma de pagamento**, **adquirente** e **liquidação**. Portanto “cartão” não deve ser um simples campo de texto.

Um pagamento pode ser:

```text
Forma: PIX
Canal: terminal
Adquirente: PicPay
Valor bruto: R$ 1.299,00
Taxa: R$ 0,00
Valor líquido: R$ 1.299,00
Status: conciliado
```

ou:

```text
Forma: cartão de crédito
Canal: terminal
Adquirente: PicPay
Parcelas: 10
Valor bruto: R$ 2.499,00
Taxa prevista: R$ 182,40
Valor líquido previsto: R$ 2.316,60
Status: aguardando conciliação
```

Isso permitirá relatórios de faturamento, recebimento e margem sem misturar conceitos.

O fechamento diário deve consolidar, por loja e vendedor, aparelhos, acessórios, chips, ativações, recargas, serviços e vendas online atribuídas à unidade, além de dinheiro, PIX, cartão, financiamento e demais meios. O gestor deve ter drill-down até a transação original. Sistemas maduros como Odoo e Lightspeed também tratam vendas diárias, formas de pagamento, caixa e reconciliação como dimensões distintas. citeturn419867search2turn419867search6

O fluxo fiscal deve ser extremamente simples para o vendedor:

```text
VENDA CONCLUÍDA

✓ Pagamento aprovado
✓ Estoque reservado
✓ Cliente identificado

[ Emitir nota ]
[ Enviar recibo WhatsApp ]
[ Nova venda ]
```

Se a política da Ora exigir aprovação:

```text
VENDEDOR
Solicitar emissão
      ↓
GESTOR
Aprovar / rejeitar
      ↓
SERVIÇO FISCAL
Transmitir NF-e/NFC-e
      ↓
SEFAZ
Autorizar / rejeitar
```

É importante distinguir essas duas aprovações: o gestor faz uma **aprovação interna da Ora**; a autorização fiscal efetiva é feita pela infraestrutura fiscal competente. O Portal Nacional da NF-e mantém os layouts e regras técnicas de integração NF-e/NFC-e no Manual de Orientação do Contribuinte. citeturn828974search3turn828974search4 Portanto, o módulo fiscal deve ser desacoplado e validado com contador/especialista fiscal antes de entrar em produção.

O dashboard executivo deverá possuir filtros por período, loja, vendedor, canal e categoria e apresentar pelo menos:

```text
Faturamento bruto
Margem
Ticket médio
Vendas
Unidades vendidas
Chips vendidos
Ativações
Recargas
Planos
Descontos concedidos
Descontos por vendedor
Vendas por forma de pagamento
PIX
Dinheiro
Cartão
Financiamento
Estoque
Giro
Transferências
IMEIs
Pedidos online
Pedidos marketplace
Meta Ads
Leads
Conversão
CAC
ROAS
Conversas WhatsApp
Tempo de atendimento
Comissões
Metas
Ranking de vendedores
```

O vendedor deve enxergar apenas os próprios indicadores e os indicadores que a empresa decidir compartilhar. Gerentes podem enxergar a loja. Gestores regionais podem enxergar suas unidades. Administração pode visualizar a rede completa. Supabase Auth combinado com RLS é adequado para implementar esse tipo de controle por usuário e linha, desde que as políticas sejam testadas explicitamente. citeturn530300search5turn530300search6

Como o sistema tratará CPF, telefone, histórico de compras, conversas, linhas, endereços e comportamento comercial, LGPD precisa fazer parte do desenho desde o banco de dados. A ANPD caracteriza tratamento como operações que incluem coleta, uso, armazenamento, acesso, comunicação e eliminação de dados pessoais e orienta agentes a adotar governança e controles de segurança. citeturn828974search5turn828974search6turn828974search7 O projeto deve portanto registrar base legal/consentimentos quando aplicável, limitar acesso, manter auditoria, estabelecer retenção e permitir atendimento a solicitações de titulares.

## Esboços das principais telas

O **vendedor no celular** deve entrar diretamente em uma tela operacional, e não em um ERP cheio de menus:

```text
┌───────────────────────────┐
│ ORA 5G • Loja Centro      │
│ Olá, João                 │
├───────────────────────────┤
│ META HOJE                 │
│ R$ 3.420 / R$ 5.000       │
│ █████████████░░ 68%       │
├───────────────────────────┤
│ + NOVA VENDA              │
│ + CHIP / ATIVAÇÃO         │
│ + RECARGA                 │
│ + CLIENTE                 │
├───────────────────────────┤
│ Hoje                      │
│ 12 vendas    R$ 3.420     │
│ 4 chips      3 ativações  │
│ 5 recargas                │
│ Comissão estimada R$ 186  │
├───────────────────────────┤
│ Início  CRM  Vendas  Mais │
└───────────────────────────┘
```

O checkout deve permitir vender aparelho, acessório, serviço e telecom na mesma jornada:

```text
┌───────────────────────────┐
│ NOVA VENDA                │
├───────────────────────────┤
│ Cliente                   │
│ CPF 000.000.000-00        │
├───────────────────────────┤
│ Buscar produto...         │
│                           │
│ iPhone 16 128GB     1x    │
│ Capinha Premium      1x   │
│ Chip Ora Connect     1x   │
│ Ativação             1x   │
│                           │
├───────────────────────────┤
│ TOTAL         R$ 5.499,00 │
├───────────────────────────┤
│ [ PAGAMENTO ]             │
└───────────────────────────┘
```

Na escolha de pagamento:

```text
COMO O CLIENTE VAI PAGAR?

[ DINHEIRO ]
[ PIX ]
[ PIX • MAQUININHA ]
[ CARTÃO • MAQUININHA ]
[ FINANCIAMENTO ]
[ PAGAMENTO ONLINE ]
[ DIVIDIR PAGAMENTO ]
```

A tela do gerente deve destacar exceções e decisões, em vez de exigir inspeção manual de centenas de operações:

```text
┌─────────────────────────────────┐
│ GESTÃO • LOJA CENTRO            │
├─────────────────────────────────┤
│ Hoje R$ 41.850  ▲ 12%           │
│ Meta 83%                        │
│ Margem R$ 10.430                │
├─────────────────────────────────┤
│ PENDÊNCIAS                       │
│ 3 descontos para aprovar        │
│ 4 notas para aprovar            │
│ 2 divergências de caixa         │
│ 1 falha de ativação             │
├─────────────────────────────────┤
│ Vendedores                      │
│ Ana    112% ████████████        │
│ Lucas   91% ██████████          │
│ João    68% ███████             │
└─────────────────────────────────┘
```

A tela administrativa da rede deve comparar lojas:

```text
ORA 5G • VISÃO DA REDE

Hoje: R$ 382.410
Margem: R$ 96.218
14 lojas

Loja       Venda      Meta    Margem
Centro     41.850     112%    26%
Norte      38.420      94%    24%
Sul        35.912      88%    25%
...

Canais
Loja física      71%
Site             12%
Mercado Livre     8%
Shopee             5%
TikTok Shop        4%
```

O CRM deve assumir a forma de funil:

```text
NOVO
 │ 142
 ▼
CONTATO
 │ 87
 ▼
NEGOCIAÇÃO
 │ 54
 ▼
AGUARDANDO PAGAMENTO
 │ 21
 ▼
GANHO
   38

Cliente: Maria
Origem: Meta Ads
Campanha: iPhone novembro
WhatsApp: ativo
Última conversa: 14:32
Interesse: iPhone 16
Loja sugerida: Centro
Responsável: João

[ WhatsApp ] [ Criar venda ] [ Agendar ]
```

Esses esboços seguem a lógica encontrada em sistemas como Shopify e Odoo: ação principal evidente, busca rápida, checkout curto e informações contextuais, enquanto relatórios e configuração ficam separados da operação diária. citeturn419867search2turn419867search3turn419867search4

## Banco de dados planejado para a operação completa

O banco não deve ser criado de uma vez com centenas de tabelas vazias. O ideal é definir o **modelo conceitual completo agora**, mas implementar migrations conforme os módulos efetivamente entram no software. Isso reduz schema morto sem perder planejamento estrutural.

O modelo principal deve compreender aproximadamente estes agregados:

```text
ORGANIZAÇÃO
companies
stores
departments
teams
users
roles
permissions
user_store_access

CLIENTES
customers
customer_addresses
customer_consents
customer_tags
customer_channels

CRM
leads
opportunities
pipeline_stages
activities
interactions
lead_sources
campaign_attributions

CATÁLOGO
products
product_variants
product_categories
prices
price_lists
suppliers

ESTOQUE
stock_locations
stock_balances
stock_movements
stock_reservations
serial_numbers
inventory_counts
stock_transfers

VENDAS
orders
order_items
order_status_history
sales_channels
sellers

PAGAMENTOS
payments
payment_methods
payment_acquirers
payment_installments
settlements
cash_sessions
cash_movements
reconciliations

DESCONTOS
discount_rules
discount_requests
discount_approvals
discount_budgets

FISCAL
fiscal_documents
fiscal_requests
fiscal_events

COMISSÕES
goals
goal_periods
commission_rules
commission_entries
bonus_campaigns

TELECOM
telecom_customers
sim_cards
telecom_lines
telecom_plans
activations
recharges
portability_requests
nogle_operations

MARKETPLACES
channel_accounts
channel_products
channel_orders
channel_events
channel_sync_jobs

MARKETING
marketing_accounts
campaigns
ad_sets
ads
marketing_metrics
attributions

ATENDIMENTO
conversations
messages
conversation_assignments
automation_runs

INTEGRAÇÕES
integration_accounts
integration_credentials_metadata
integration_events
webhook_events
sync_jobs
dead_letter_events

AUDITORIA
audit_logs
access_events
security_events
```

O IMEI deve ser uma unidade serial individual, e nunca apenas uma quantidade de estoque. O mesmo princípio vale para ICCID/chips quando identificados individualmente. A movimentação precisa preservar uma cadeia como `recebimento → loja → transferência → reserva → venda → devolução`, permitindo rastreamento completo.

Também é recomendável um **event log** interno. Por exemplo:

```text
OrderCreated
PaymentAuthorized
InventoryReserved
DiscountRequested
DiscountApproved
FiscalRequested
FiscalAuthorized
SimActivationRequested
SimActivated
CommissionEarned
```

Isso não obriga adoção de uma arquitetura complexa de event sourcing; serve para auditoria, integração e automação. Marketplaces e APIs externas podem retransmitir eventos, portanto os handlers precisam ser idempotentes.

## Como Claude Code e Codex devem construir o sistema juntos

A melhor organização não é “Claude faz metade e Codex faz a outra metade”. Isso criaria dois estilos de arquitetura e áreas sem revisão independente. A estratégia recomendada é **maker-checker**: em cada entrega um agente implementa e o outro revisa, e os papéis alternam. Essa é uma recomendação arquitetural baseada nas capacidades atuais das duas ferramentas, não uma exigência dos fornecedores.

Claude Code oferece operação em terminal, modo de planejamento, controle de ferramentas e suporte a fluxos automatizados/GitHub Actions. citeturn530300search0turn530300search2 Codex CLI atualmente suporta agentes, tarefas paralelas e Git worktrees, facilitando isolamento de alterações enquanto outras tarefas são desenvolvidas. citeturn530300search3

O repositório deve possuir uma documentação que os dois agentes sejam obrigados a ler antes de qualquer tarefa:

```text
/docs
  /architecture
    architecture.md
    domains.md
    database.md
    security.md
    integrations.md

  /business
    sales-rules.md
    discount-rules.md
    commissions.md
    stores.md
    fiscal.md
    ora-connect.md

  /ux
    navigation.md
    seller-mobile.md
    manager-dashboard.md
    checkout.md

  /integrations
    nogle.md
    mercado-livre.md
    shopee.md
    tiktok-shop.md
    meta.md
    whatsapp.md
    picpay.md

  /adr
    ADR-001-modular-monolith.md
    ADR-002-supabase.md
    ADR-003-order-model.md
    ...
```

O fluxo de cada tarefa deve ser:

```text
Issue
  ↓
Especificação + critérios de aceite
  ↓
Agente A: plano
  ↓
Agente B: revisão do plano
  ↓
Agente A: implementação
  ↓
Testes automáticos
  ↓
Agente B: code review
  ↓
Correções
  ↓
CI
  ↓
Merge
```

Nenhum dos agentes deve poder marcar uma função como concluída apenas porque uma tela aparece visualmente. Cada feature precisa ter **Definition of Done** incluindo regra de negócio, permissões, validação, testes unitários, teste de integração, teste E2E quando necessário, auditoria, tratamento de erro, mobile e documentação.

A sequência recomendada é:

| Fase | Entrega principal | Claude Code | Codex |
|---|---|---|---|
| Fundação | repo, arquitetura, auth, lojas, RBAC | arquiteta/implementa | revisa/testa |
| Catálogo | produtos, preços, importação Rein | revisa | implementa |
| Estoque | estoque, IMEI, transferências | implementa | revisa |
| CRM | clientes, leads, funil, tarefas | revisa UX/regra | implementa |
| PDV | checkout mobile, pagamento, caixa | implementa | adversarial review |
| Telecom | Nogle, chips, ativações, recargas | revisa integração | implementa |
| Fiscal | solicitação, aprovação, emissão | implementa | testa cenários |
| Financeiro | recebíveis, conciliação | revisa | implementa |
| Comissões | metas, ranking, bônus | implementa | valida cálculos |
| WhatsApp | inbox + automação | revisa | implementa |
| Meta | métricas + attribution | implementa | revisa |
| Marketplaces | ML/Shopee/TikTok | alternado | alternado |
| E-commerce | loja nacional | alternado | alternado |
| IA | agentes assistivos | implementa tooling | security review |
| Hardening | carga, segurança, backup | revisão conjunta | revisão conjunta |

Durante a primeira fase, ambos devem trabalhar no **mesmo Git**, mas em branches/worktrees diferentes, nunca editando simultaneamente os mesmos arquivos sem coordenação. O suporte de worktrees no Codex torna esse tipo de isolamento diretamente compatível com seu fluxo atual. citeturn530300search3

Antes de chegar à loja piloto, o sistema deve passar por testes de cenários críticos: venda duplicada, pagamento duplicado, dois vendedores tentando vender o mesmo IMEI, queda durante pagamento, falha Nogle depois do pagamento, webhook duplicado, desconto acima do permitido, usuário acessando outra loja, fechamento com diferença de caixa, nota rejeitada e marketplace recebendo pedido de item sem estoque.

A implantação deve seguir quatro estágios:

```text
DESENVOLVIMENTO
       ↓
AMBIENTE STAGING
       ↓
LOJA PILOTO
       ↓
14 LOJAS
       ↓
OPERAÇÃO NACIONAL ONLINE
```

A loja piloto deve funcionar como laboratório real. Durante esse período o foco deve ser medir tempo de checkout, quantidade de cliques, erros do vendedor, divergências de estoque, falhas de integração e necessidades que aparecem apenas na rotina.

Depois da estabilização, as 14 lojas entram progressivamente, e só então o sistema se torna a base para escalar o e-commerce nacional e eventualmente novas lojas físicas.

O resultado final pretendido não é apenas “um CRM da Ora”. É uma plataforma proprietária que concentra **cliente + vendedor + produto + IMEI + estoque + telecom + pagamento + fiscal + marketing + atendimento + marketplaces + comissão + inteligência**, criando uma única fonte confiável de dados para a empresa. Isso segue a direção adotada pelos sistemas de varejo líderes, mas preserva as particularidades que Shopify, Odoo, Salesforce ou Lightspeed não conhecem da operação da Ora. citeturn419867search1turn419867search2turn419867search3turn419867search6
