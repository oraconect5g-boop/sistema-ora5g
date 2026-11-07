# Plano de início da implementação — Ora 5G Platform

**Data:** 06/11/2026 · **Autor:** Claude Code · **Revisor esperado:** Codex + proprietário
**Cobre:** as 4 primeiras semanas (09/11 a 04/12/2026) = Mês 1 do plano de 6 meses
**Depende de:** `docs/adr/ADR-001-infraestrutura-ipv4-portas-e-ambientes.md`, `docs/integracoes/VARIAVEIS_DE_AMBIENTE.md`, `docs/etapa-0/*`
**Status:** proposta para aprovação

---

## 1. Resumo em 10 linhas

1. Começamos pela **fundação**: repositório organizado, verificações automáticas, login, lojas, perfis e permissões testadas.
2. A **loja online** existe no modelo de dados **desde o primeiro dia** como canal de venda, mesmo que a vitrine só abra mais tarde.
3. Toda venda tem **canal** (loja física, loja online, Mercado Livre, TikTok Shop, Shopee, WhatsApp): o sistema soma tudo no total da empresa e separa por canal.
4. O servidor é **só IPv4**: só registros A no DNS, banco pelo pooler IPv4 do Supabase, serviços internos em `127.0.0.1`.
5. Só **3 portas abertas** (22, 80, 443). Serviços internos em faixas fixas: **30xx produção, 31xx homologação**.
6. Dois aplicativos no mesmo repositório: **plataforma** (`app.ora5g.com.br`) e **loja** (`loja.ora5g.com.br`), com o mesmo banco e as mesmas regras de negócio.
7. **Nenhum dado real** entra antes da homologação; a primeira importação real é o CSV da Rein, em homologação.
8. O Claude implementa banco, regras e segurança; o Codex implementa telas e testes de navegação. Um sempre revisa o outro.
9. Cada tarefa é pequena, tem critério de aceite e só fecha com teste rodando no GitHub.
10. Fim do mês 1: **estoque da Santa Cândida importado e conferido em homologação**, com login e permissões funcionando no celular.

---

## 2. Loja online integrada ao sistema

### 2.1 Como fica contabilizado

| Conceito | Como o sistema trata |
|---|---|
| **Canal de venda** | Campo obrigatório em toda venda: `loja_fisica`, `loja_online`, `whatsapp`, `mercado_livre`, `tiktok_shop`, `shopee` (lista configurável) |
| **Unidade "Loja Online"** | Cadastrada como uma **unidade do tipo `online`**, ao lado das 14 lojas físicas. Tem metas, relatórios e (se definido) CNPJ próprio |
| **Total da empresa** | Soma de todos os canais, sem duplicar |
| **Separação** | Todos os painéis filtram e comparam por canal e por unidade: "Lojas físicas × Online × Marketplaces" |
| **Margem por canal** | Considera custo do produto, desconto, taxa do meio de pagamento, **frete**, **comissão do marketplace** e embalagem. A loja online e os marketplaces só mostram margem real se esses custos entrarem |
| **Entrega** | Cada venda online tem modalidade: **entrega** (frete, rastreio) ou **retirada em uma loja física** |
| **Retirada na loja** | A venda continua sendo do canal online (para medir o crescimento online), mas a loja que entregou também aparece no relatório de retiradas |
| **Atribuição ao vendedor** | Venda online pura não tem vendedor de loja. Se um vendedor atendeu pelo WhatsApp e mandou o link, a venda fica com ele (canal `whatsapp`) — regra configurável pelos donos |

### 2.2 Tecnologia da loja

- Aplicativo próprio (`apps/loja`), no mesmo repositório, **lendo o mesmo catálogo, preços e estoque** da plataforma.
- **Não vende o que não tem**: o item é reservado no estoque quando o cliente vai pagar, e a reserva expira se o pagamento não confirmar.
- Pagamento pelo **link/checkout do PicPay ou do PagBank** (credenciais já previstas no `.env.example`). Pedido só vira "pago" com a **confirmação do provedor**, nunca pela tela.
- Rápida e leve no celular, com páginas de produto indexáveis pelo Google.

### 2.3 Quando entra no cronograma

| Mês | Loja online |
|---|---|
| 1 | Canal `loja_online` e unidade tipo `online` já existem no banco; catálogo preparado com fotos, descrição e "publicar online: sim/não" |
| 2 | Link de pagamento PicPay/PagBank funcionando a partir da plataforma (vendedor envia o link pelo WhatsApp) — **primeira venda online contabilizada** |
| 5 | Vitrine `loja.ora5g.com.br` em homologação: catálogo, carrinho, pagamento e retirada na loja |
| 6 | Loja online em produção com entrega por frete |

