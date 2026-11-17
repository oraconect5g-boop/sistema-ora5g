# APIs, acessos e habilitações necessárias

**Atualizado em:** 17/11/2026 (A19: a lista única de dependências por integração, com a situação conferida no servidor em 17/11) · **Por:** Claude Code (programador) · **Revisor:** Codex · **Para:** o proprietário
**Base:** decisões DEC-U19 a DEC-U49, ADR-001 a ADR-003, `docs/10_DECISOES_PENDENTES.md`, `docs/PENDENCIAS_DO_PROPRIETARIO.md`, `.env.example` e a documentação oficial de cada fornecedor (links abaixo).

**Regras desta lista**
- Aqui só aparecem **nomes** de variáveis. Valores de chaves, senhas, tokens e certificados **nunca** passam pelo chat (Claude ou Codex), pelo GitHub nem por log. Cada valor é gravado direto no servidor com `bash ~/ora5g-connect/deploy/homologacao/definir-chave.sh NOME` (a tela não mostra o que é digitado; depois da próxima publicação o mesmo comando também fica em `~/homologacao/plataforma/deploy/homologacao/`); o Codex confere só com `definir-chave.sh --situacao`.
- Chaves internas (criptografia `APP_ENCRYPTION_KEY`, rotinas `CRON_SECRET`, avisos no celular `WEB_PUSH_*`, token de verificação de webhooks): **o Claude gera no servidor**, sem que o valor passe por você ou pelo chat, mas **só com a sua autorização para cada uma**, porque são credenciais (plano de 16/11, §3). A primeira a pedir é o par `WEB_PUSH_*`, dos avisos no celular.
- Rein: **só arquivo**, nunca API. Maquininhas PicPay/PagSeguro e financeiras PayJoy/Aiva: **registro operacional e conferência manual** (DEC-U28, DEC-U29). Automatizar esses meios exige contrato oficial e fica separado.
- Situação do contrato de cada API: ✅ confirmado na documentação oficial · 🟡 parcialmente confirmado · ⬜ pendente (falta conta, escolha ou resposta) · 🔒 bloqueado por decisão.
- Situação da implementação: **funciona** (testado) · **pronto aguardando acesso** · **a desenvolver**.


## A lista única: cada integração, o que já existe, o que falta e o que você entrega (17/11)

Esta tabela é o resumo de tudo o que depende de fora (aceite A19 do adendo do Codex de 16/11). O detalhe de cada uma fica nas seções A, B e C, mais abaixo. **Conferido no servidor em 17/11, só pelos nomes:** nenhuma das chaves de fora está gravada (Supabase secreta, e-mail, avisos no celular, Nogle, fiscal), e as pastas de entrada (`rein`, `lojas`, `fotos`) estão vazias.

