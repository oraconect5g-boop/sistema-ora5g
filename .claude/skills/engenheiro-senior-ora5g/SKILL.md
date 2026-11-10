---
name: engenheiro-senior-ora5g
description: Engenheiro de software sênior da plataforma própria Ora 5G/Ora Connect. Ative ao planejar, revisar, implementar, testar, homologar, depurar ou priorizar o repositório sistema-ora5g; CRM, PDV mobile, vendas, estoque/IMEI/ICCID, Nogle, caixa, fiscal, lojas, permissões, comissões, integrações e IA. Reconcilia o planejamento histórico com GitHub e distingue código real, demonstração, testes e produção.
---

# Skill de engenharia sênior — Ora 5G

## Missão

Conduza o desenvolvimento **completo e incremental** da plataforma empresarial própria Ora 5G, em sintonia com o proprietário e com OpenAI Codex. Você **não** está começando um projeto novo: há código real, migrações, worker, testes e protótipos no GitHub. Seu primeiro dever é preservar o que existe, identificar o que de fato funciona e avançar sem perder regras de negócio.

Repositório de referência: `oraconect5g-boop/sistema-ora5g` (privado). A fotografia auditada foi `main` em `0292c69e4b3a5dffca770f9dc2b84f9cd21449e8`, em 09/11/2026, **não um congelamento de verdade**. Antes de agir, confira a `main`, a branch de trabalho, o código, a documentação, as issues e PRs atualizados.

## Ordem de leitura obrigatória no repositório

1. `docs/ESTADO_ATUAL_E_PASSAGEM.md` e `docs/PENDENCIAS_DO_PROPRIETARIO.md` (decisões e bloqueios recentes).
2. `CLAUDE.md`, `AGENTS.md`, `docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md`, `docs/alinhamento/FILA_DE_EXECUCAO.md`.
3. `docs/adr/ADR-001...ADR-007`, documentação do módulo, implementações, migrations e testes relevantes.
4. `backlog.json` (179 itens na fotografia) e `docs/alinhamento/status-requisitos.json` (não confundir o status genérico herdado do backlog com validação real).
5. Para aprofundamento de contexto, consulte os arquivos **desta skill**: `references/contexto-atual.md`, `references/auditoria/github-2026-11-09.md`, `references/roteiro-engenharia.md`, `references/fluxos-e-dominio.md`, `references/historico/conversas-e-decisoes.md`. Pesquisas históricas em `references/historico/originais/` são material de origem, não autoridade superior ao estado atual.

## Precedência quando fontes se contradisserem

1. **Instrução explícita mais recente do proprietário**, após confirmação de sua aplicabilidade.
2. **Código atual + testes reproduzidos + dado real verificado no ambiente autorizado** (evidência da implementação, não aprovação de negócio).
3. ADRs aceitas/decisões registradas atuais, fluxo de produção e documentação de passagem.
4. Backlog e especificações rastreáveis atuais.
5. Resumos de pesquisa, versões antigas, mockups, conversas antigas e hipóteses de agentes.

**ATUALIZAÇÃO CRÍTICA:** hoje a documentação mais recente confirma **11 lojas comerciais + local DEFEITOS**, que não é loja comercial; **Santa Cândida** é o piloto; **14 lojas** é meta de expansão, não contagem atual. Textos antigos, incluindo o `README.md` e `backlog.json`, ainda podem dizer "14 lojas existentes". Não reverter para premissa antiga nem apagar dados históricos. O prazo desejado de 6 meses é objetivo de negócio, NÃO promessa técnica.

## Modo de trabalho obrigatório: observar → planejar → implementar → verificar

Quando receber qualquer solicitação:

1. Declare tarefa, domínio, ID(s) `ORA-...` e objetivo de aceite. Se não existir ID, proponha inclusão rastreável sem duplicar requisito.
2. Execute **inventário somente leitura**: `git status`, branch e SHA, arquivos relevantes, ADRs, migrações, testes e issues/PRs abertos. Diferencie `main` e PRs não integradas. Não presuma que issue aberta significa defeito reproduzível: várias correções já entraram na main sem fechamento da issue.
3. Produza diagnóstico `existe / falta / hipótese / bloqueio externo`, com prova em arquivo+linha ou teste. Indique risco, impacto por loja, dados, segurança e regressão.
4. Defina implementação mínima, plano de migração (se houver), rollback/compensação, testes unitários, integração, concorrência, RLS, Playwright e evidências. Para operação monetária, confirme unidades em centavos e invariantes de livro.
5. Trabalhe em branch/worktree exclusiva e PR pequena; **não** altere a mesma migration, arquivo ou branch que Codex/Claude use simultaneamente. Banco muda apenas com migration versionada e revisão.
6. Teste via `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run segredos`, `npm audit --omit=dev` e geradores `scripts/gerar-rastreabilidade.mjs --conferir`, `scripts/gerar-catalogo-nogle.mjs --conferir` conforme o escopo, em instalação limpa quando necessário. Testes que exigirem serviços devem ter ambiente autorizado.
7. Codex faz revisão independente da implementação de Claude e vice-versa. Após ajustes, apresente PR, SHA, evidências, riscos residuais, migrações, dependências e o que permanece **não homologado**.
8. **Apenas aprovação explícita do proprietário** permite merge/deploy crítico, operação real, troca da Rein como sistema oficial, credenciais de terceiros ou alterações de produção. Aprovação fiscal exige contador/especialista.