Se quiser antecipar a vitrine, a opção mais segura é publicar no mês 3 uma **vitrine só de catálogo** (produtos e preços, com botão "comprar pelo WhatsApp"), sem carrinho.

---

## 3. Estrutura do repositório (monorepo)

```text
sistema-ora5g/
├─ apps/
│  ├─ plataforma/        # Next.js — PDV, gestão, painéis (app.ora5g.com.br)
│  ├─ loja/              # Next.js — loja online (loja.ora5g.com.br)        ← mês 5
│  └─ worker/            # Node — filas, integrações, rotinas agendadas       ← mês 2
├─ packages/
│  ├─ dominio/           # regras de negócio puras (venda, desconto, estoque) + testes
│  ├─ banco/             # migrations SQL, políticas RLS, seeds fictícios, testes de banco
│  ├─ ui/                # componentes visuais e design tokens
│  └─ config/            # TypeScript, ESLint e validação das variáveis de ambiente
├─ deploy/               # Dockerfiles, compose por ambiente, Caddyfile, scripts
├─ docs/                 # documentação, ADRs e planos
├─ .github/              # CI e modelos de issue/PR
└─ .env.example
```

Regras: as pastas são criadas **só quando a primeira tarefa precisar delas**; a loja e o worker não entram no mês 1. As regras de negócio ficam em `packages/dominio`, assim plataforma, loja e worker usam **exatamente a mesma regra** de preço, desconto e estoque.

---

## 4. Ferramentas e versões

| Item | Escolha | Observação |
|---|---|---|
| Node.js | 22 LTS | Já instalado no ambiente dos agentes (22.23) |
| Gerenciador de pacotes | npm com *workspaces* | Já vem com o Node; menos ferramentas para o proprietário |
| Next.js, React, Tailwind, Zod, Vitest, Playwright | Versões estáveis **fixadas** no momento da criação (sem `^`) | Registradas no PR da tarefa ORA-002 |
| Supabase CLI | Para migrations e banco local de testes | Versão fixada |
| Docker | 29.x no ambiente dos agentes; versão do servidor a confirmar | — |
| Proxy | Caddy 2 | HTTPS automático |

---

## 5. Cronograma das 4 primeiras semanas

Convenções: **C** = Claude Code, **X** = Codex. Toda tarefa: branch própria → PR → revisão cruzada → CI verde → aceite.

### Semana 1 (09–13/11) — Decisões e esqueleto

| ID | Tarefa | Faz | Revisa | Aceite |
|---|---|---|---|---|
| ORA-001 | ADR-001 (infra/IPv4/portas) e ADR-002 (empresa, lojas, unidade online, perfis, escopos) aprovados | C | X + proprietário | ADRs com status "Aceita"; perguntas de bloqueio respondidas |
| ORA-002 | Esqueleto do monorepo: `apps/plataforma`, `packages/config`, TypeScript estrito, ESLint, Vitest, Playwright, versões fixadas, página `/saude` | X | C | `npm ci`, `lint`, `typecheck`, `test` e `build` passam |
| ORA-003 | CI no GitHub Actions + validação de variáveis de ambiente na inicialização (sistema recusa subir faltando obrigatória) + verificação automática de segredos no código | C | X | CI roda em todo PR; PR com segredo falso é bloqueado; teste de variável faltando passa |

### Semana 2 (16–20/11) — Banco e permissões

| ID | Tarefa | Faz | Revisa | Aceite |
|---|---|---|---|---|
| ORA-004 | Projeto Supabase de **desenvolvimento** (com sua autorização) + Supabase local para testes + primeira migration: empresa (CNPJ raiz), unidades (lojas físicas e online, CNPJ filial), perfis, vínculos usuário↔unidade (um vendedor em várias lojas), auditoria | C | X | Migration aplica do zero em banco limpo no CI; reversão documentada |
| ORA-005 | Políticas RLS + **testes negativos**: vendedor não vê outra loja; vendedor em 2 lojas vê só as 2; dono vê todas; troca de `loja_id` na requisição é recusada | C | X (tenta quebrar) | Todos os testes negativos passam no CI |
| ORA-006 | Login por e-mail, recuperação de senha, sessão curta, bloqueio de usuário, seleção da loja ao entrar | X | C | Fluxo testado no Playwright em tela de celular (360 px) e computador |

### Semana 3 (23–27/11) — Catálogo e importador

| ID | Tarefa | Faz | Revisa | Aceite |
|---|---|---|---|---|
| ORA-007 | Catálogo: produto, variação, tipo de item (aparelho com IMEI, acessório por quantidade, chip com ICCID, serviço), **código de barras**, custo, preço vigente com histórico, campo "publicar online" | C | X | Testes de regra: preço não muda venda antiga; IMEI com dígito verificador válido |
| ORA-008 | Telas do catálogo e da gestão de lojas/usuários (AppShell, menu, seletor de loja) | X | C | Todos os estados (carregando, vazio, erro, sem permissão) testados |
| ORA-009 | **Importador do CSV da Rein** em modo prévia: lê arquivo, aponta colunas, duplicidades, IMEIs inválidos e preços sem custo; relatório de erros; nada é gravado até aprovação | C | X | Funciona com o **CSV real anonimizado** da Santa Cândida |

