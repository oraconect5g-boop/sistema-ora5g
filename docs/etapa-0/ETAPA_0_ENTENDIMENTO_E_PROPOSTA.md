# Entendimento confirmado, pontos em aberto e proposta da Etapa 0

**Projeto:** Ora 5G Platform · **Data:** 05/11/2026 · **Autor:** Claude Code (engenheiro líder) · **Revisor esperado:** Codex + proprietário
**Status:** proposta para validação — nenhum código, schema ou integração foi criado.

---

## 0. O que foi lido e o que existe de fato

**Lido integralmente:** `CLAUDE.md`, `AGENTS.md`, `PARA_COLAR_NO_CLAUDE.md`, `README.md`, `docs/00`, `02`, `03`, `05`, `06`, `07`, `09`, `10`, `11`, `12`; trechos de `04` (F01–F04) e `08`; estrutura do `backlog.json` (172 requisitos, todos `planned-not-implemented`); quadros do vídeo `ora5g_previa_telas.mp4` (10 telas + encerramento). O dossiê mestre é idêntico à concatenação do pacote.
**Consultado parcialmente/não lido ainda:** `docs/01_REQUISITOS.md` (lido pelo backlog), `13_PROMPTS_POR_FASE.md`, os três `originais/research/*.md` e `prototipo.html` — serão lidos quando o módulo correspondente for tratado.

**Estado real do repositório:** **não existe código.** O ambiente de trabalho não é um repositório Git, e nenhum repositório GitHub relacionado está acessível nesta sessão. Tudo no pacote é planejamento (o próprio README declara isso).

**Ambiente de desenvolvimento verificado (nuvem do Claude):**

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | 22.23.4 | LTS adequada para Next.js |
| npm | 10.9.9 | **instalação de pacotes bloqueada** pela configuração de rede desta conta |
| Git | 2.43.0 | ok |
| Docker | 29.9.2 | ok |
| PostgreSQL (cliente) | 16.15 | ok |

**Infra já contratada pelo proprietário:** VPS HostGator com o domínio `ora5g.com.br` (migrado do Hostoo). Especificações ainda não conhecidas.

---

## 1. Resumo do entendimento do negócio

- **Rede:** 14 lojas físicas de celulares e acessórios (marca Ora 5G). Começa em **1 loja piloto**, expande em ondas **1 → 3 → 7 → 14**, depois online nacional e novas lojas.
- **Quem usa:** vendedor (principalmente **pelo celular** — nem toda loja tem notebook; nenhuma tem leitor de código), gerente de loja (aprova descontos e solicitações de nota pelo celular), diretoria (visão da rede), financeiro, fiscal, atendimento/marketing, operador Ora Connect.
- **O que se vende numa mesma venda:** aparelho (controlado por **IMEI** único), acessório (quantidade), chip (**ICCID**), ativação de linha (**MSISDN**) e recarga — cada um com natureza comercial, fiscal e de comissão diferente.
- **Como se recebe:** dinheiro, Pix direto, **Pix e cartão na maquininha PicPay POS** (muito usada), **PayJoy** (financiamento), boleto/crédito e, no futuro, online. Uma venda pode ter **vários pagamentos** (pagamento misto). Recebimento ≠ liquidação ≠ conciliação.
- **Atribuição:** toda venda, chip, ativação e recarga conta para **um vendedor e uma loja**, uma única vez, alimentando metas e bonificações. Ativação/recarga só contam após **confirmação real** da Nogle.
- **Indicadores separados:** produção (quantidades), valor bruto, recebimento/liquidação, margem/comissão e fiscal. Ex.: o valor de face de uma recarga não é receita da Ora.
- **Sistemas de terceiros:** Rein = **somente importação inicial de produtos e preços por arquivo**; Nogle = integração do Ora Connect (contrato de API ainda não verificado); fiscal = provedor a definir com contador.
- **Sucesso do piloto:** abrir caixa, vender (inclusive misto), movimentar estoque/IMEI, solicitar nota, fechar e conciliar caixa e ver a performance individual — **tudo pelo celular**, com auditoria.

---

## 2. Mapa dos módulos e dependências

