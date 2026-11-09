# Variáveis de ambiente e credenciais — Ora 5G Platform

**Data:** 06/11/2026 · **Autor:** Claude Code · **Revisor esperado:** Codex + proprietário
**Arquivo modelo:** `.env.example` (raiz do repositório)
**Status:** proposta. **O que falta e como gravar sem passar pelo chat: `docs/PENDENCIAS_DO_PROPRIETARIO.md` (seção 4).** Nomes de variáveis são nossos; os **tipos de credencial** foram conferidos na documentação de cada plataforma na data acima. Itens "a confirmar" serão revalidados no momento da integração.

---

## 1. Regras de ouro

1. **Nenhum valor real entra no Git, no chat, em print ou em log.** O `.env.example` só tem nomes.
2. **Cada ambiente tem suas próprias chaves:** desenvolvimento, homologação e produção nunca compartilham credenciais.
3. **`NEXT_PUBLIC_` vai para o navegador.** Só endereços e chaves públicas usam esse prefixo.
4. **Credenciais do aplicativo ficam no `.env`; tokens de cada loja/conta ficam no banco, criptografados** com `APP_ENCRYPTION_KEY`. Motivo: Mercado Livre, Shopee e TikTok Shop entregam tokens que **vencem em horas** e são renovados automaticamente. Se ficassem no `.env`, o sistema pararia a cada vencimento.
5. **O sistema confere na inicialização** se as variáveis obrigatórias existem e recusa subir com configuração incompleta. Integração sem credencial aparece como **"desligada"** no painel — nunca finge funcionar.
6. **Troca de chave (rotação)** documentada: se uma chave vazar, troca-se no painel do fornecedor e no servidor, sem mudar código.

---

## 2. Tabela de credenciais

