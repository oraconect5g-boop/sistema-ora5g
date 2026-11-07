# Estado atual do projeto e passagem de contexto

**Atualizado em:** 07/11/2026 · **Por:** Claude Code (programador, no servidor)
**Para:** o Claude Code que programa no servidor (usuário `dev`) e o Codex (revisor)

> Leia este arquivo **antes de qualquer tarefa**. Ele resume duas conversas longas com o proprietário (05 e 06/11/2026). Os detalhes estão nos documentos citados; em caso de dúvida, a decisão mais recente do proprietário vale mais que qualquer documento antigo.

---

## 1. Quem é quem

| Quem | Papel |
|---|---|
| Proprietário | Desenvolvedor/administrador do sistema. Aprova PRs, publicações e decisões. Não é programador profissional: explicar em linguagem simples, em português |
| Donos da empresa | Dois sócios (Camille e André). Aprovam descontos e notas; emitem as notas fiscais hoje |
| **Claude Code** | **Programador.** Trabalha por SSH no servidor, usuário `dev`, área de desenvolvimento/homologação. Acessa o `.env` de dev/homologação e nunca exibe valores |
| **Codex** | **Revisor.** Trabalha só no GitHub: revisa cada PR, aponta bugs e desvios do plano, faz só correções pequenas. Não acessa o servidor |

Papéis **fixos** (decisão do proprietário). Detalhes: ADR-001, seção 2.7.

**Merges (decisão do proprietário, 07/11/2026):** o Claude Code faz os merges na `main` depois de rodar no servidor, a partir de instalação limpa, a mesma sequência do CI. O Codex continua revisando os commits no GitHub e aponta correções, que voltam como novos commits. Limitação atual: o Claude Code não enxerga o resultado do CI no GitHub (a Deploy key não acessa a API); o proprietário confere a aba Actions.

## 2. O negócio em 10 linhas

1. Rede **Ora 5G**: 14 lojas de celulares e acessórios + operação de chips **Ora Connect**. Um **CNPJ raiz** com **CNPJ de filial por loja**.
2. **Piloto:** loja **Santa Cândida**. Depois: 3 → 7 → 14 lojas; loja online e marketplaces.
3. **Vendedores fazem tudo** (vendem, recebem, lançam), usam **celular pessoal e da loja**, entram por **e-mail**, e **circulam entre lojas**. Não há caixa, estoquista nem gerente oficial hoje.
4. **Rein** (sistema atual) continua rodando em paralelo durante o desenvolvimento e o piloto. Dela vem **só um CSV** com produtos, preços e **estoque**. Nenhuma API da Rein.
5. **Nota fiscal:** hoje o dono emite manualmente num portal, anexa na Rein e envia ao cliente. Objetivo: **solicitação pelo vendedor → aviso no celular do dono/gerente → aprovar em 1 toque → emissão por API → envio automático por e-mail ou WhatsApp**. Provedor fiscal e contador ainda não definidos.
6. **Pagamentos:** dinheiro, Pix, maquininhas **PicPay** e **PagSeguro**, **link de pagamento** online, financeiras **PayJoy** e **Aiva (Flexphone)**: registra-se o preço do aparelho e a entrada; os juros da financeira **não** entram. E-mail do cliente obrigatório só na PayJoy.
7. **Desconto:** hoje é livre e gera diferenças de caixa. Regra nova: vendedor não edita preço; o limite depende da **margem** do produto (teto da categoria, ex.: até 10% à vista, e margem mínima). Acima disso, pedido de aprovação ao gerente ou dono.
8. **Assistência técnica:** técnico central, orçamentos hoje no WhatsApp e em papel → **Ordem de Serviço digital** com avisos ao cliente e ao técnico; registrar a assistência conta na comissão do vendedor (combate o serviço feito "por fora").
9. **Desempenho do vendedor:** turno por loja, vendas por categoria (incluindo chips, ativações, portabilidades e recargas, que hoje não contam), metas e incentivos.
10. **Prazo pedido:** 6 meses (até início de maio/2027) para o núcleo nas 14 lojas + Ora Connect + link de pagamento + Mercado Livre e TikTok Shop. Shopee, Meta Ads avançado, IA e BI avançado ficam para depois.