```text
                  ┌──────────────── Organização/Acesso (IAM, lojas, perfis, RLS, auditoria) ────────────────┐
                  │                                                                                          │
           Catálogo/Preços ◄── Importador Rein (arquivo)                                                     │
                  │                                                                                          │
           Estoque/IMEI/ICCID ──────────────┐                                                                │
                  │                         │                                                                │
   CRM/Clientes ──┼──► Vendas/PDV ◄── Descontos/Aprovações                                                   │
                  │        │                                                                                 │
                  │        ├──► Pagamentos/Caixa ──► Financeiro/Conciliação                                   │
                  │        ├──► Fiscal (provedor)                                                            │
                  │        ├──► Telecom/Ora Connect (Nogle)                                                  │
                  │        └──► Eventos de performance ──► Metas/Comissões                                   │
                  │                                                                                          │
   Atendimento/WhatsApp · Marketing/Meta · Canais online/Marketplaces · BI/IA  (consomem a mesma base) ──────┘
```

| Módulo | Depende de | Essencial para o piloto (Marco A) | Posterior |
|---|---|---|---|
| Organização/Acesso | — | login, lojas, vínculos, perfis, RLS, auditoria | SSO, MFA ampla, multi-CNPJ completo |
| Catálogo/Preços | IAM | produtos, variantes, tipos (aparelho/acessório/chip/serviço), preço vigente, importador Rein | preço por canal, promoções avançadas |
| Estoque/IMEI | Catálogo | ledger de movimentos, IMEI, reserva, entrada, ajuste auditado, contagem inicial | transferências completas, compras, assistência |
| CRM (mínimo) | IAM | cliente com busca por CPF/telefone, consentimento | funil, leads, tarefas, 360° |
| Vendas/PDV | Catálogo, Estoque, CRM | carrinho mobile, IMEI, venda idempotente, cancelamento | trocas/devoluções completas |
| Descontos/Aprovações | PDV, IAM | alçada + aprovação do gerente no celular dele | orçamentos diário/mensal, painel analítico |
| Pagamentos/Caixa | PDV | pagamento misto, abertura/sangria/suprimento/fechamento | adquirente via API |
| Financeiro | Pagamentos | conciliação manual/por arquivo do PicPay | contas a pagar/receber completas, DRE gerencial |
| Fiscal | PDV, provedor | **depende do inventário fiscal (pode ser bloqueante do piloto)** | multi-UF, NFCom etc. |
| Performance/Metas | PDV, Telecom | eventos idempotentes, painel do vendedor | comissões versionadas e pagamento |
| Telecom/Ora Connect | Nogle verificada | registro de chip/ativação/recarga com status honesto (manual assistido se API não estiver pronta) | ativação automática, portabilidade |
| Atendimento, Marketing, Canais online, BI/IA | todos acima | — | Marco C |

---

## 3. Revisão crítica da arquitetura proposta

**Concordo com a base:** monólito modular em Next.js + TypeScript + Tailwind, PostgreSQL (Supabase), RLS, adaptadores para terceiros, PWA sem offline transacional. É a escolha certa para uma equipe pequena com agentes: um repositório, um deploy, transações ACID reais entre venda, estoque e caixa.

**Pontos que precisam de decisão ou ajuste (vão virar ADR-001/002):**