| # | Grupo | Variáveis | O que é / onde se obtém | Quem providencia | Status |
|---|---|---|---|---|---|
| 1 | Aplicação | `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY` | Configuração geral | Claude/Codex | Pronto para usar |
| 1 | Aplicação | `APP_ENCRYPTION_KEY` | Chave aleatória gerada por nós (`openssl rand -base64 32`), uma por ambiente | Administrador, no servidor | Pronto para usar |
| 1 | Aplicação | `CRON_SECRET` | Senha aleatória das rotinas automáticas | Administrador | Pronto para usar |
| 2 | Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` | Painel do projeto Supabase → configurações de API e banco. **`DATABASE_URL` deve ser a do pooler compartilhado em modo sessão (porta 5432)**, porque a conexão direta é só IPv6 e o servidor é só IPv4 (ADR-001) | Proprietário cria o projeto; Claude configura | Projeto `ora5g-dev` criado em 07/11; endereço e chave pública configurados. Chave secreta e `DATABASE_URL` pendentes: ver `docs/PENDENCIAS_DO_PROPRIETARIO.md` |
| 3 | E-mail | `EMAIL_FROM`, `SMTP_*` | Servidor de e-mail do domínio `ora5g.com.br` (HostGator) ou serviço de envio transacional | Proprietário | A definir |
| 4 | Notificação no celular | `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Par de chaves gerado por nós | Claude/Codex | Pronto para usar |
| 5 | Nogle | `NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY` | Documentação oficial: login `POST /auth/token` com chave do tipo **franquia, marca/MVNO ou PDV**; devolve token temporário. Só no ambiente do **worker** (ADR-005) | Proprietário (chave já existe) | **Falta confirmar o tipo da chave** |
| 5 | Ora Connect (controles, sem segredo) | `NOGLE_OPERACOES_HABILITADAS`, `NOGLE_GET_COM_CORPO`, `ORA_ORGANIZACAO_ID`, `CONNECT_UFS` | Definidos por nós depois da homologação com a Nogle (ADR-005) | Claude, com aceite do proprietário | Vazios até homologar |
| 6 | Fiscal | `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT` | Provedor de emissão por API, a contratar | Proprietário + contador | **Bloqueado** (provedor e contador) |
| 7 | PicPay link | `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET` | Painel PicPay Empresas → Integrações → Link de Pagamento → "Gerar token". **O segredo só aparece uma vez** | Proprietário | A gerar; formato do aviso de pagamento a confirmar |
| 7 | PagBank link | `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` | Conta PagBank → Venda online → Integrações → Gerar token (sandbox: Portal do Desenvolvedor → Tokens) | Proprietário | A gerar |
| 8 | WhatsApp oficial | `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_GRAPH_API_VERSION` | App na Meta for Developers com produto WhatsApp; token permanente de **Usuário do Sistema** no Gerenciador de Negócios; verificação da empresa na Meta | Proprietário (conta Meta da empresa) | A criar |
| 9 | Meta Ads | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_IDS`, `META_PIXEL_ID` | Mesmo app Meta, com permissão de leitura de anúncios; IDs das contas de anúncio | Proprietário | A criar; permissões a confirmar |
| 10 | Mercado Livre | `MERCADOLIVRE_APP_ID`, `MERCADOLIVRE_CLIENT_SECRET`, `MERCADOLIVRE_REDIRECT_URI`, `MERCADOLIVRE_WEBHOOK_PATH` | Criar aplicativo no portal de desenvolvedores do Mercado Livre. O endereço de retorno deve ser **idêntico** ao cadastrado. O token do vendedor dura **6 horas** e é renovado com o refresh token | Proprietário (conta vendedor) | A criar |
| 11 | Shopee | `SHOPEE_ENVIRONMENT`, `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI` | Cadastro como parceiro na Shopee Open Platform; cada loja autoriza o app e gera `shop_id` + tokens | Proprietário | A criar; aprovação de parceiro depende da Shopee |
| 12 | TikTok Shop | `TIKTOKSHOP_APP_KEY`, `TIKTOKSHOP_APP_SECRET`, `TIKTOKSHOP_SERVICE_ID`, `TIKTOKSHOP_REDIRECT_URI` | App no TikTok Shop Partner Center; cada loja autoriza e gera token + `shop_cipher` | Proprietário | A criar; detalhes a confirmar na documentação oficial do Partner Center |
| 13 | Monitoramento | `SENTRY_DSN` | Serviço de monitoramento de erros (opcional) | A decidir | Opcional |

**Sem credencial por decisão do projeto:** Rein (só CSV), PayJoy e Aiva (lançamento manual), maquininhas PicPay POS e PagSeguro (conciliação por comprovante/extrato).

---

## 3. Tokens que ficam no banco (não no `.env`)

| Plataforma | O que é guardado por loja/conta | Validade (conforme documentação) |
|---|---|---|
| Mercado Livre | `user_id`, access token, refresh token | Access token de 6 h; o refresh token muda a cada renovação e precisa ser salvo de novo |
| Shopee | `shop_id`, access token, refresh token | Tokens de curta duração com renovação periódica |
| TikTok Shop | `shop_cipher`, access token, refresh token | Com data de expiração informada na resposta |
| Nogle | Token temporário do login | Pedido de novo quando expira (guardado só em memória/cache) |
| PicPay | Token de acesso do OAuth | Pedido de novo quando expira (cache) |

Tabela prevista: `integration_accounts` (plataforma, loja/conta, status, tokens criptografados, validade, último erro) + `integration_events` (registro de cada chamada e aviso recebido, sem dados sensíveis em claro).

---

## 4. Ordem de ativação sugerida (alinhada ao plano de 6 meses)

| Mês | Credenciais necessárias |
|---|---|
| 1 | Aplicação, Supabase, e-mail, notificação no celular |
| 2 | PicPay e PagBank (link de pagamento) |
| 3 | Nogle; fiscal (se o provedor estiver pronto); WhatsApp oficial (para OS e nota) |
| 4 | Fiscal em produção |
| 5 | Mercado Livre |
| 6 | TikTok Shop, Meta Ads |
| Depois | Shopee |

Recomendação: **iniciar já** os cadastros que dependem de aprovação externa e demoram — verificação da empresa na Meta (WhatsApp e Ads), cadastro de parceiro na Shopee e app no TikTok Shop Partner Center — mesmo que a integração venha depois.

---

## 5. O que a Meta entrega e o que vem do próprio sistema

| Informação | Fonte |
|---|---|
| Gasto, alcance, cliques, leads e custo por lead das campanhas | **Meta Ads (Marketing API)** |
| Qual anúncio originou a conversa no WhatsApp | **WhatsApp oficial** (dados de origem do anúncio na mensagem) |
| Vendas por vendedor, meta do mês, quem bateu ou não, incentivos | **Banco da própria Ora** (PDV, turnos, metas e regras de comissão) |
| Retorno da campanha (gasto × vendas geradas) | **Cruzamento na Ora**: campanha → conversa → cliente → venda → vendedor |

Ou seja: as métricas de vendedor e metas **não dependem de credencial externa** — nascem dos lançamentos no sistema. A Meta só acrescenta o lado da campanha.

---

## 6. Fontes consultadas (06/11/2026)

- Nogle: https://docs.nogle.tech/
- Mercado Livre — autenticação e autorização: https://developers.mercadolivre.com.br/pt-br/autenticacao-e-autorizacao
- PicPay — Link de Pagamento, autenticação: https://developers-business.picpay.com/payment-link/en/docs/authentication
- PagBank — token de autenticação: https://developer.pagbank.com.br/docs/token-de-autenticacao
- Shopee Open Platform v2 (assinatura e tokens, via SDKs da comunidade; confirmar no portal oficial): https://open.shopee.com/developer-guide
- TikTok Shop (app key/secret, shop cipher, via SDKs da comunidade; confirmar no Partner Center): https://partner.tiktokshop.com/doc
- WhatsApp Cloud API (IDs, token de Usuário do Sistema, segredo do app, token de verificação): documentação Meta for Developers
