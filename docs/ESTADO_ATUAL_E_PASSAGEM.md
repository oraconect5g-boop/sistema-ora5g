# Estado atual do projeto e passagem de contexto

**Atualizado em:** 09/11/2026 · **Por:** Claude Code (programador, no servidor)
**Para:** o Claude Code que programa no servidor (usuário `dev`) e o Codex (revisor)

> **Prioridade atual (09/11, prompt consolidado da PR #33):** corrigir os achados do Codex por lotes, começando pelos bloqueantes ainda reproduzidos. A matriz de cada achado (regra, SHA auditado, código atual, reprodução atual, estado, correção, dependência e evidência) está em **`docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md`**. Lotes integrados na main: 1, acesso (`b967870`); 2, dinheiro, estoque e Connect (`c071968`); 3, CSV, busca e fotos (`596b046`); 4, demonstração (`11e4e48`); 5, transferências entre lojas e DEFEITOS (#60, ADR-007, `1f55af9`). As migrations dos cinco lotes estão aplicadas no `ora5g-dev`. Mudanças de comportamento: cancelamento não repõe estoque sozinho (retorno conferido por IMEI/ICCID), e cartão/Pix/financeira ficam como estorno a confirmar com o comprovante. A homologação está na `8f7a458` (lotes 1 a 5, nome Nogle e consulta pelo uuid desligada), publicada com autorização do proprietário em 10/11. Próximo: #54 nas partes com contrato documentado e o cadastro das 11 lojas (linha B2). #44 está sem atualização compatível; reconferir. #11 depende do usuário de teste (linha A1). **Rede:** 11 lojas comerciais mais o local DEFEITOS (não é loja). **Stack mantida** (Supabase/PostgreSQL; nada de Firebase). **Ora Connect = API oficial da Nogle** (decisão do proprietário de 09/11). Não existe integração "Contel" separada: esse nome só aparece na documentação oficial da Nogle, no endereço da API e no e-mail de suporte. Telas e documentos dizem "Nogle". Lista única de dependências externas: seção 0 de `docs/PENDENCIAS_DO_PROPRIETARIO.md`.
>
> **Prioridade anterior (08/11, PR #25):** núcleo real para sair da Rein — vendas, pagamentos/caixa e Ora Connect sobre acesso, catálogo, fotos e estoque íntegros, mais **cadastro de usuários e gestão da equipe** (pedido do proprietário). Fila com aceite e situação: **`docs/alinhamento/FILA_DE_EXECUCAO.md`**. APIs e habilitações: **`docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`**.
>
> **O que depende do proprietário (e-mails, chaves, painéis, decisões): `docs/PENDENCIAS_DO_PROPRIETARIO.md`.** Revisão do planejamento de 08/11: `docs/alinhamento/REVISAO_DO_PLANEJAMENTO_2026-11-08.md`.
>
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

1. Rede **Ora 5G**: **11 lojas comerciais** de celulares e acessórios (decisão de 09/11; a informação anterior de 14 está superada) mais o local **DEFEITOS**, para itens com problema + operação de chips **Ora Connect**. Um **CNPJ raiz** com **CNPJ de filial por loja**.
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
| Domínio | `ora5g.com.br` registrado no Registro.br; DNS delegado ao próprio servidor, `ns1.ora5g.com.br` (.94) e `ns2.ora5g.com.br` (.23), **conferido em 07/11** (P12; antes estava no Hostoo) |
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
| `docs/adr/ADR-003-...` | **Proposto em 08/11:** catálogo, preço e custo com histórico, estoque em livro, IMEI/ICCID, reservas |
| `docs/PENDENCIAS_DO_PROPRIETARIO.md` | Tudo o que depende do proprietário, e-mails prontos e as 60 chaves (só nomes), com o comando `definir-chave.sh` |
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
| P14 | Teto de desconto e margem mínima por categoria | PENDENCIAS §3 |
| ADR-003 | Aceite e perguntas Q1 a Q4 (sincronia com a Rein no piloto, preço por loja, seminovos, chip a chip) | ADR-003 |

**Não decidir nada disso sozinho.** Pode preparar opções reversíveis.

## 6. Próximos passos do programador (em ordem)

**Execução prioritária (08/11, noite) — onde parei e o que vem:**
- Feito na branch `fix/ORA-integridade-estoque`: merge da PR #25; integridade do estoque (#19 a #22) por migration nova `20261108195850_integridade_estoque` (aplicada no `ora5g-dev`, registrada em `aplicadas-dev.json`), com regressões e **11 disputas com duas conexões num PostgreSQL 17 real** (`packages/banco/src/concorrencia.test.ts`, via `embedded-postgres`); defeito novo corrigido (saída de estoque falhava no upsert do saldo); demonstração #23 e #24; lista de APIs; `definir-chave.sh` aceita cifrão/aspas (§7.6). Respostas ao Codex: `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-08.md`.
- Integrado na `main` em `fefcc51` (sequência do CI em clone limpo passou).
- Feito na branch `feature/ORA-006-acesso-equipe` (item 5): migration `20261108202654_acesso_sessao_e_equipe` (aplicada no `ora5g-dev`): sessão por turno lida de `auth.sessions` (revogação imediata), equipe por convite com hierarquia, funções do worker só para `service_role`; app com `/escolher-loja`, `/inicio`, `/equipe`, `/auth/confirmar`, `/conta/senha`, `/entrar/recuperar`, `/sair`; tipos gerados do Supabase; `apps/worker` (convites e bloqueios no Auth) e `publicar.sh` entregando a chave secreta só ao worker (provado em publicação isolada na porta 3190). Para ligar o convite real: `SUPABASE_SECRET_KEY`, SMTP e dois modelos de e-mail no painel (proprietário) + linha do worker no crontab (ao publicar).
- Integrado na `main` em `55d10af` (acesso real e equipe; CI em clone limpo passou).
- Feito na branch `feature/ORA-CAT-011-fotos` (item 7, parte 1): migration `20261108204536_fotos_dos_produtos` (aplicada no `ora5g-dev`), tela `/catalogo` com fotos, envio pelo celular, pendências; tipos regenerados; centavos e contagens só como inteiro seguro.
- Integrado na `main` em `aebbdcc` (fotos; CI em clone limpo passou).
- Feito na branch `feature/ORA-ADR-004-vendas` (itens 9 e 10 da fila): ADR-004 (proposto), migrations `20261108233546_vendas_pagamentos_e_caixa` e `20261108233711_indices_vendas_e_fotos` (aplicadas no `ora5g-dev`), telas `/vender`, `/caixa`, `/aprovacoes`, `/vendas/[id]`; 13 cenários de venda e concorrência real da conclusão.
- Integrado na `main` em `371cef0` (vendas, pagamentos e caixa; CI em clone limpo passou: 428 testes, 134 E2E).
- Feito na branch `feature/ORA-CONNECT-adaptador` (item 11, ADR-005) e, empilhada, `feature/ORA-FISC-fila` (item 12, ADR-006, e o go/no-go do item 13). Testado localmente (banco em memória, PostgreSQL 17 real, worker ponta a ponta com servidor local e exemplos oficiais da Nogle).
- Aplicadas no `ora5g-dev` em 09/11 (md5 conferido): `20261109123402_ora_connect_operacoes`, `20261109123533_indices_ora_connect` e `20261109123757_fila_fiscal`; tipos gerados depois de cada uma.
- Integrado na `main` em 09/11, cada um depois da sequência do CI em clone limpo: `967023e` (tela real de estoque `/estoque`, com foto, IMEI/ICCID e conferência do dia), `f161912` (Ora Connect, ADR-005) e `9b1109e` (fila fiscal, ADR-006; go/no-go; ORA-OS-001 a 006 no backlog).
- Integrado na `main` em `0fa1546` (09/11, CI em clone limpo): devolução parcial e troca com vale-troca (adendo do ADR-004), migration `20261109134507_devolucao_e_troca` aplicada no `ora5g-dev`.
- **Próximo:** relatório diário Rein × Ora (depende do arquivo da Rein), ensaio de restauração do banco e das fotos (cenário J) e, quando a secret key existir, usuários de teste e E2E real de login, venda, Connect e notas. Ora Connect real só depois das credenciais no worker, da P9 e da linha de teste (agendar `worker-connect.sh` com autorização).
- Depois: tipos gerados e centavos (6), catálogo/estoque reais com fotos (7), ADR-004 vendas (9), caixa e pagamentos (10), adaptador Nogle (11), fila fiscal (12), go/no-go (13).
- Pastas para o proprietário enviar arquivos: `~/entrada/{rein,lojas,equipe,fotos}` (700). Nada recebido até 08/11.
- **Homologação (ora5g.com.br, porta 3100) na versão `8f7a458` desde 10/11** (antes `0292c69`, `3157e70`, `0fa1546` e `9b1109e`), todas publicadas com autorização do proprietário. A `8f7a458` traz o nome Nogle nas telas e a consulta pelo uuid (desligada). Conferido na `8f7a458` e antes: `/saude` 200 no servidor e pelo domínio; rotas reais (inclusive `/transferencias`) levando ao `/entrar`; demonstração no ar. O ambiente do site tem só 4 nomes (`APP_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), sem Nogle e sem chave secreta (#55). Inclui os lotes 1 a 5 do prompt consolidado. O worker da Connect **não** está agendado. Publicar de novo só com autorização do proprietário.

Histórico anterior (07 e 08/11):

Feito em 07/11: deploy key e clone; Node 22; **ORA-002**; **ORA-003**; **ORA-004/005** (aplicada no `ora5g-dev`); **regras de negócio puras** (dinheiro, IMEI/ICCID, desconto por margem, pagamento misto e financiado, produção por categoria); **versão de demonstração** com 12 telas e 4 perfis, desligada em produção; **login real** ligado ao Supabase (recusa credencial errada com mensagem neutra, testado contra o projeto real); **homologação** rodando no servidor em `127.0.0.1:3100`, com reinício automático pelo `crontab` (autorizado em 07/11). **Desde 07/11, `https://ora5g.com.br` mostra temporariamente a plataforma** (`.htaccess` na `public_html` da conta `wwora5`, colocado pelo proprietário) para a primeira apresentação; conferido por navegador de celular. Quando o subdomínio `hml-app` existir, apagar esse `.htaccess` para o domínio principal voltar ao site institucional (ver `deploy/homologacao/LEIA-ME.md`).

**Novo visual e revisão do front-end (07/11, pedido do proprietário):** demonstração refeita com gráficos, 17 telas e 5 perfis (inclui Vendas, Produtos e preços, Relatórios, Auditoria e o perfil Técnico como opção para a P5), **loja da sessão** (vendedor com duas lojas troca no topo; gestão vê todos os vendedores, vendedor só os próprios números), 14 defeitos de tela corrigidos, inclusive o **REV-015** (desconto maior que o item derrubava a venda). Relatório: `docs/alinhamento/REVISAO_FRONTEND_2026-11-07.md`. Integrado também o guia do Codex `docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md` (modelo mínimo `apps/plataforma/.env.example`).

**Ora Connect e API Nogle (08/11, pedido do proprietário):** a documentação oficial (https://docs.nogle.tech/) foi lida por inteiro: 62 funções em 16 grupos, cópia guardada e catálogo gerado (`docs/integracoes/NOGLE_API_REFERENCIA.md`). A tela Ora Connect da demonstração ganhou abas com todas as funções (ativar chip físico ou eSIM, consultar linha, recarga, portabilidade, bloqueio, chips e entrega, carteira, integração), simuladas no formato documentado. Para ligar de verdade faltam a **P9** (tipo de chave), credenciais no gerenciador de segredos e as perguntas da seção 3 da referência.

**Back-end iniciado (08/11, pedido do proprietário):** corrigidos o #17 (versões das migrations iguais às do Supabase, sem tocar no banco, com teste que impede alterar migration aplicada) e o #18 (PDV não passa do estoque). Feitos a auditoria automática de acesso (ORA-ORG-005) e o ADR-003 (proposto) com a migration de catálogo, preço, custo, estoque em livro, IMEI/ICCID e reservas, **aplicados no `ora5g-dev`** com md5 conferido (`packages/banco/supabase/aplicadas-dev.json`). Banco de desenvolvimento com semente fictícia (3 unidades, 6 variações, 17 itens). Lista do que depende do proprietário e comando para gravar chaves sem exibir: `docs/PENDENCIAS_DO_PROPRIETARIO.md` e `deploy/homologacao/definir-chave.sh`. Aguardando revisão do Codex: `docs/alinhamento/PEDIDO_DE_REVISAO_CODEX.md` (seção de 08/11).

1. **Fila de revisão com o Codex (atualizada em 08/11):** dos 14 achados de 07/11, o Codex conferiu as correções e encerrou sete issues com evidência (`docs/alinhamento/CONFERENCIA_DAS_CORRECOES_2026-11-07.md`); a **#13 / REV-015** (desconto maior que o item) também foi confirmada e encerrada na auditoria de 07/11 (`docs/analises/AUDITORIA_FUNCIONAL_E_SUPABASE_2026-11-07.md`). Corrigidos em 08/11 na branch `fix/residuos-codex-2026-11-07`, **aguardando revisão do Codex**: resíduo do **REV-008** (#10, aritmética exata em valores altos), teste do **REV-014**, **REV-016** (#14, republicar o mesmo commit com outro ambiente), **CONFIG-001** (#12) e **REV-017** (#16, `/entrar?erro=constructor` dava 500). Respostas: `docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md`. Continua aberta a **#11 / REV-009**: renovação de sessão sem teste com usuário real, que ainda não existe.
2. ~~Auditoria automática de mudanças em vínculos, perfis e papéis (ORA-ORG-005).~~ **Feita em 08/11**, aguardando revisão do Codex.
3. **ADR-003** proposto em 08/11 e já aplicado no desenvolvimento: falta a revisão do Codex e o aceite do proprietário (pendência 1.6).
4. **ORA-006** completo (próxima entrega): escolha da loja na sessão, sessão por turno, recuperação de senha (depende do SMTP), usuários de teste (script `packages/banco/supabase/semente/vincular-usuarios-de-teste.sql` pronto; falta o proprietário criar os usuários). Junto: tipos do banco gerados no aplicativo e a tela real de estoque.
5. **ORA-007** catálogo e **ORA-010** estoque/IMEI: banco pronto no desenvolvimento (08/11); faltam as telas reais e a prova com duas conexões simultâneas (precisa `DATABASE_URL`). **ORA-009** importador: depende do arquivo da Rein.
6. Trocar as telas da demonstração pelas reais, uma a uma, conforme cada módulo fica pronto (reaproveitar `src/componentes` e as regras de `src/demo/consultas.ts` como contrato de quem vê o quê).
7. ~~Achados novos do Codex na auditoria de 07/11~~ **tratados em 08/11**, aguardando conferência do Codex: **#17 / REV-018** (as versões do histórico de migrations no Supabase diferem das do Git, embora os objetos correspondam; conciliar por procedimento revisado, sem `repair` nem `reset` às cegas) e **#18 / REV-019** (no PDV da demonstração, acessório aceita quantidade acima do saldo e a conclusão continua habilitada).

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