## 3. Infraestrutura conferida

| Item | Valor |
|---|---|
| Servidor | VPS HostGator com **cPanel/WHM**, família Red Hat 9, 4 vCPUs, 16 GB, 512 GiB |
| IPv4 | `69.6.214.94` (principal) e `69.6.214.23` (usado pelo `ns2`, **não excluir**). **Sem IPv6** |
| SSH | Porta **22022**, usuário `dev` criado, login só por chave, conexão do Windows do proprietário **testada e funcionando** |
| Impressão digital ED25519 do servidor | `SHA256:qpqzb3QMPlzqESR9xKmrxkjAR/FNTWzHhCYusI73COA` |
| Domínio | `ora5g.com.br` registrado no Registro.br; DNS ainda delegado ao Hostoo; troca para `ns1.ora5g.com.br` (.94) e `ns2.ora5g.com.br` (.23) **planejada, não confirmada** |
| Zona DNS no WHM | Conferida: A, MX, SPF, DKIM, DMARC, nenhum AAAA |
| Domínios do sistema | `app`, `loja`, `hml-app`, `hml-loja` `.ora5g.com.br` (só registros A) — ainda não criados |
| Portas internas | **30xx produção, 31xx homologação**, sempre em `127.0.0.1` |
| Banco | **Supabase gerenciado**, pelo **pooler em modo sessão (5432)**, porque a conexão direta é só IPv6. Projeto de dev **`ora5g-dev`** (`qgnbeuugklzzcevdzrvg`, São Paulo, gratuito) criado em 07/11 com as migrations aplicadas. Faltam no `.env.local` do servidor: `SUPABASE_SECRET_KEY` e `DATABASE_URL` (o proprietário preenche) |
| Node no servidor | 22.23.4 em `~/.local/opt/node` (pacote oficial com checksum conferido; o nvm foi bloqueado pela política de segurança do ambiente) |
| Node no servidor | Usar `127.0.0.1` (nunca `localhost`) e `NODE_OPTIONS=--dns-result-order=ipv4first` |

## 4. Documentos (onde está cada coisa)

| Documento | Conteúdo |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | Regras obrigatórias dos agentes |
| `README.md`, `docs/00` a `docs/13`, `backlog.json` | Pacote original de planejamento (172 requisitos) |
| `docs/etapa-0/ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md` | Primeiro entendimento |
| `docs/etapa-0/ETAPA_0_BASE_CONSOLIDADA.md` | Visão-alvo, invariantes, conflitos entre fontes, recorte do piloto |
| `docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md` | **Decisões DEC-U18 a DEC-U49**, contrato Nogle parcial, plano de 6 meses, propostas (nota automática, desconto por margem, OS, incentivos) |
| `docs/integracoes/VARIAVEIS_DE_AMBIENTE.md` + `.env.example` | Todas as chaves previstas, onde obter, o que fica no banco |
| `docs/adr/ADR-001-...` | Infraestrutura, IPv4, portas, cPanel, papéis e acesso ao servidor |
| `docs/adr/ADR-002-...` | Empresa, unidades, perfis, permissões, 10 tabelas da primeira migration, 12 testes negativos |
| `docs/etapa-1/PLANO_DE_INICIO_DA_IMPLEMENTACAO.md` | Semanas 1–4 (ORA-001 a ORA-012), loja online como canal |
| `docs/operacao/CONECTAR_CLAUDE_CODE_SSH_WINDOWS.md` | Como o proprietário conectou o Claude Code ao servidor |