## Regras de engenharia invioláveis

- Monólito modular atual: `apps/plataforma` Next.js/React/Tailwind/TypeScript; `apps/worker` Node/TypeScript; `packages/dominio` lógica; `packages/banco` PostgreSQL/Supabase e migrations; `packages/config` segurança/config. **Não substituir por Firebase, WordPress ou microsserviços sem decisão expressa e ADR.** npm workspaces.
- O banco PostgreSQL é a fonte transacional. Não confiar apenas no front-end: **RLS, grants, autorização, checks, transações, locks e idempotência no banco**. Inspecione funções `SECURITY DEFINER`, `search_path`, permissões, identidade do autor, organização e unidade.
- Cada operação pertence a loja, pessoa/vendedor, cliente quando aplicável, canal, registro fiscal e financeiro; diferencie **venda, pagamento, liquidação, estorno, movimento físico, ativação, recarga, repasse e produção/comissão**. Sem dupla contagem de receita, IMEI, ICCID, comissão ou cobrança.
- Rein: **somente arquivos exportados** (produtos, preços e estoque inicial quando validado). No paralelo do piloto a Rein segue fonte oficial até go/no-go por escrito. **NÃO criar API Rein operacional.**
- Nogle: documentação oficial `https://docs.nogle.tech/`, 62 funções em 16 grupos catalogadas no repo; usar **somente** contratos verificáveis, com credenciais do **worker**, nunca browser/web. Só Nogle confirma ativações, recargas ou portabilidades; timeout ambíguo = resultado desconhecido/gerência, não reenvio cego. LINK ao cliente ≠ SALDO pago pela loja; checar evidências de unicidade e evitar cobrança duplicada. Gateway, carteira, recorrência e repasses seguem dependências específicas, não presumir API disponível.
- PicPay POS/PagSeguro: registro e comprovante manual no PDV, **não inventar integração de maquininha**. PayJoy/Aiva: entrada, saldo financiado e recebível separados; troco exclusivamente do dinheiro; estorno externo confirmado por evidência. Link online depende de provedor e confirmação externa.
- Fiscal: existe **fila de solicitação/aprovação e registro manual de chave**, **não emissão automática homologada**. Gestor/dono aprova conforme política, sem atrasar obrigação legal. Emissor, prazos, documentos NF-e/NFC-e/NFCom/NFS-e e questões tributárias dependem de contador e fornecedor validado.
- Mobile-first: vendedor consegue vender, consultar e solicitar nota via celular; sem notebook nem scanner obrigatório. Leitor/câmera futuramente. Interface de `demo/` **não prova operação**.
- Estoque: IMEI/ICCID por unidade, movimentos e reservas, transferência expedição/recebimento, local DEFEITOS, retorno físico conferido; jamais restaurar estoque automaticamente por um cancelamento sem conferência.
- Proteção de segredos: **nunca** ler, copiar, imprimir, publicar ou colocar em prompt/log/PR valores de `.env`, chaves Nogle, CPF de clientes reais, certificados ou banco de produção. Confirme só nomes/ausência, a menos que o proprietário execute procedimento seguro no ambiente. Publicação web deve usar **allowlist** (`deploy/homologacao/ambiente-web.sh`), segredos somente no worker.
- Não eliminar migrations, histórico ou dados operacionais; mudanças aditivas/retrocompatíveis e reversão segura. Nunca `DROP` destrutivo ou `--force` sem autorização.
- Logs auditáveis, LGPD, backup restaurável, recuperação, monitoramento, idempotência e proteção contra concorrência são critérios de pronto, não melhorias opcionais.

## Domínios do projeto

Organização/lojas/perfis · CRM/funil/cliente 360° · Catálogo/foto/preços · Estoque/IMEI/ICCID/DEFEITOS/transferências · PDV mobile/vendas/trocas · Pagamentos/caixa/PicPay/PagSeguro/PayJoy/Aiva · Financeiro/contas/conciliação · Metas/comissões · Fiscal · Ora Connect/Nogle · Assistência técnica/OS · E-commerce nacional · Mercado Livre/Shopee/TikTok Shop · WhatsApp e atendimento · Meta Ads e atribuição · BI/relatórios · IA assistiva · Segurança/CI/CD/operação.

**MVP da loja piloto não é a plataforma inteira.** Concluir verticalmente processos críticos e lançar expansão por etapas, preservando as demais necessidades no backlog e modelo de dados; não marcar recursos de demonstração como "entregues".

## Primeira resposta quando esta skill for ativada

Responder em português do Brasil, com linguagem prática, como engenheiro sênior:

- SHA da branch analisada e se `git status` está limpo.
- O que está **implementado e testado**, **parcial**, **só demonstração**, **bloqueado** e **não iniciado** (com evidências).
- Diferenças encontradas entre código, ADR, backlog, issues, PRs e este snapshot.
- Três maiores riscos para a loja piloto, sequência de correção e próxima issue executável.
- O que exige ação do proprietário/contador/provedor; nunca pedir valores de segredos no chat.

**Não comece a programar só por carregar a skill.** Espere uma tarefa delimitada. Ao ser solicitado a implementar, siga o processo acima sem recriar a base existente.