1. **Serviço backend contínuo.** Outbox, reprocessamento, expiração de reservas e integrações precisam de um processo que rode o tempo todo (worker). Isso combina com a **VPS HostGator + Docker** (app Next.js + worker). Recomendo fila **no próprio PostgreSQL** (sem Redis no início) — menos peças.
2. **Supabase gerenciado vs. auto-hospedado.** Auto-hospedar Supabase numa VPS são ~10 contêineres para manter, atualizar e fazer backup — risco alto para um time pequeno. **Recomendação:** banco/Auth no Supabase gerenciado (região São Paulo, por latência e LGPD) e aplicação + worker na VPS. Custos e plano (backup com recuperação pontual é recurso pago) devem ser verificados antes de contratar — nada será contratado sem sua aprovação.
3. **RLS não protege se o servidor usar a chave administrativa.** A chave `service_role` ignora RLS. Regra proposta: leituras via contexto do usuário (RLS ativa); escritas críticas via serviços no servidor que **revalidam permissão e loja** e executam funções transacionais no banco; testes negativos para as duas camadas.
4. **Dinheiro em centavos inteiros** (ou `numeric`), nunca ponto flutuante; arredondamento BRL testado.
5. **IMEI/ICCID:** índices únicos + reserva com bloqueio de linha (`SELECT … FOR UPDATE`), teste de dois vendedores disputando o mesmo IMEI desde o primeiro dia.
6. **Login do vendedor:** muitos vendedores podem não ter e-mail corporativo. Precisamos decidir o identificador (e-mail, telefone, ou código do funcionário) — impacta o Auth.
7. **Aprovação do gerente:** preferir aprovação **no celular do próprio gerente** (notificação + fila), com alternativa de reautenticação do gerente no aparelho do vendedor; nunca senha compartilhada.
8. **Next.js:** fixar versão estável; regras de negócio em camada de serviços própria (`modules/*/service`), não espalhadas em componentes ou Server Actions.
9. **PWA:** instalável e rápida, mas **sem venda offline**; contingência documentada (D-029).
10. **Fiscal é caminho crítico, não fase 7.** Se hoje as notas saem pela Rein, substituir o PDV da Rein no piloto exige um provedor fiscal homologado **antes** do go-live — ou uma convivência temporária explicitamente decidida.

---

## 4. Plano da Etapa 0 (2–4 semanas, em paralelo com fundação técnica sem produção)

| # | Entregável concreto | Quem produz | Quem valida |
|---|---|---|---|
| E0-1 | Relatório de inventário da loja piloto (equipamentos, internet, caixa, PicPay, etiquetas, volume diário) | proprietário/gerente com roteiro do Claude | proprietário |
| E0-2 | Fluxos AS-IS → TO-BE: venda aparelho, venda combinada, caixa, nota, chip/recarga, transferência | Claude (rascunho a partir das entrevistas) | gerente piloto, financeiro |
| E0-3 | Inventário fiscal: CNPJs, UF, regime, como a nota sai hoje, provedor, certificado, modelos | contador + Claude (checklist) | contador |
| E0-4 | Matriz de permissões final (12 perfis do briefing × ações do doc 05) | Claude | proprietário |
| E0-5 | Modelo conceitual de dados revisado + diagrama (núcleo: IAM, catálogo, estoque, venda, pagamento, caixa, performance) | Claude | Codex + proprietário |
| E0-6 | ADR-001 a ADR-004 (arquitetura/hospedagem, tenant/loja/perfis, ledger de estoque, pagamento/caixa) | Claude | Codex + proprietário |
| E0-7 | Política de descontos e metas atuais transcritas em regras | proprietário/comercial | diretoria |
| E0-8 | Amostra anonimizada do export Rein + especificação do importador | operações + Claude | proprietário |
| E0-9 | Contrato Nogle: tabela endpoint→uso→auth→erros, a partir de acesso autorizado à documentação | responsável Ora Connect + Claude | técnico Nogle |
| E0-10 | Glossário de métricas (produção, bruto, recebido, líquido, margem, comissão) | Claude | financeiro |
| E0-11 | Wireframes aprovados das 5 telas do piloto (login, vendedor, PDV, gerente/aprovações, caixa) | Codex a partir dos PNGs | vendedor e gerente piloto |
| E0-12 | Baseline assinado: decisões D-001…D-010 registradas com responsável e data | todos | proprietário |

**Gate de saída da Etapa 0:** E0-3, E0-4, E0-5, E0-6 e E0-12 aprovados. Só então se cria a primeira migration oficial.

---

## 5. Perguntas realmente bloqueadoras (priorizadas)

