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
| Banco | **Supabase gerenciado**, pelo **pooler em modo sessão (5432)**, porque a conexão direta é só IPv6. Projeto de dev **`ora5g-dev`** (`qgnbeuugklzzcevdzrvg`, São Paulo, gratuito) criado em 07/11 com as migrations aplicadas. Endereço e chave pública já configurados (bastam para o login). `SUPABASE_SECRET_KEY` e `DATABASE_URL` só serão necessárias para worker, scripts de banco e criação de usuários pelo sistema (o proprietário preenche no servidor) |
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

**Situação no Git (07/11):** tudo na **`main`**: ORA-002 (PR #1), ORA-003, ORA-004/005, regras de negócio puras (`packages/dominio`), versão de demonstração (`apps/plataforma/src/app/demo`), login real ligado ao Supabase e scripts de homologação (`deploy/homologacao`). Cada pasta tem um README.

**Alinhamento com o Codex:** a análise completa do plano × realidade está em `docs/alinhamento/ANALISE_DO_PLANO.md`; o status de cada um dos 172 requisitos em `docs/alinhamento/RASTREABILIDADE.md` (gerado por `node scripts/gerar-rastreabilidade.mjs`); o pedido de revisão em `docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md`.

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
| ~~P12~~ | **Conferido 07/11:** delegação feita; o DNS responde por `ns1`/`ns2.ora5g.com.br` no próprio servidor | ADR-001 §4A |
| P13 | Contexto da conversa com o ChatGPT/Codex: o proprietário vai trazer o resumo | Seção 7 |

**Não decidir nada disso sozinho.** Pode preparar opções reversíveis.

## 6. Próximos passos do programador (em ordem)

Feito em 07/11: deploy key e clone; Node 22; **ORA-002**; **ORA-003**; **ORA-004/005** (aplicada no `ora5g-dev`); **regras de negócio puras** (dinheiro, IMEI/ICCID, desconto por margem, pagamento misto e financiado, produção por categoria); **versão de demonstração** com 12 telas e 4 perfis, desligada em produção; **login real** ligado ao Supabase (recusa credencial errada com mensagem neutra, testado contra o projeto real); **homologação** rodando no servidor em `127.0.0.1:3100`, com reinício automático pelo `crontab` (autorizado em 07/11). **Desde 07/11, `https://ora5g.com.br` mostra temporariamente a plataforma** (`.htaccess` na `public_html` da conta `wwora5`, colocado pelo proprietário) para a primeira apresentação; conferido por navegador de celular. Quando o subdomínio `hml-app` existir, apagar esse `.htaccess` para o domínio principal voltar ao site institucional (ver `deploy/homologacao/LEIA-ME.md`).

**Novo visual e revisão do front-end (07/11, pedido do proprietário):** demonstração refeita com gráficos, 17 telas e 5 perfis (inclui Vendas, Produtos e preços, Relatórios, Auditoria e o perfil Técnico como opção para a P5), **loja da sessão** (vendedor com duas lojas troca no topo; gestão vê todos os vendedores, vendedor só os próprios números), 14 defeitos de tela corrigidos, inclusive o **REV-015** (desconto maior que o item derrubava a venda). Relatório: `docs/alinhamento/REVISAO_FRONTEND_2026-11-07.md`. Integrado também o guia do Codex `docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md` (modelo mínimo `apps/plataforma/.env.example`).

**Ora Connect e API Nogle (08/11, pedido do proprietário):** a documentação oficial (https://docs.nogle.tech/) foi lida por inteiro: 62 funções em 16 grupos, cópia guardada e catálogo gerado (`docs/integracoes/NOGLE_API_REFERENCIA.md`). A tela Ora Connect da demonstração ganhou abas com todas as funções (ativar chip físico ou eSIM, consultar linha, recarga, portabilidade, bloqueio, chips e entrega, carteira, integração), simuladas no formato documentado. Para ligar de verdade faltam a **P9** (tipo de chave), credenciais no gerenciador de segredos e as perguntas da seção 3 da referência.

1. **Revisão do Codex de 07/11:** os 14 achados (REV-001 a REV-014) foram tratados: 13 com teste de regressão e o REV-009 (renovação de sessão) sem teste com usuário real, que ainda não existe; respostas em `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md`. Aguardam a revisão do Codex sobre as correções.
2. **Auditoria automática** de mudanças em vínculos, perfis e papéis (ORA-ORG-005).
3. **ADR-003** (operação comercial, tipos de item, ledger de estoque), revisado pelo Codex e aceito pelo proprietário.
4. **ORA-006** completo: escolha da loja na sessão, sessão por turno, recuperação de senha (depende do SMTP), usuários de teste.
5. **ORA-007** catálogo, **ORA-009** importador (depende do CSV), **ORA-010** estoque e IMEI com teste de concorrência.
6. Trocar as telas da demonstração pelas reais, uma a uma, conforme cada módulo fica pronto (reaproveitar `src/componentes` e as regras de `src/demo/consultas.ts` como contrato de quem vê o quê).
7. Resíduos da conferência do Codex: **REV-016** (republicar o mesmo commit não troca o ambiente), resíduo de arredondamento do **REV-008** em valores muito altos, teste automático do erro de consulta do **REV-014** e compatibilidade da **CONFIG-001**.

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
