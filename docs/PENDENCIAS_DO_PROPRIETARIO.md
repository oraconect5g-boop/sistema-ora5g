# O que depende do proprietário

**Atualizado em:** 10/11/2026 · **Por:** Claude Code (programador)
**Lista consolidada de APIs, acessos e habilitações (com documentação oficial e nomes das variáveis): [`docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`](integracoes/APIS_E_HABILITACOES_NECESSARIAS.md).** Esta página continua com os detalhes de cada passo.
**Para:** o proprietário e o Codex. O Codex usa esta lista para dizer ao proprietário o que falta. **Valores de chaves e senhas nunca passam pelo chat (nem do Claude nem do Codex) e nunca vão para o GitHub**: eles são gravados direto no servidor pelo comando da seção 4, ou ficam no painel do próprio fornecedor. O Codex confere só pelos **nomes**.

Tudo o que não está aqui o Claude Code faz sozinho (programação, migrations no banco de desenvolvimento, publicação na homologação depois da sua autorização, chaves geradas por nós).

---

## 0. Lista única de dependências externas (09/11/2026)

Uma linha por fornecedor ou capacidade. Mostra o que fica bloqueado e o critério para desbloquear. Variáveis aparecem só pelo **nome**; os valores são gravados pelo comando da seção 4. Desde a correção #55, a publicação entrega ao site só `APP_ENV`, `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY` e `NEXT_PUBLIC_*`. Chave secreta do Supabase e chaves Nogle ficam só no worker. O restante do projeto continua andando sem estas dependências.