1. **Qual será a loja piloto** e o que ela tem hoje: celulares dos vendedores (Android/iPhone), tablet/PC no caixa, Wi‑Fi/4G confiável, quantas maquininhas PicPay? *(D-003 — define UX e contingência)*
2. **Quantos CNPJs existem** e em qual(is) UF(s)? A loja piloto emite com qual CNPJ e regime tributário? *(D-002 — define o modelo empresa→loja e o fiscal)*
3. **Como a nota fiscal é emitida hoje** — pela própria Rein, por outro emissor, por qual contador? Quais modelos (NFC-e, NF-e, NFS-e)? *(D-007 — se for pela Rein, o fiscal vira bloqueante do piloto)*
4. **O gerente aprova toda nota ou só exceções** (ex.: nota com CNPJ, devolução, valor alto)? Isso precisa do aval do contador. *(D-006)*
5. **Durante o piloto, a Rein continua rodando em paralelo** na loja piloto ou a Ora passa a ser a única fonte de estoque a partir de um inventário de corte? *(D-001)*
6. **Pode me enviar um export real de produtos/preços da Rein com dados de clientes removidos** (CSV/XLSX), por arquivo no repositório privado — nunca senhas? *(D-018 — sem isso o importador fica genérico)*
7. **Quem tem acesso à documentação da Nogle** (docs.nogle.tech) e o Ora Connect precisa funcionar **no primeiro dia do piloto** ou pode entrar como registro manual assistido? *(D-008/D-034)*
8. **Quais são as regras de desconto hoje** (teto do vendedor, do gerente, existe limite diário/mensal?) e **como funcionam as metas/bonificações** atuais? *(D-005/D-014)*
9. **O que o PicPay entrega para conferência:** comprovante com NSU no papel, extrato no app, arquivo para download? *(D-010 — define a conciliação)*
10. **Infra:** quais as especificações da VPS HostGator (CPU, RAM, disco, sistema)? Você aprova a combinação **app na VPS + banco/Auth no Supabase gerenciado** (com orçamento a apresentar antes de contratar)? E já existe repositório GitHub privado, ou crio a estrutura para você subir? *(D-027/D-031)*

---

## 6. Primeiras 5 issues (sem impacto em produção)

### ORA-E0-001 — Repositório privado e governança documental
- **Objetivo:** subir o pacote para o GitHub privado em branch `docs/etapa-0`, com `CLAUDE.md`/`AGENTS.md` na raiz, templates de issue/PR, `CODEOWNERS`, proteção da `main` (PR + revisão obrigatória).
- **Aceite:** repositório privado criado; `main` protegida; este relatório e o pacote versionados; nenhum segredo (verificação com varredura de segredos).
- **Implementa:** Claude · **Revisa:** Codex · **Humano:** proprietário cria/autoriza o repositório.

### ORA-E0-002 — ADR-001 (arquitetura, ambientes, hospedagem) e ADR-002 (tenant, loja, perfis, escopos)
- **Objetivo:** registrar decisões do item 3 com alternativas, custos a confirmar e riscos; matriz dos 12 perfis × escopo `próprio/loja/região/rede`.
- **Aceite:** ADRs com status "proposta"; cada decisão aponta o requisito (`ORA-ORG-*`, `ORA-QUAL-*`); aprovados ou com objeções registradas pelo proprietário.
- **Implementa:** Claude · **Revisa:** Codex.

### ORA-E0-003 — Esqueleto técnico executável (sem banco, sem segredos)
- **Objetivo:** Next.js + TypeScript estrito + Tailwind + ESLint + Vitest + Playwright, versões fixadas; `.env.example` sem valores; página `/saude`; CI no GitHub Actions (lint, typecheck, test, build).
- **Aceite:** `npm ci && npm run lint && npm run typecheck && npm test && npm run build` passam localmente e no CI; nenhum diretório vazio "para o futuro"; README com instruções.
- **Implementa:** Codex · **Revisa:** Claude.
- **Dependência:** liberar instalação de pacotes na rede desta conta (ou executar no seu computador/VPS).

### ORA-E0-004 — Prova de isolamento por loja (RLS) em banco local descartável
- **Objetivo:** PostgreSQL local em Docker com um schema **de prova** (`poc_`) contendo lojas, vínculos e uma tabela de vendas fictícia; políticas RLS; testes de integração reproduzindo E2E-002 e E2E-003; teste de concorrência de reserva de IMEI (E2E-005).
- **Aceite:** testes negativos passam (vendedor A não lê/escreve loja B; troca de `store_id` recusada); dois processos concorrentes nunca reservam o mesmo IMEI; o schema de prova **não** é a migration oficial.
- **Implementa:** Claude · **Revisa:** Codex (tenta quebrar as políticas).