| Integração | Requisitos | O que já existe no sistema | O que falta no código | O que você entrega | Situação |
|---|---|---|---|---|---|
| **Supabase: login, banco e arquivos** (A1) | ORA-ORG-001 a 010; a jornada com login (J1) | Banco com RLS e auditoria, login, sessão por turno, tela da equipe, fotos e documentos em armazenamento privado, rotinas no próprio banco | O convite de gente nova e o "esqueci minha senha" de ponta a ponta; as contas de teste e a jornada autenticada no celular | A `SUPABASE_SECRET_KEY` gravada no servidor; o e-mail de envio (SMTP) e os dois modelos de e-mail; para a produção, outro projeto com backup | Pronto, aguardando a chave |
| **Nogle / Ora Connect** (A2; C1, C2) | ORA-CONNECT-003, 007, 008, 009 e 011 | Adaptador, programa de envio, ativação, recarga e portabilidade com registro local, evidência e reconsulta | A operação real, a carteira, o extrato, a recorrência e os repasses | O tipo da chave (P9), as três chaves no servidor e uma linha e um chip de teste | Bloqueado: sem a chave |
| **Emissor fiscal** (A4; D1) | ORA-FISC-003 a 010 | Fila com aprovação que não segura a emissão, registro da nota pela chave, PDF e XML guardados, cancelamento, carta de correção e conciliação | A emissão por API, o documento por operação e por UF e a contingência | O contador, o emissor contratado e o certificado | Bloqueado: sem o emissor |
| **WhatsApp oficial** (B; F1) | ORA-WHATS-001 a 008, ORA-OS-005, ORA-CRM-007 e o contato do WhatsApp do ORA-META-002 | A fila da nota, com estados e sem envio duplicado; o programa que lê a fila (WHATS-a), desligado | A ligação com a Meta, o aviso de volta assinado, os modelos de mensagem e a caixa de entrada | A verificação da empresa na Meta, o número, o token e um modelo de mensagem de utilidade aprovado | Bloqueado: espera a Meta |
| **Link de pagamento e Pix online** (A3; E1) | ORA-PAY-008, ORA-PAY-013, ORA-PAY-014, ORA-POS-009 e o pagamento do ORA-ONLINE-002 | O meio "link" é recusado de propósito: nada fica "pago" sem o provedor | A cobrança, o aviso de volta assinado e a reconsulta | A escolha entre PicPay, PagBank ou os dois, e a credencial do escolhido | Aguardando a escolha |
| **PayJoy e Aiva** (E2) | ORA-POS-013, ORA-PAY-002, ORA-PAY-011 e o vencimento do ORA-FIN-003 | O registro da venda financiada e o a receber de cada financeira | A integração (se houver contrato), o repasse, a taxa e o prazo | O contrato e a documentação de cada uma, e o valor e o prazo do repasse (P8) | Bloqueado: sem contrato |
| **Extratos das maquininhas e do banco** (E3) | ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006 | A conciliação manual dos pagamentos | O importador do extrato por arquivo e a conciliação das taxas | Um extrato real de cada maquininha e do banco, como arquivo, no servidor | Aguardando o arquivo |
| **Avisos no celular (Web Push)** | O item 7 da onda 1 do plano ("o dono aprova em um toque") e o aviso fora da tela do ORA-QUAL-006 | O site instalável (PWA-a): o ícone, a abertura em tela cheia e a página sem internet | Desde 17/11 (PWA-b): a inscrição de cada celular, a fila no banco e o programa de envio (o worker dos avisos, sem a chave secreta do Supabase) | O agendamento do worker dos avisos e o aviso quando uma fila passa do limite | As chaves foram geradas no servidor em 17/11, com a sua autorização; falta só autorizar o agendamento do worker (a cada minuto) | Pronto, aguardando o agendamento |
| **Logística da loja online** (B) | O frete e a entrega do ORA-ONLINE-004 | A retirada na loja, com a reserva de 24 horas (ONLINE-b) e a origem da reserva (MKT-a) | O frete, a etiqueta e o rastreio | As decisões P10 e D-025 (o CNPJ da nota online, de onde sai o estoque, a transportadora) | Bloqueado por decisão |
| **Meta Ads** (C) | ORA-META-001 e 003 a 006 | A origem e a campanha (UTM) da reserva do site, sem precisar da API da Meta (MKT-a) | O gasto e os resultados dos anúncios, vindos da Meta | A mesma verificação da empresa do WhatsApp e o acesso à conta de anúncios | Não iniciado |
| **Mercado Livre, Shopee e TikTok Shop** (B e C) | ORA-MKTPL-001 a 008 | Os códigos de outros canais em cada variação do produto | Tudo | As contas de desenvolvedor e os contratos | Não iniciado |

---

## O que você precisa providenciar, em ordem