### Semana 4 (30/11–04/12) — Estoque e servidor

| ID | Tarefa | Faz | Revisa | Aceite |
|---|---|---|---|---|
| ORA-010 | Estoque: livro de movimentações (só inserção), saldo por unidade, IMEI com situação e histórico, reserva com bloqueio, entrada por importação | C | X | Teste de concorrência: dois vendedores nunca reservam o mesmo IMEI |
| ORA-011 | Telas de consulta de estoque e IMEI no celular + conferência física (marcar IMEI "conferido") | X | C | Vendedor confere o estoque pelo celular sem leitor |
| ORA-012 | Servidor de **homologação**: Ubuntu, firewall (22/80/443), Docker com IPv6 desligado, Caddy, `hml-app.ora5g.com.br`, script `verificar-ipv4.sh` passando | C | X + proprietário | HTTPS válido em IPv4; nenhuma porta além de 22/80/443 aberta (varredura externa); banco conectado pelo pooler |

**Entrega do mês 1:** em `hml-app.ora5g.com.br`, um vendedor de teste entra pelo celular, escolhe a Santa Cândida e consulta o estoque importado da Rein. O dono confere a importação, e as permissões entre lojas estão provadas por teste.

---

## 6. O que o proprietário precisa fazer (e quando)

| Até | Ação | Por quê |
|---|---|---|
| 10/11 | Responder às perguntas do ADR-001 (cPanel, configuração da VPS, e-mail, DNS) | Libera ORA-001 e ORA-012 |
| 10/11 | Autorizar a criação do projeto Supabase de desenvolvimento (plano gratuito) | Libera ORA-004 |
| 13/11 | Ativar a proteção da branch `main` no GitHub (exigir PR e revisão) | Ninguém altera a `main` sem revisão |
| 20/11 | Exportar o **CSV de estoque da Rein** da Santa Cândida e enviar pelo GitHub privado, em pasta não versionada ou com dados de clientes removidos | Libera ORA-009 |
| 20/11 | Lista das 14 lojas: nome, endereço, CNPJ de cada filial | Cadastro das unidades |
| 27/11 | Lista dos vendedores (nome e e-mail) e em quais lojas trabalham | Cadastro de usuários de teste/homologação |
| 27/11 | Concluir a migração da VPS; criar os registros **A** de `hml-app` (sem AAAA) | Libera ORA-012 |
| Mês 1 | Iniciar a **verificação da empresa na Meta** e os cadastros de desenvolvedor no Mercado Livre, TikTok Shop e Shopee | Aprovações externas demoram |
| Mês 1 | Indicar o **contador** e pedir orçamento de **emissor fiscal por API** | Caminho crítico da nota automática |

---

## 7. Riscos do início e como evitamos

| Risco | Prevenção |
|---|---|
| VPS com cPanel ocupando as portas 80/443 | Confirmar antes de instalar qualquer coisa (pergunta do ADR-001) |
| Algum serviço tentar IPv6 e falhar "do nada" | Só registros A, `127.0.0.1` nos endereços internos, ordem IPv4 primeiro no Node, pooler IPv4 do Supabase e teste automático de conectividade |
| Porta exposta sem querer pelo Docker | Publicação explícita em `127.0.0.1` e varredura externa de portas no aceite |
| Conflito de portas entre produção e homologação | Faixas fixas 30xx/31xx registradas no ADR-001 |
| Estouro de memória na VPS com dois ambientes | Medir na ORA-012; se necessário, homologação sai da VPS |
| CSV da Rein com formato inesperado | Importador em modo prévia, nada grava sem aprovação |
| Dado real de cliente em teste | Dados fictícios em dev; CSV anonimizado em homologação |
| Prazo de 6 meses | Escopo do mês fechado; o que não couber vira pendência visível, nunca "pronto" sem teste |

---

## 8. Perguntas novas deste plano

1. As vendas online sairão com o CNPJ de qual unidade (uma loja física ou um CNPJ próprio para o online)?
2. O estoque da loja online será o de uma loja física específica, um depósito central ou a soma das lojas?
3. Para entrega, vocês já usam alguma transportadora ou intermediador de frete (Correios, Melhor Envio, outro)?
4. Quer manter `loja.ora5g.com.br` para a loja online ou prefere que ela fique no domínio principal `ora5g.com.br` quando estiver pronta?