**Situação no Git (07/11):** a documentação e o código estão na **`main`**: ORA-002 (PR #1), ORA-003 e ORA-004/005. O código fica em `apps/plataforma`, `packages/config` e `packages/banco`; cada pasta tem um README.

## 5. Decisões pendentes do proprietário

| # | Pergunta | Onde |
|---|---|---|
| ~~P1~~ | **Respondida 07/11:** opção A, manter o cPanel | ADR-001 §4A |
| ~~P2~~ | **Respondida 07/11:** sim, administrador não vende nem aprova | ADR-002 §5 |
| P3 | Ranking com nome dos colegas ou só posição própria? | ADR-002 §5 |
| ~~P4~~ | **Respondida 07/11:** sim, por busca exata registrada | ADR-002 §5 |
| P5 | Técnico com login próprio ou só mensagens? É funcionário ou terceiro? | ADR-002 §5 |
| ~~P6~~ | **Respondida 07/11:** sim | ADR-002 §5 |
| P7 | Qual portal emite a nota hoje e qual tipo (NFC-e ou NF-e)? Há contador? | Decisões 06/11 §6 |
| P8 | Financeiras repassam preço − entrada sem taxa? Em quantos dias? | Decisões 06/11 §6 |
| P9 | Tipo da chave Nogle (franquia, marca/MVNO ou PDV) | Decisões 06/11 §3 |
| P10 | Loja online: CNPJ emissor, origem do estoque, transportadora, domínio final | Plano §8 |
| ~~P11~~ | **Respondida 07/11:** autorizado; projeto `ora5g-dev` criado | Plano §6 |
| P12 | Delegação do DNS no Registro.br: feita ou não? | ADR-001 §4A |
| P13 | Contexto da conversa com o ChatGPT/Codex: o proprietário vai trazer o resumo | Seção 7 |

**Não decidir nada disso sozinho.** Pode preparar opções reversíveis.

## 6. Próximos passos do programador (em ordem)

Feito em 07/11: deploy key e clone; Node 22 no servidor; **ORA-002** (esqueleto e `/saude`); **ORA-003** (CI, validação de variáveis, detector de segredos); **ORA-004/005** (primeira migration, RLS e testes T1–T12, aplicada no `ora5g-dev`).

1. **ORA-006 — login:** e-mail e senha pelo Supabase Auth, sessão por turno, escolha da unidade com `selecionar_unidade`, bloqueio imediato. Depende de o proprietário preencher `SUPABASE_SECRET_KEY` e `DATABASE_URL` no servidor e de definir o e-mail de envio (SMTP da HostGator) para a recuperação de senha.
2. **ORA-007 — catálogo:** produto, variação, tipo de item, código de barras, custo, preço com histórico, "publicar online".
3. **ORA-009 — importador do CSV da Rein** em modo prévia. Depende do CSV de exemplo (anonimizado).
4. **ORA-010 — estoque e IMEI**, com teste de concorrência.
5. **ORA-012 — homologação na VPS (opção A):** o Claude prepara a aplicação e o passo a passo; Apache e systemd exigem root e ficam com o proprietário. Depende também da delegação do DNS (P12).
6. Ainda abertos no ADR-002: ranking (P3) e técnico (P5).

## 7. Contexto da conversa com o ChatGPT

O proprietário também conversou com o ChatGPT/Codex. **Esse conteúdo ainda não está no repositório.** Quando ele trouxer o resumo:
- salvar em `docs/historico/conversa_chatgpt_AAAA-MM-DD.md`, **sem senhas, chaves, CPFs ou dados reais de clientes**;
- comparar com este documento e listar as divergências para o proprietário decidir. Não aplicar nada automaticamente.

## 8. Nunca fazer

- Exibir valores do `.env` em mensagens, logs, commits ou PRs.
- Acessar o `.env` de produção, o WHM, o e-mail, o DNS ou arquivos fora de `/home/dev`.
- Inventar endpoints da Nogle, PicPay, PagBank, marketplaces, WhatsApp, Meta ou fiscal.
- Usar API da Rein.
- Criar registro AAAA ou depender de IPv6.
- Publicar em produção sem aprovação do proprietário.
- Declarar algo "pronto" sem teste rodando.