| # | O quê | Destrava | Como (canal oficial) |
|---|---|---|---|
| 1 | Gravar `SUPABASE_SECRET_KEY` no servidor (**17/11: ainda ausente**) | Convites da tela da equipe (o worker cria a pessoa no Auth); usuários de teste fictícios criados pelo Claude; login real de ponta a ponta (#11) | Supabase → projeto `ora5g-dev` → Project Settings → API Keys → Secret keys. Gravar com `definir-chave.sh SUPABASE_SECRET_KEY`. **Substitui o item 1.1 antigo** (criar usuários de teste à mão deixa de ser necessário). **Conferido em 14/11 (só os nomes):** ainda ausente no ambiente da homologação e no do worker; sem ela, a J1 (contas fictícias do dono, do gerente e do vendedor, já autorizadas) e os convites da tela da equipe não andam. No mesmo exame: o Auth do `ora5g-dev` aceita cadastro aberto; desligar "Allow new users to sign up" (os convites continuam funcionando) |
| 2 | Enviar o **arquivo da Rein** (produtos, preços, estoque da Santa Cândida) (**17/11: a pasta está vazia**) | Importador e estoque real do piloto. O importador já lê a planilha inteira, com mais de 2.000 linhas e a linha de total (lote REIN-a) | Exportar da Rein (CSV/Excel) e copiar para `~/entrada/rein/` no servidor (WinSCP, usuário `dev`, porta 22022). A pasta já existe, só você e o sistema a leem |
| 3 | E-mail ao suporte da **Nogle** (texto pronto em `PENDENCIAS_DO_PROPRIETARIO.md` §2.1) e depois gravar `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY` | Ora Connect real (ativação, recarga, portabilidade) | ti@conteltelecom.com.br. A resposta define o tipo de chave (P9) e as dúvidas da seção A2 |
| 4 | Escolher o **link de pagamento**: PicPay, PagBank ou os dois | Pagamento online/à distância confirmado pelo provedor | Seção A3. Depois gerar as credenciais no painel do escolhido |
| 5 | E-mail ao **contador** (texto pronto em `PENDENCIAS_DO_PROPRIETARIO.md` §2.2) e escolha do **emissor fiscal por API** com ele | Nota automática; condição para sair da Rein | Seção A4 |
| 2b | Caixa `nao-responda@ora5g.com.br` no cPanel, SMTP no painel do Supabase e os **dois modelos de e-mail** da seção A1 | Convite de pessoas novas pela tela da equipe e "esqueci minha senha" | Seção A1. Sem isso, a tela da equipe já dá e tira acessos de quem tem conta, mas o convite de gente nova fica com erro de envio |
| 2c | ~~Autorizar as chaves dos avisos no celular~~ (**feito em 17/11**). Falta **autorizar o agendamento** do worker dos avisos (a cada minuto, pelo crontab do servidor) | O aviso no celular do desconto, da nota e da saída de caixa a aprovar (lote PWA-b) | Responder "autorizo o agendamento" |
| 2d | Os dados das lojas: **CNPJ da filial**, endereço, telefone e horário de cada uma, e a confirmação dos nomes "Muffato Santa" e "Balneário" | As 11 lojas e o DEFEITOS estão cadastrados desde 17/11 (lote ORG-a), mas a loja sem o CNPJ da filial não vende: o banco recusa | Pela tela **Lojas**, ou num arquivo em `~/entrada/lojas/` |
| 7 | Iniciar já as aprovações demoradas: verificação da empresa na **Meta**, contas de desenvolvedor no **Mercado Livre** e no **TikTok Shop** | Expansão (meses 5 e 6) | Seção B |

---

## A. Núcleo do piloto (meses 1 a 4)

### A1. Supabase — banco, login, arquivos (Auth, Storage)

| Item | Detalhe |
|---|---|
| Prioridade | Núcleo/piloto |
| Funções e requisitos | Login, escolha da loja, sessão por turno, bloqueio (ORA-ORG-001 a 010); cadastro de usuários e gestão da equipe; fotos dos produtos (ORA-CAT-011); banco de todo o sistema |
| Fornecedor | Supabase, projeto `ora5g-dev` (desenvolvimento e homologação, só dados fictícios). Produção exigirá **outro projeto** (ver "Dependências que não são APIs") |
| Documentação | ✅ [Admin API de usuários](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [links gerados pelo servidor](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [login no servidor (SSR)](https://supabase.com/docs/guides/auth/server-side), [SMTP próprio](https://supabase.com/docs/guides/auth/auth-smtp), [Storage: controle de acesso](https://supabase.com/docs/guides/storage/security/access-control) |
| Recursos usados | Auth (senha), Admin API (criar usuário, link de acesso, bloquear), banco PostgreSQL com RLS, Storage com bucket privado |
| Autenticação e variáveis | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (públicas, já gravadas); `SUPABASE_SECRET_KEY` (falta; gravada no servidor e entregue **só ao worker** de identidade, nunca ao aplicativo web que atende as pessoas, ADR-002 §2.5; conferido em teste de publicação isolado); `DATABASE_URL` (só se o Claude pedir, para cargas grandes) |
| Como obter | Secret key: Project Settings → API Keys → Secret keys (verificado). `DATABASE_URL`: botão Connect → **Session pooler**, porta 5432 (a conexão direta é só IPv6 e o servidor é IPv4, ADR-001) |
| Teste | O próprio `ora5g-dev`, com dados fictícios. Usuários de teste com e-mails `@example.com`, criados pelo Claude depois da secret key |
| Endereços de retorno | Em Authentication → URL Configuration: **Site URL** = `https://ora5g.com.br`. Em Authentication → Emails, troque o link de dois modelos (o resto do texto pode ficar): **Invite user** → `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite` e **Reset password** → `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery`. Assim o link funciona em qualquer celular (não depende do navegador que pediu). Quando o subdomínio `hml-app` existir, só o Site URL muda |
| SMTP (configuração de envio, não é API comercial) | Caixa `nao-responda@ora5g.com.br` (cPanel) e Authentication → Emails → SMTP Settings, preenchidos **por você no painel**. Sem SMTP próprio o Supabase envia pouquíssimos e-mails por hora. Variáveis da aplicação para comprovantes: `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |
| Eventos e reconciliação | Não há webhook externo. Bloqueio vale na hora no banco (RLS recusa usuário bloqueado); o Auth também é bloqueado para impedir novo login |
| Situação | **Funciona (testado em desenvolvimento):** banco, RLS, auditoria, catálogo, estoque com integridade e concorrência, login SSR com o par público, escolha da loja, sessão por turno, bloqueio e encerramento de acesso imediatos, tela da equipe. **Pronto aguardando acesso:** convite que cria a pessoa e manda o e-mail (worker: precisa da secret key, do SMTP e dos dois modelos acima) e o "esqueci minha senha" (SMTP e modelo). **Feito depois:** o armazenamento privado das fotos e dos documentos (por migration, sem depender de você); falta a primeira foto real enviada (ORA-CAT-011, #26) |

### A2. Nogle / Nogle — Ora Connect (chips, ativação, recarga, portabilidade)

| Item | Detalhe |
|---|---|
| Prioridade | Núcleo/piloto (mês 3) |
| Funções e requisitos | Venda de chip físico/eSIM, ativação, consulta de linha/plano/saldo/consumo, recarga, portabilidade, carteira e repasses (ORA-CONNECT-001 a 011) |
| Fornecedor | Nogle, API oficial (contratada; a chave já existe). A documentação oficial é publicada em nome da Contel Telecom, e o endereço da API é o dela: não é outro fornecedor |
| Documentação | 🟡 [docs.nogle.tech](https://docs.nogle.tech/), lida por inteiro em 07/11 (62 funções; cópia com SHA-256 conferido no repositório). Confirmado: endereço `https://api.conteltelecom.com.br`, login `POST /auth/token` com token temporário, pagamento `LINK` ou `SALDO`. **Não documentado:** ambiente de testes, validade do token, limites, idempotência, webhooks; 25 consultas GET levam corpo; exemplo de portabilidade contraditório; formato da recarga ambíguo |
| Permissões do tipo de conta | Franquia, marca/MVNO ou PDV (P9). A documentação não diz o que cada tipo libera: perguntado no e-mail à Nogle |
| Autenticação e variáveis | `NOGLE_API_BASE_URL` (pública, o Claude grava), `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY` (`chave_acesso_franquia` ou `chave_acesso_pdv`; vazia para marca/MVNO). Só no **worker** do servidor (ADR-005); nem o navegador nem o servidor web veem. Controles sem segredo, gravados pelo Claude depois da homologação: `NOGLE_OPERACOES_HABILITADAS`, `NOGLE_GET_COM_CORPO`, `ORA_ORGANIZACAO_ID`, `CONNECT_UFS` |
| Como obter | Pelo suporte técnico da API da Nogle (ti@conteltelecom.com.br, o endereço indicado na documentação oficial), pedindo também o canal seguro de entrega. **Hipótese:** a chave atual é de franquia ou PDV; não usar até a Contel confirmar |
| Teste | Sem sandbox documentado: pedir à Nogle um ambiente de teste ou **uma linha e um chip de teste** autorizados. Nenhuma ativação, recarga ou portabilidade real sem essa autorização |
| Webhooks | Nenhum documentado. O sistema usa **reconsulta** periódica do estado (ativação, portabilidade, recarga) e não reenvia operação de resultado desconhecido |
| Idempotência e reconciliação | Cada operação vira registro persistente com estado (solicitada → enviada → confirmada/recusada/desconhecida) e chave própria; antes de repetir, consulta. Relatórios da Nogle (`/relatorios/*`, `/saldo/extrato`) conciliam produção e carteira |
| Situação | **Feito em desenvolvimento (ADR-005, sem chamada real):** operações persistentes (ativação, recarga, portabilidade) com estados, evidência, produção única e resultado desconhecido com a gerência; worker com token, envio, consulta e listas oficiais; ponta a ponta contra servidor local com os exemplos oficiais. **Aguardando acesso:** credenciais no worker, P9, respostas às perguntas 2, 6, 7, 10, 11 e 12 e uma linha/chip de teste para homologar |

### A3. Link de pagamento e Pix online

| Item | Detalhe |
|---|---|
| Prioridade | Núcleo/piloto (mês 2) |
| Funções e requisitos | Venda à distância e online, recarga paga por link, recebimento confirmado pelo provedor (ORA-PAY, ORA-ONLINE) |
| Fornecedor | **Escolha necessária** (DEC-U28 previu link de pagamento; a empresa já usa maquininhas PicPay e PagSeguro). Candidatos já mapeados: **PicPay Link de Pagamento** e **PagBank** (link/checkout) |
| Documentação | 🟡 PicPay: [Link de Pagamento](https://developers-business.picpay.com/payment-link/en/docs/introduction) (cartão, Pix e carteira PicPay), [autenticação](https://developers-business.picpay.com/payment-link/en/docs/authentication), [webhook](https://developers-business.picpay.com/payment-link/en/docs/webhook): existe aviso de mudança de situação; formato e assinatura do aviso a confirmar ao gerar a credencial. 🟡 PagBank: [token](https://developer.pagbank.com.br/docs/token-de-autenticacao) e [criação de checkout](https://developer.pagbank.com.br/v1/reference/checkout-pagseguro-criacao-checkout-pagseguro); formato atual do aviso de pagamento a confirmar no portal |
| Autenticação e variáveis | PicPay: `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET`. PagBank: `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` |
| Como obter | PicPay Empresas → Integrações → Link de Pagamento → Gerar token (o segredo aparece uma vez). PagBank → Venda online → Integrações → Gerar token; sandbox no Portal do Desenvolvedor |
| Teste | Sandbox do PagBank; PicPay a confirmar no painel. Nenhuma cobrança real sem sua autorização |
| Webhooks | Rota a criar: `https://<domínio>/api/webhooks/pagamentos/<provedor>`. Regras: conferir a origem (assinatura/segredo do provedor), gravar o aviso antes de processar, ignorar repetido, aceitar fora de ordem, **reconsultar o provedor** antes de marcar pago |
| Idempotência e reconciliação | Um pedido de cobrança por pagamento, com chave própria; tempo esgotado com resultado desconhecido gera reconsulta, nunca nova cobrança. Pago só com confirmação do provedor, nunca pelo retorno do navegador. Conciliação com o extrato do provedor |
| Situação | **A desenvolver:** contrato do adaptador, estados e testes com avisos simulados (sem credencial). **Aguardando:** sua escolha e as credenciais |
| Pix na loja | Pix na maquininha e Pix direto na conta: registro do comprovante e conferência pelo extrato (manual). Automatizar o Pix direto exige a API Pix do banco (certificado próprio) ou um intermediário: decisão D-011, posterior |

### A4. Emissor fiscal por API

| Item | Detalhe |
|---|---|
| Prioridade | Núcleo; condição para desligar a Rein (meses 3–4) |
| Funções e requisitos | Fila de notas, aprovação interna sem atrasar o prazo legal, emissão, consulta, cancelamento/correção, envio por e-mail ou WhatsApp (ORA-FISC-001 a 010; DEC-U20, U22, U39) |
| Fornecedor | **Escolha necessária, com o contador.** Hoje o dono emite manualmente num portal (P7). Não há emissor contratado |
| O que já funciona sem emissor (14/11) | Fila com aprovação que não segura a emissão; registro da nota pela chave de acesso (dígito e CNPJ conferidos); destinatário completo no pedido e "Dados para emitir" para quem digita no portal (K1b); PDF e XML da nota emitida guardados em privado, com a chave do XML conferida, SHA-256 e o protocolo (L10a). Com o emissor, a emissão, o XML e o protocolo passam a vir dele, pelo mesmo registro |
| Documentação | 🔒 Depende do emissor escolhido. Nada é implementado contra API de fornecedor não escolhido |
| O que o contador define | Documento de cada operação (NFC-e, NF-e, NFS-e; chip, recarga e o conserto da OS cobrado no PDV, L12c), regime de cada filial, CFOP/CST/CSOSN/NCM, prazo entre venda e emissão |
| Autenticação e variáveis | `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT`. **Certificado A1** (e-CNPJ) fica com o emissor ou no cofre de segredos, nunca em arquivo do projeto. **Hipótese a confirmar com o contador:** o certificado da matriz atende às filiais |
| Teste | Ambiente de homologação da SEFAZ pelo emissor |
| Webhooks | Conforme o emissor: aviso de autorização/rejeição com conferência de origem e reconsulta |
| Situação | **A desenvolver agora (sem fornecedor):** fila fiscal interna, estados, solicitação a partir da venda e contrato do adaptador. **Bloqueado:** emissão real |

---

## B. Expansão (meses 5 e 6)

| Integração | Funções / requisitos | Contrato | Variáveis (nomes) | Como obter | Webhook / eventos | Situação |
|---|---|---|---|---|---|---|
| **WhatsApp oficial** (Cloud API) | Envio de nota, OS, orçamento, avisos; atendimento (ORA-WHATS) | ⬜ [Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) consultada em 06/11; reconfirmar | `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (o Claude gera este) | Meta for Developers: app com WhatsApp, **verificação da empresa**, número habilitado, token permanente de Usuário do Sistema | `/api/webhooks/whatsapp`; assinatura do aviso com o segredo do app; mensagens repetidas ignoradas | Até lá: botão "enviar pelo WhatsApp" que abre a conversa pronta, sem automação. **Prioridade de 14/11 (#76):** o envio da nota ao cliente pelo WhatsApp oficial veio para antes do atendimento; o documento já fica guardado (L10a) e a fila de envio com o adaptador, os estados e a idempotência entra no K1c. Para ligar: número habilitado, token, segredo do app e um **modelo (template) de utilidade aprovado** para mandar o documento fora da janela de 24 horas; a fila nunca marca "enviado" sem a resposta da Meta |
| **Mercado Livre** | Anúncios, estoque e pedidos (ORA-MKTPL) | ⬜ [autenticação](https://developers.mercadolivre.com.br/pt-br/autenticacao-e-autorizacao) consultada em 06/11 | `MERCADOLIVRE_APP_ID`, `MERCADOLIVRE_CLIENT_SECRET`, `MERCADOLIVRE_REDIRECT_URI`, `MERCADOLIVRE_WEBHOOK_PATH` | App no portal de desenvolvedores com a conta vendedora; endereço de retorno idêntico ao cadastrado | `/api/webhooks/mercadolivre`; reconsultar o recurso avisado; token de 6 h renovado e guardado criptografado no banco | A desenvolver no mês 5 |
| **TikTok Shop** | Catálogo, estoque e pedidos | ⬜ [Partner Center](https://partner.tiktokshop.com/doc), detalhes a confirmar | `TIKTOKSHOP_APP_KEY`, `TIKTOKSHOP_APP_SECRET`, `TIKTOKSHOP_SERVICE_ID`, `TIKTOKSHOP_REDIRECT_URI` | Cadastro no Partner Center; cada loja autoriza o app | Conforme o Partner Center (assinatura a confirmar) | A desenvolver no mês 6 |
| **Logística da loja online** | Frete, etiqueta, rastreio (ORA-ONLINE) | 🔒 Sem escolha (P10: CNPJ da nota online, origem do estoque, transportadora, domínio) | A definir com a escolha | Contrato com a transportadora ou intermediador escolhido | A definir | Retirada na loja primeiro; frete depois da P10 |

## C. Posterior ou condicional

| Integração | Quando | Observação |
|---|---|---|
| **Shopee** | Depois do mês 6 | `SHOPEE_ENVIRONMENT`, `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI`; aprovação de parceiro demora: pode iniciar o cadastro antes |
| **Meta Ads (atribuição)** | Depois do mês 6 | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_IDS`, `META_PIXEL_ID`; usa a mesma verificação da empresa do WhatsApp |
| **IA (atendimento e análises)** | Depois do núcleo estável | Fornecedor e orçamento a decidir (D-030). Nunca autoriza pagamento, desconto, crédito, nota ou ativação sozinha |
| **Monitoramento de erros** | Opcional | `SENTRY_DSN` ou equivalente; decidir antes da produção |
| **Pix automático pelo banco** | Condicional (D-011) | API Pix do banco com certificado, ou intermediário; até lá, conferência pelo extrato |
| **Assinatura digital de contratos** | Condicional | Fornecedor a escolher (com validade jurídica e custo por assinatura); até lá, o contrato e o termo assinados em papel são fotografados e guardados na própria venda, em privado (L5d, ORA-CRM-008) |
| **Maquininhas e financeiras por API** | Condicional | PicPay POS, PagSeguro, PayJoy, Aiva: só com contrato oficial de integração; hoje registro e conferência manual |

---

## Dependências que não são APIs

| O quê | Para quê | Situação |
|---|---|---|
| Arquivo da Rein (produtos, preços, estoque da Santa Cândida) | Importação e conferência do piloto, e a carga do estoque de cada loja com a data de corte | Não recebido (17/11: a pasta `~/entrada/rein/` está vazia). O importador já lê a planilha inteira (REIN-a) |
| Lojas: CNPJ da filial, endereço, telefone, horário | Liberar cada loja para vender | As 11 lojas e o DEFEITOS estão cadastrados desde 17/11 (ORG-a), sem CNPJ: o banco não deixa vender em loja sem o CNPJ da filial. Faltam os dados e a confirmação dos nomes "Muffato Santa" e "Balneário". Pasta `~/entrada/lojas/` (vazia em 17/11) ou a tela Lojas |
| Pessoas autorizadas no piloto (nome, e-mail, loja, função) | Podem ser cadastradas por você ou pelo gerente na **tela da equipe**, assim que a secret key estiver gravada | A tela existe; o convite de gente nova espera a secret key e o e-mail de envio |
| Fotos dos produtos (ORA-CAT-011) | Foto de cada produto e de cada variante com cor/acabamento diferente | O envio pelo celular existe, uma a uma e em lote. Falta a primeira foto real enviada. Se já tiver fotos, `~/entrada/fotos/` com o SKU no nome do arquivo (vazia em 17/11) |
| Política de desconto por categoria (P14) e quem aprova acima do limite | Desconto real no PDV | Pendente |
| Decisão P5: o técnico da assistência terá login próprio? | O técnico registrar no próprio celular o recebimento e a devolução (e, no L12b, o orçamento) e receber os avisos da OS (ORA-OS-001, ORA-OS-003, ORA-OS-005) | Pendente; até lá a gerência registra em nome dele, dizendo como ele confirmou (já funciona, L12a) |
| Repasses PayJoy/Aiva: valor e prazo (P8) (também o vencimento e a idade das contas a receber, ORA-FIN-003) | Contas a receber da financeira e a data prevista nos recebíveis (`/pagamentos/recebiveis`, ORA-FIN-005: hoje só a idade desde a venda e a diferença que o extrato mostrou) | Pendente; nada de taxa ou prazo inventado |
| Definições fiscais e certificado (P7, contador) | Nota automática | Pendente |
| Aceite do ADR-003 (catálogo e estoque) e das Q1–Q4 | Usar catálogo e estoque com dados reais | Pendente |
| Projeto Supabase de **produção** (plano com backup diário e restauração testada) | Operação real | Decidir antes do go-live do piloto (D-027); o Claude prepara o procedimento |
| Aceite de produção e go/no-go da loja piloto | Operação real, corte da Rein, expansão | Só com evidências do piloto paralelo (2 a 4 semanas) |

O que **não** precisa: API da Rein; senha de ninguém no chat; certificado ou base de clientes no GitHub; contratar serviço pago sem orçamento aprovado.
