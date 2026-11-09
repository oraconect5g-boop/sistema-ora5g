# O que depende do proprietário

**Atualizado em:** 08/11/2026 (noite) · **Por:** Claude Code (programador)
**Lista consolidada de APIs, acessos e habilitações (com documentação oficial e nomes das variáveis): [`docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`](integracoes/APIS_E_HABILITACOES_NECESSARIAS.md).** Esta página continua com os detalhes de cada passo.
**Para:** o proprietário e o Codex. O Codex usa esta lista para dizer ao proprietário o que falta. **Valores de chaves e senhas nunca passam pelo chat (nem do Claude nem do Codex) e nunca vão para o GitHub**: eles são gravados direto no servidor pelo comando da seção 4, ou ficam no painel do próprio fornecedor. O Codex confere só pelos **nomes**.

Tudo o que não está aqui o Claude Code faz sozinho (programação, migrations no banco de desenvolvimento, publicação na homologação depois da sua autorização, chaves geradas por nós).

---

## 1. Fazer agora (destrava o login real e o mês 1)

| # | O quê | Onde e como | Destrava |
|---|---|---|---|
| 1.1 | ~~Criar 2 usuários de teste~~ **não é mais necessário** | Com a chave do item 1.2 gravada, o Claude cria usuários de teste fictícios (e-mails `@example.com`) e você cadastra as pessoas reais pela tela da equipe | — |
| 1.2 | **Gravar a chave secreta do Supabase no servidor** | Supabase → **Project Settings → API Keys → Secret keys** → copie a chave (`sb_secret_…`). No terminal do servidor: `bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh SUPABASE_SECRET_KEY` e cole quando pedir (seção 4) | **Item mais importante agora.** Cadastro de usuários e gestão da equipe pela tela (o sistema cria a pessoa e gera o link de acesso que o gerente manda pelo WhatsApp); usuários de teste fictícios; login real de ponta a ponta (#11) |
| 1.3 | **Enviar o arquivo da Rein** (produtos, preços e estoque da Santa Cândida) | Exporte da Rein em CSV ou Excel e copie para a pasta `~/entrada/rein/` do servidor (já criada, só você e o sistema leem) (WinSCP ou `scp`, usuário `dev`, porta 22022). **Não envie pelo GitHub nem pelo chat.** Não precisa tirar nada: o arquivo de estoque não tem dados de clientes; se tiver, avise | Importador da Rein (ORA-009) e a primeira consulta de estoque real |
| 1.4 | **Lista das 14 lojas** | Planilha com nome, endereço, CNPJ de cada filial, telefone e horário, na mesma pasta do servidor (`~/entrada/`) | Cadastro real das lojas (ORA-ORG-001) |
| 1.5 | **Pessoal da loja piloto** | Cadastre direto na tela da equipe quando ela for publicada (nome, e-mail, lojas e função); se preferir, deixe a lista em `~/entrada/equipe/` | Usuários reais da homologação |
| 1.6 | **Aceitar o ADR-003** (catálogo e estoque) | Ler o resumo no início de `docs/adr/ADR-003-catalogo-estoque-e-operacao-comercial.md` e responder "aceito" ou o que mudar. O Codex revisa a parte técnica antes | Libera usar catálogo e estoque com dados reais (no banco de desenvolvimento já começou) |

## 2. E-mails para enviar (textos prontos)

### 2.1 Contel (API da Nogle) — destrava a P9 e as credenciais

**Para:** ti@conteltelecom.com.br · **Assunto:** Integração API NOGLE: dúvidas antes da homologação (Ora 5G)

> Olá, equipe Contel. Somos a Ora 5G, rede de 14 lojas, e estamos integrando a API NOGLE ao nosso sistema, seguindo a documentação de docs.nogle.tech. Antes de homologar, precisamos confirmar:
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

> Olá. Estamos implantando um sistema próprio nas 14 lojas da Ora 5G (um CNPJ raiz com uma filial por loja) e queremos que a nota seja emitida pelo sistema, por um emissor com API, depois da aprovação do dono. Precisamos da sua orientação:
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
| P9 | Tipo da chave da Nogle (franquia, marca/MVNO ou PDV) | E-mail 2.1 à Contel |
| P10 | Loja online: com qual CNPJ sai a nota, de onde sai o estoque, qual transportadora, qual domínio | Só para o mês 5 |
| P13 | Resumo da conversa com o ChatGPT | Salvar sem senhas nem dados de clientes |
| P14 | **Margem e desconto por categoria**: até quantos % o vendedor dá sem pedir, e a margem mínima de cada categoria (aparelhos, acessórios, chips…) | Tabela simples; sem ela o desconto real não liga (mês 2) |
| D-016 | Recarga/ativação paga pela **carteira da Ora (SALDO)** só depois de o cliente pagar o serviço no caixa? (LINK: o cliente paga direto à Contel) | Já está assim no sistema (ADR-005), reversível |
| D-006 | O gerente aprova **toda** nota ou só exceções? Quem pediu a nota pode aprovar a própria? | Hoje: todas passam pela fila, quem pediu pode aprovar, e a aprovação nunca segura a emissão (ADR-006) |
| G1 | Piloto em paralelo com a Rein: 2 a 4 semanas? Quanto tempo a Rein fica ativa depois do "go" (para poder voltar)? | [Go/no-go](operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md) §5 |
| G2 | Se a internet da loja cair: a venda espera ou vai para um formulário em papel? Quem atende problemas no horário da loja? | Idem |

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
| **Mês 1** | `SUPABASE_SECRET_KEY` | Criar e convidar usuários pelo sistema | **Você**: Supabase → Project Settings → API Keys → Secret keys | ⬜ falta (item 1.2) |
| Mês 1 | `DATABASE_URL` | Scripts de banco e importações grandes, se precisar | **Você**: Supabase → botão **Connect** → **Session pooler** (porta 5432; a direta não funciona, é só IPv6) | ⬜ só quando o Claude pedir |
| Mês 1 | `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` | Criptografia de tokens, rotinas automáticas, avisos no celular | **Claude gera no servidor** quando o código usar; não depende de você | ⬜ ainda não usadas |
| Mês 1 | `WEB_PUSH_SUBJECT` | Contato dos avisos no celular | Você escolhe o e-mail (ex.: `mailto:contato@ora5g.com.br`) | ⬜ |
| Mês 2 | `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | E-mails do sistema (comprovante, nota, OS) | **Você**: caixa `nao-responda@ora5g.com.br` criada no cPanel (seção 5) | ⬜ |
| Mês 2 | `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET` | Link de pagamento PicPay | **Você**: PicPay Empresas → Integrações → Link de Pagamento → Gerar token (o segredo aparece uma vez só) | ⬜ |
| Mês 2 | `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` | Link de pagamento PagBank | **Você**: PagBank → Venda online → Integrações → Gerar token | ⬜ |
| Mês 3 | `NOGLE_API_BASE_URL` | Endereço da API da Contel | Claude (público, está na documentação) | ⬜ |
| Mês 3 | `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY` | Ora Connect de verdade | **Você**: tipo de chave pela Contel (P9) e a chave que vocês já têm | ⬜ depende da P9 |
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
| 5.5 | **GitHub** | Proteger a `main` contra exclusão e push forçado (sem exigir PR, para não travar os merges combinados em 07/11) | Quando puder |
| 5.6 | **Meta Business** | Iniciar a **verificação da empresa** (WhatsApp oficial e anúncios) | Já: a aprovação demora semanas |
| 5.7 | **Mercado Livre, TikTok Shop, Shopee** | Cadastro de desenvolvedor/parceiro com a conta da empresa | Mês 1, porque a aprovação demora |

## 6. Para o Codex: como usar esta lista

- Pergunte ao proprietário pelos itens das seções 1 a 3 e 5 na ordem; para as chaves (seção 4), peça só a saída de `definir-chave.sh --situacao`.
- **Não peça valores**: se o proprietário colar uma chave no chat, oriente a trocar a chave no painel do fornecedor e gravar a nova pelo comando.
- Item concluído: registre aqui com a data (o Claude também atualiza ao conferir no servidor).