### ORA-E0-005 — Design tokens, AppShell e tela de login (visual, sem autenticação real)
- **Objetivo:** transformar os PNGs em tokens Tailwind provisórios e componentes `AppShell`, `Sidebar`, `MobileBottomNav`, `StoreSwitcher`, `AuthForm`, estados `Loading/Empty/Error/NoPermission`; tela de login responsiva com selo **"Demonstração — sem autenticação"**.
- **Aceite:** funciona em 360 px e 1280 px; área tocável ≥ 44 px; contraste AA; nenhum botão finge funcionar (botões sem backend ficam desabilitados com explicação); teste Playwright de renderização mobile/desktop.
- **Implementa:** Codex · **Revisa:** Claude · **Humano:** proprietário aprova cores/logo (D-020).

**Próxima na fila (após a pergunta 6):** ORA-E0-006 — parser do importador Rein em modo *dry-run* (validação de colunas, SKU, preço, duplicidade, relatório de erros), puro TypeScript, com fixtures sintéticas.

---

## 7. Critérios de pronto e testes que impedem "fechamento artificial"

Uma issue **só fecha** quando houver, anexado ao PR:

1. **Rastreabilidade:** ID do requisito → issue → PR → arquivos → caso de teste → execução de CI (link) → revisor (outro agente) → aceite humano quando crítico.
2. **CI verde de verdade:** lint, typecheck e testes executados no GitHub Actions — saída colada não substitui a execução.
3. **Testes negativos obrigatórios** para tudo que toca loja/perfil: acesso cruzado entre lojas, troca de `store_id`, aprovação do próprio desconto, usuário bloqueado.
4. **Testes de concorrência e idempotência** para IMEI, venda, pagamento, evento de performance e chamadas externas (repetir a mesma requisição duas vezes = um único efeito).
5. **Proibições verificadas na revisão:** endpoint falso apresentado como real, permissão só no frontend, mock rotulado como produção, migration destrutiva sem aprovação, segredo no código ou no log, status "confirmado" sem confirmação externa.
6. **UI com todos os estados:** carregando, vazio, erro de rede, sem permissão, conflito, pendente — e sucesso só após resposta do servidor.
7. **Migrations:** versionadas, aplicadas do zero em banco limpo no CI, com plano de reversão descrito.
8. **Integrações:** só saem de "bloqueada" com documentação oficial versionada, sandbox autorizado e testes de contrato.
9. **Aceite humano:** fiscal, pagamento/conciliação, acesso, banco de produção e release exigem aprovação registrada do responsável.

---

## Conflitos encontrados entre fontes (e como proponho resolver)

| # | Conflito | Proposta |
|---|---|---|
| C1 | Briefing da skill pede para criar Next.js e login **agora**; `CLAUDE.md` exige entendimento e autorização antes de código | Entrego a análise hoje; o esqueleto é a issue ORA-E0-003, que começa com seu OK |
| C2 | Briefing: "navegador em computadores e tablets, com adaptação para celular" e "monitores de caixa" × decisão P0 **mobile-first** | Mobile-first prevalece; desktop/monitor de caixa como adaptação |
| C3 | Briefing: PDV "informar CPF" sempre × D-004 (CPF só quando exigido) | CPF opcional por regra configurável até o parecer jurídico/fiscal |
| C4 | Briefing: "leitura de código de barras" × não há leitores | Busca por nome/SKU/IMEI no MVP; câmera/leitor como extensão |
| C5 | Briefing: produção em "VPS Linux + Docker" × D-027 aberta; VPS HostGator já comprada | Proposta híbrida do item 3, sujeita a ADR-001 e orçamento |
| C6 | Fala do proprietário "não ter que criar novas migrações" × política corrigida | Migrations versionadas são necessárias e seguras; o objetivo é evitar retrabalho, não migrations |
| C7 | Briefing lista 12 perfis; doc 05 tem 7 colunas | Unificar na matriz E0-4 |
| C8 | Briefing coloca fiscal na Fase 4 × fiscal pode ser pré-requisito do piloto | Depende da pergunta 3; inventário fiscal entra já na Etapa 0 |
| C9 | Briefing cita `erp.nogle.tech` (login) e o pacote `docs.nogle.tech` (documentação) | Mesmo fornecedor; contrato será extraído só da documentação oficial |