| # | Fornecedor / capacidade | Função bloqueada | Prioridade | Contrato / habilitação | Ambiente de teste | Variáveis (nomes) | Critério de desbloqueio |
|---|---|---|---|---|---|---|---|
| A1 | Supabase Auth: **usuário de teste fictício** | Prova #11: login, renovação da sessão, saída, revogação e segunda visita. Também o cadastro de pessoas pela tela | P0 | Nenhum contrato. A chave secreta foi gravada em 18/11: o Claude cria o usuário fictício (e-mail `@example.com`, sem e-mail de terceiros), com o seu sim | `ora5g-dev` | `SUPABASE_SECRET_KEY` (só no worker; o login usa a chave pública) | Usuário de teste existe e a prova #11 passa |
| A2 | E-mail do sistema (SMTP próprio no Supabase) | Convite e recuperação de senha por e-mail | P1 | Caixa `nao-responda@ora5g.com.br` (cPanel) e SMTP no painel do Supabase (seção 5) | `ora5g-dev` | No painel do Supabase; `EMAIL_FROM` e `SMTP_*` só quando o sistema mandar e-mail próprio | E-mail de teste chega a uma caixa controlada |
| B1 | **Arquivo da Rein** (produtos, preços, estoque) | Importador com prévia e aprovação; carga do piloto | P0 | Nenhum (arquivo exportado) | Cópia em `~/entrada/rein/` | — | Arquivo recebido e prévia sem erro bloqueante |
| B2 | **Dados das 11 lojas e do local DEFEITOS** (nome de origem, código, CNPJ, endereço) | Cadastro real das lojas; transferências e DEFEITOS (#60) | P0 | Decisão já tomada (11 lojas + DEFEITOS). Os nomes dos 12 locais já estão em `docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json`; faltam CNPJ e endereço; nada é inventado | `~/entrada/` | — | Arquivo conciliado com o cadastro confirmado |
| C1 | **Nogle: chaves, tipo de chave (P9) e linha/ICCID de teste** | Ativação, recarga e portabilidade reais (#54); homologação da Ora Connect | P0 | Contrato atual e respostas às 51 perguntas ([`PERGUNTAS_PARA_NOGLE_2026-11-09.md`](integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md); respostas de 10/11 na [referência §3.1](integracoes/NOGLE_API_REFERENCIA.md)) | Conta ou linha de teste autorizada | `NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY`, `NOGLE_OPERACOES_HABILITADAS` (só no worker) | Uma operação de teste confirmada pela evidência oficial |
| C2 | Nogle: cobrança/gateway, carteira e extrato, recorrência e repasse | Partes 4 a 6 da #54 | P1 | Documentação oficial e habilitação desses recursos | Idem C1 | Idem C1 | Contrato e campos documentados pela Nogle |
| D1 | **Contador e emissor fiscal** | Emissão automática; nota de devolução por API | P1 | Contrato com o emissor; modelo, tributos e certificado definidos pelo contador | Homologação do emissor | `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT` | Nota de teste emitida na homologação do emissor |
| E1 | Link de pagamento PicPay / PagBank | Meio "link" na venda (hoje recusado) | P2 | Habilitação do link nas contas | Sandbox do fornecedor | `PICPAY_*`, `PAGBANK_*` | Cobrança de teste com retorno conferido |
| E2 | PayJoy / Aiva: relatório de repasse (P8) | Conciliação automática do valor a receber (hoje manual) | P2 | Relatório ou contrato com prazo e taxa (nada é inventado) | — | — | Relatório recebido e conciliado com uma venda de teste |
| E3 | **Extratos das maquininhas e do banco** (arquivos) | Conciliação de pagamentos, taxas e repasses (PAY-009/010); "liquidado" no financeiro real | P2 | Exportação dos extratos PicPay, PagBank e banco | Cópia em `~/entrada/extratos/` | — | Arquivo de um dia conciliado com as vendas registradas |
| F1 | WhatsApp oficial (Meta) | Avisos de nota, OS e comprovante | P2 | Verificação da empresa no Meta Business | Número de teste da Meta | `WHATSAPP_*` | Mensagem de teste entregue no número de teste |
| G1 | Decisões comerciais: D-026 (prazo e estado na troca), D-016, D-006, G1, G2, P14 (limites de desconto) | Aplicar a política (hoje o sistema registra e controla, mas não decide quem tem direito) | P1 | — | — | — | Resposta registrada em `docs/10_DECISOES_PENDENTES.md` |

Maquininhas PicPay POS e PagSeguro continuam com conferência manual por comprovante: não há API verificada e não há desbloqueio previsto.

Financeiro real (#65): a primeira fatia (vendas, pagamentos registrados e caixas) não depende de fornecedor. Seguem bloqueados: conciliação e "liquidado" (E3), repasses das financeiras (E2) e da Nogle (C2), e margem com custo real (custos chegam com o arquivo da Rein, B1).

## 1. Fazer agora (destrava o login real e o mês 1)

| # | O quê | Onde e como | Destrava |
|---|---|---|---|
| 1.1 | ~~Criar 2 usuários de teste~~ **não é mais necessário** | Com a chave do item 1.2 gravada, o Claude cria usuários de teste fictícios (e-mails `@example.com`) e você cadastra as pessoas reais pela tela da equipe | — |
| 1.2 | ~~Gravar a chave secreta do Supabase no servidor~~ **Feito em 18/11:** gravada no servidor, só no ambiente dos workers; a rotina dos convites foi ligada no mesmo dia, com o seu sim | Supabase → **Project Settings → API Keys → Secret keys** → copie a chave (`sb_secret_…`). No terminal do servidor: `bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh SUPABASE_SECRET_KEY` e cole quando pedir (seção 4) | **Item mais importante agora.** Cadastro de usuários e gestão da equipe pela tela (o sistema cria a pessoa e gera o link de acesso que o gerente manda pelo WhatsApp); usuários de teste fictícios; login real de ponta a ponta (#11) |
| 1.3 | **Enviar o arquivo da Rein** (produtos, preços e estoque da Santa Cândida) | Exporte da Rein em CSV ou Excel e copie para a pasta `~/entrada/rein/` do servidor (já criada, só você e o sistema leem) (WinSCP ou `scp`, usuário `dev`, porta 22022). **Não envie pelo GitHub nem pelo chat.** Não precisa tirar nada: o arquivo de estoque não tem dados de clientes; se tiver, avise | Importador da Rein (ORA-009) e a primeira consulta de estoque real |
| 1.4 | **Dados das 11 lojas e do local DEFEITOS** (a rede tem 11 lojas comerciais; DEFEITOS é o local de itens com problema, não uma 12ª loja) | Planilha com o nome de origem, endereço, CNPJ, telefone e horário de cada loja, na mesma pasta do servidor (`~/entrada/`) | Cadastro real das lojas (ORA-ORG-001) e transferências (#60) |
| 1.5 | **Pessoal da loja piloto** | Cadastre direto na tela da equipe quando ela for publicada (nome, e-mail, lojas e função); se preferir, deixe a lista em `~/entrada/equipe/` | Usuários reais da homologação |
| 1.6 | **Aceitar o ADR-003** (catálogo e estoque) | Ler o resumo no início de `docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md` e responder "aceito" ou o que mudar. O Codex revisa a parte técnica antes | Libera usar catálogo e estoque com dados reais (no banco de desenvolvimento já começou) |

## 2. E-mails para enviar (textos prontos)

### 2.1 Nogle (API da Nogle) — destrava a P9 e as credenciais

**Para:** ti@conteltelecom.com.br · **Assunto:** Integração API NOGLE: dúvidas antes da homologação (Ora 5G)

> Olá, equipe Nogle. Somos a Ora 5G, rede de 11 lojas, e estamos integrando a API NOGLE ao nosso sistema, seguindo a documentação de docs.nogle.tech. Antes de homologar, precisamos confirmar:
> 1. Qual tipo de chave a Ora tem (franquia, marca/MVNO ou PDV) e quais funções cada tipo libera?
> 2. As consultas GET que levam dados no corpo (ex.: /linhas/detalhes, /cliente/buscar) aceitam esses dados como parâmetros no endereço?
> 3. Existe ambiente de testes? Se não, podem nos ceder uma linha e um chip de teste?
> 4. Há proteção contra pedido repetido (chave de idempotência) ou aviso automático (webhook) de ativação, recarga e portabilidade?
> 5. Qual a validade do token e o limite de chamadas por minuto?
> 6. Na recarga, o corpo é `numero` + `id_plano` (como na tabela) ou a lista `numeros` (como no exemplo)?
> 7. O exemplo de portabilidade bem-sucedida vem com `retorno: false`: é engano do exemplo?
> 8. Como pedir a troca de chip pela API?
> 9. Além de LINK e SALDO, podemos usar Pix, boleto e cartão?
> 10. O histórico de recargas não traz o id da recarga. Podemos identificar a recarga pela data de cadastro devolvida na solicitação, ou há consulta pelo id?
> 11. No eSIM, o `"esim": "SIM"` vai dentro do item de `chips`? O ICCID do eSIM sempre vem na resposta?
> 12. Quando a ativação responde só `{"mensagem": "Chip já está ativo."}`, qual é o código HTTP?
>
> Por favor, nos orientem também sobre como receber as credenciais com segurança. Obrigado!

### 2.2 Contador — destrava a P7 e a nota automática

**Assunto:** Ora 5G: emissão de notas pelo sistema próprio

> Olá. Estamos implantando um sistema próprio nas 11 lojas da Ora 5G (um CNPJ raiz com uma filial por loja) e queremos que a nota seja emitida pelo sistema, por um emissor com API, depois da aprovação do dono. Precisamos da sua orientação:
> 1. Que documento cada operação exige: venda de aparelho e acessório na loja (NFC-e ou NF-e?), venda online, assistência técnica (NFS-e?), venda de chip e recarga de celular?
> 2. Regime tributário de cada filial e o que precisamos configurar (CFOP, CST/CSOSN, NCM dos produtos).
> 3. Que emissor por API você recomenda ou já usa, e o certificado digital (A1) de cada filial está em dia?
> 4. Qual o prazo legal para emitir depois da venda, para nossa aprovação interna nunca atrasar a emissão?
>
> Podemos marcar uma conversa rápida? Obrigado!

## 3. Decisões que só você pode tomar

| # | Pergunta | Opções / observação |
|---|---|---|
| P3 | No ranking, o vendedor vê o nome dos colegas ou só a própria posição? | Hoje a demonstração mostra os dois jeitos |
| P5 | O técnico da assistência terá login próprio ou só recebe mensagens? É funcionário ou terceiro? | A demonstração tem o perfil Técnico como opção |
| P7 | Qual portal emite a nota hoje e qual tipo (NFC-e ou NF-e)? | E-mail 2.2 ao contador |
| P8 | As financeiras (PayJoy, Aiva) repassam o valor do aparelho menos a entrada, sem taxa? Em quantos dias? | Define o "a receber" do financeiro |
| P9 | Tipo da chave da Nogle (franquia, marca/MVNO ou PDV) | E-mail 2.1 à Nogle |
| P10 | Loja online: com qual CNPJ sai a nota, de onde sai o estoque, qual transportadora, qual domínio | Só para o mês 5 |
| P13 | Resumo da conversa com o ChatGPT | Salvar sem senhas nem dados de clientes |
| P14 | **Margem e desconto por categoria**: até quantos % o vendedor dá sem pedir, e a margem mínima de cada categoria (aparelhos, acessórios, chips…) | Tabela simples; sem ela o desconto real não liga (mês 2) |
| D-016 | Recarga/ativação paga pela **carteira da Ora (SALDO)** só depois de o cliente pagar o serviço no caixa? (LINK: o cliente paga direto à Nogle) | Já está assim no sistema (ADR-005), reversível |
| D-006 | O gerente aprova **toda** nota ou só exceções? Quem pediu a nota pode aprovar a própria? | Hoje: todas passam pela fila, quem pediu pode aprovar, e a aprovação nunca segura a emissão (ADR-006) |
| D-026 | **Troca e devolução:** em quantos dias o cliente pode trocar ou devolver? Que estado do aparelho é aceito? Devolve dinheiro ou só vale-troca? | O sistema já registra e controla (reembolso nos meios pagos ou vale-troca); falta a regra comercial |
| G1 | Piloto em paralelo com a Rein: 2 a 4 semanas? Quanto tempo a Rein fica ativa depois do "go" (para poder voltar)? | [Go/no-go](operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md) §5 |
| D-048 | **LGPD com o jurídico**: base legal de cada dado, por quanto tempo fica, anonimização a pedido, quem atende o titular (encarregado) e por qual canal | O relatório dos dados do titular já existe (só o dono gera, na ficha do cliente); o resto espera o jurídico |
| D-047 | **Metas de desempenho no celular**: aprovar (ou mudar) as metas propostas | [Desempenho no celular](operacao/DESEMPENHO_NO_CELULAR.md); as telas sem login estão dentro delas. Para as telas com login há proposta nova de 16/11 (abrir o PDV em até 1,5 s; buscar, adicionar e tirar em até 2 s cada; concluir a venda em até 3 s), que você confere no [roteiro de aceite do VEL-a](aceite/VEL-a.md) |
| D-049 | **Transferência:** o estoque da loja de origem sai do disponível já quando a transferência é **pedida**, ou só quando é **separada**? | **Respondida na sua orientação de 18/11** (reduzir o disponível ao colocar em transferência): desde o lote TRF-c, o pedido já reserva na origem; o envio baixa o físico uma vez. Falta só o seu aceite pelo roteiro [TRF-c](aceite/TRF-c.md) |
| G2 | Se a internet da loja cair: a venda espera ou vai para um formulário em papel? Quem atende problemas no horário da loja? | D-041 e D-042, com a proposta em [contingência e incidentes](operacao/CONTINGENCIA_E_INCIDENTES.md) |

## 4. Chaves e senhas: como gravar no servidor sem passar pelo chat

1. Pegue o valor no painel do fornecedor (coluna "Onde obter" abaixo).
2. Abra um terminal conectado ao servidor (o mesmo acesso SSH do Claude Code, usuário `dev`, porta 22022) e rode, trocando o nome:
   ```bash
   bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh NOME_DA_CHAVE
   ```
   Cole o valor quando pedir. **Ele não aparece na tela** e não fica no histórico. O comando recusa nomes fora da lista. Desde 08/11 aceita cifrão, aspas e barra invertida (testado com o leitor do Next); só recusa aspas simples junto de aspas duplas ou de barra invertida, e valor terminado em barra invertida.
   **Enquanto a homologação não for publicada de novo**, o comando fica em `~/ora5g-connect/deploy/homologacao/definir-chave.sh` (mesmo uso).
3. Para ver o que já está gravado (só "preenchida", "vazia" ou "ausente", nunca o valor):
   ```bash
   bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh --situacao
   ```
4. Avise o Claude Code ("gravei a chave X"). Ele confere pelo nome e publica de novo para valer.

Se preferir, peça ao Claude Code: ele abre o comando pronto no terminal do aplicativo e você só cola o valor.

### 4.1 Situação de cada chave na homologação (conferida em 08/11, só pelos nomes)

| Quando | Nome | Para quê | Quem fornece / onde obter | Hoje |
|---|---|---|---|---|
| Já | `APP_ENV`, `NEXT_PUBLIC_APP_URL` | Ambiente e endereço do sistema | Claude | ✅ preenchidas |
| Já | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Login | Claude (são públicas) | ✅ preenchidas |
| **Mês 1** | `SUPABASE_SECRET_KEY` | Criar e convidar usuários pelo sistema | **Você**: Supabase → Project Settings → API Keys → Secret keys | ✅ gravada em 18/11 |
| Mês 1 | `DATABASE_URL` | Scripts de banco e importações grandes, se precisar | **Você**: Supabase → botão **Connect** → **Session pooler** (porta 5432; a direta não funciona, é só IPv6) | ⬜ só quando o Claude pedir |
| Mês 1 | `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` | Criptografia de tokens, rotinas automáticas, avisos no celular | **Claude gera no servidor** quando o código usar; não depende de você | ⬜ ainda não usadas |
| Mês 1 | `WEB_PUSH_SUBJECT` | Contato dos avisos no celular | Você escolhe o e-mail (ex.: `mailto:contato@ora5g.com.br`) | ⬜ |
| Mês 2 | `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | E-mails do sistema (comprovante, nota, OS) | **Você**: caixa `nao-responda@ora5g.com.br` criada no cPanel (seção 5) | ⬜ |
| Mês 2 | `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET` | Link de pagamento PicPay | **Você**: PicPay Empresas → Integrações → Link de Pagamento → Gerar token (o segredo aparece uma vez só) | ⬜ |
| Mês 2 | `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` | Link de pagamento PagBank | **Você**: PagBank → Venda online → Integrações → Gerar token | ⬜ |
| Mês 3 | `NOGLE_API_BASE_URL` | Endereço da API da Nogle | Claude (público, está na documentação) | ⬜ |
| Mês 3 | `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY` | Ora Connect de verdade | **Você**: tipo de chave pela Nogle (P9) e a chave que vocês já têm | ⬜ a `NOGLE_ACCESS_KEY` foi gravada em 18/11; faltam o tipo (P9) e, se o tipo não for marca, a `NOGLE_SECONDARY_KEY` |
| Mês 3 | `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | WhatsApp oficial (nota, OS, avisos) | **Você**: Meta for Developers, app com WhatsApp e token de Usuário do Sistema; o token de verificação o Claude gera | ⬜ depende da verificação da empresa na Meta |
| Mês 3–4 | `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT` | Nota automática | **Você + contador**: emissor escolhido (e-mail 2.2) | 🔒 bloqueado até o contador |
| Mês 5 | `MERCADOLIVRE_APP_ID`, `MERCADOLIVRE_CLIENT_SECRET`, `MERCADOLIVRE_REDIRECT_URI`, `MERCADOLIVRE_WEBHOOK_PATH` | Mercado Livre | **Você**: app no portal de desenvolvedores do Mercado Livre | ⬜ |
| Mês 6 | `TIKTOKSHOP_APP_KEY`, `TIKTOKSHOP_APP_SECRET`, `TIKTOKSHOP_SERVICE_ID`, `TIKTOKSHOP_REDIRECT_URI` | TikTok Shop | **Você**: TikTok Shop Partner Center | ⬜ |
| Mês 6 | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_IDS`, `META_PIXEL_ID` | Resultado das campanhas | **Você**: o mesmo app Meta, com leitura de anúncios | ⬜ |
| Depois | `SHOPEE_ENVIRONMENT`, `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI` | Shopee | **Você**: Shopee Open Platform (aprovação demora) | ⬜ |
| Opcional | `SENTRY_DSN` | Aviso automático de erros | A decidir | ⬜ |
| Interno | `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY`, `NODE_OPTIONS`, `NEXT_PUBLIC_LOJA_URL`, `PORT_*`, `SUPABASE_STORAGE_BUCKET_DOCUMENTOS` | Configuração do próprio sistema | Claude | padrão ou quando o módulo existir |

Sem chave por decisão do projeto: Rein (só arquivo), PayJoy e Aiva (lançamento manual), maquininhas PicPay e PagSeguro (conferência por comprovante). Tokens de cada loja nos marketplaces ficam no banco, criptografados, e não neste arquivo. Detalhes de cada credencial: `docs/integracoes/VARIAVEIS_DE_AMBIENTE.md`.

## 5. Configurações em painéis (fora do servidor)

| # | Onde | O quê | Quando |
|---|---|---|---|
| 5.1 | **cPanel** (conta `wwora5`) | Criar a caixa `nao-responda@ora5g.com.br` (remetente dos e-mails do sistema) | Antes da recuperação de senha |
| 5.2 | **Supabase → Authentication → Emails → SMTP Settings** | Ligar o SMTP próprio com essa caixa (servidor, porta, usuário e senha **digitados por você no painel**). Na mesma área, nos modelos **Invite user** e **Reset password**, trocar o link pelo texto da seção A1 de `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md` | Antes de convidar pessoas novas e do "esqueci minha senha" (sem SMTP próprio o Supabase só manda e-mail para a equipe do projeto) |
| 5.3 | **Supabase → Authentication → URL Configuration** | **Site URL** = `https://ora5g.com.br` (a recuperação de senha e o convite já estão prontos) | Junto com o 5.2 |
| 5.4 | **WHM/DNS** | Subdomínio `hml-app.ora5g.com.br`: registro **A** para `69.6.214.94` (sem AAAA), SSL automático e encaminhamento para `127.0.0.1:3100` (ADR-001 §4A). Depois apagar o `.htaccess` da `public_html` para o domínio principal voltar ao site | Quando quiser tirar a homologação do domínio principal |
| 5.5 | **GitHub** | Proteger a `main` contra exclusão e push forçado (sem exigir PR, para não travar os merges combinados em 07/11). A auditoria do Codex de 17/11 (F07) achou a `main` sem proteção nenhuma (`protected: false`, sem rulesets). Exigir que os checks passem antes do merge também é possível, mas muda o fluxo: os merges passam a ser por PR. É decisão sua | Quando puder |
| 5.6 | **Meta Business** | Iniciar a **verificação da empresa** (WhatsApp oficial e anúncios) | Já: a aprovação demora semanas |
| 5.7 | **Mercado Livre, TikTok Shop, Shopee** | Cadastro de desenvolvedor/parceiro com a conta da empresa | Mês 1, porque a aprovação demora |
| 5.8 | **Supabase → Authentication → Attack Protection** (ou Password Security) | Ligar a proteção contra senha vazada ("Leaked password protection"): o login recusa a senha que já apareceu em vazamento. O aviso do Supabase continua acusando (auditoria do Codex de 17/11, F09). Pode exigir o plano Pro | Antes da piloto |

## 6. Para o Codex: como usar esta lista

- Pergunte ao proprietário pelos itens das seções 1 a 3 e 5 na ordem; para as chaves (seção 4), peça só a saída de `definir-chave.sh --situacao`.
- **Não peça valores**: se o proprietário colar uma chave no chat, oriente a trocar a chave no painel do fornecedor e gravar a nova pelo comando.
- Item concluído: registre aqui com a data (o Claude também atualiza ao conferir no servidor).
