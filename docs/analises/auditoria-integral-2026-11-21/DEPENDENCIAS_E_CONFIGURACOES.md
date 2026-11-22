# Configuração e dependências: situação atual, sem segredos

Os dois exemplos existem: `.env.example` (raiz, catálogo amplo de integrações) e `apps/plataforma/.env.example` (web). Arquivo de exemplo não comprova valor configurado. O Codex não acessou SSH nem `.env`; quando o estado depende do servidor, a fonte é o registro do Claude e precisa de verificação segura só por presença/nome.

| Integração / parâmetro | Evidência atual | Próximo passo |
|---|---|---|
| GitHub–Supabase | `packages/banco`, branch `main`; 121 migrations iguais por versão | Conferir resultado de cada migration junto à versão da aplicação; não confundir sincronização SQL com deploy web |
| Supabase web | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | URL/cliente operantes; preservar RLS; nunca colocar secret key em `NEXT_PUBLIC_*` |
| Worker privilegiado | `SUPABASE_SECRET_KEY`: registro de chegada em 18/11, só nos workers | Corrigir matriz antiga que ainda a pede; não expor/duplicar chave no web |
| Convites e recuperação | Contas de teste existem; worker identidade documentado | SMTP próprio, modelos de mensagem, Site URL e redirects HTTPS devem ser homologados; presença desses ajustes no painel não foi confirmada nesta sessão |
| Nogle | Registro de `NOGLE_ACCESS_KEY` recebido; base oficial, organização e GET com corpo documentados | Confirmar `NOGLE_AUTH_KEY_TYPE` e `NOGLE_SECONDARY_KEY` se aplicável; flags `NOGLE_OPERACOES_HABILITADAS` e `NOGLE_CONSULTA_PAGAMENTO` somente conforme contrato e autorização |
| Nogle: operação completa | 0 operações e 0 habilitações no banco; conciliação de relatórios implementada | Leitura de listas; ativação/recarga/portabilidade; carteira/extrato/recorrência/repasse. UUID/consulta de pagamento e fonte oficial de comissões precisam das respostas do fornecedor |
| Checkout | `PICPAY_CLIENT_ID/CLIENT_SECRET/WEBHOOK_SECRET` ou `PAGBANK_ENVIRONMENT/API_TOKEN` | Provedor contratado, adaptador real, tabela/fila de cobrança, callback e reconsulta. Não basta preencher variáveis: `ADAPTADOR_PRONTO=false` |
| PayJoy/Aiva | Fluxo manual de financiamento, entrada e recebível | Contrato e documentação de cada API; campos de autenticação só depois de confirmar o contrato. APIs obrigatórias no escopo final |
| J7/QI Tech | Reserva de extensão futura | Identidade da J7, produto de crédito e parceria/API; não ativar integração fictícia |
| Fiscal | `FISCAL_PROVIDER/API_BASE_URL/API_TOKEN/ENVIRONMENT` | Emissor e contador, certificado, CNPJ/regime/endereço, NCM/CFOP e regras por operação/UF; não inventar dados fiscais |
| WhatsApp | `WHATSAPP_GRAPH_API_VERSION`, `BUSINESS_ACCOUNT_ID`, `PHONE_NUMBER_ID`, `ACCESS_TOKEN`, `APP_SECRET`, `WEBHOOK_VERIFY_TOKEN` | WABA/número, permissão, modelo de utilidade, callback assinado, confirmação e política de consentimento |
| Mercado Livre | `MERCADOLIVRE_APP_ID/CLIENT_SECRET/REDIRECT_URI/WEBHOOK_PATH` | Conta/app/consentimento, OAuth/refresh, contrato real, sincronização e conciliação |
| TikTok Shop | `TIKTOKSHOP_APP_KEY/APP_SECRET/SERVICE_ID/REDIRECT_URI` | Partner Center, aprovação/escopos/assinatura conforme documentação; adaptador real |
| Shopee | `SHOPEE_ENVIRONMENT/PARTNER_ID/PARTNER_KEY/REDIRECT_URI` | Parceria e autorização da loja; respeitar prioridade do roadmap |
| Meta | `META_APP_ID/APP_SECRET/SYSTEM_USER_TOKEN/AD_ACCOUNT_IDS/PIXEL_ID` | Marketing API e CAPI com consentimento/dedupe; Meta Commerce é contrato separado |
| Web Push | 1 inscrição; lote PWA-b aceito | Inscrever aparelhos de usuários; testar aviso de aprovação real. Não pedir novamente geração de chaves que já consta concluída |
| Dados das lojas | Nomes presentes, CNPJ ausente nas 11 reais | Dados fiscais e endereço confirmados pelo proprietário; nenhuma consulta a credenciais é necessária para preparar a lista |
| Arquivos privados | Planilha já entregue ao Codex; 0 importações, 0 fotos, 0 extratos | Disponibilizar ao programador por canal privado; não publicar mercadoria/custos/fotos de documentos no Git público |
| Produção | Domínio principal ainda informa homologação | Projeto/backup/restore, SMTP, segredos, monitoramento, piloto e aceite conforme GO/NO-GO |

Perguntas Nogle já existentes: `docs/integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md` e `NOGLE_API_REFERENCIA.md`. Atualizar as respostas e a matriz; não reenviar toda a lista como se nenhuma resposta tivesse chegado. O pedido de contabilizar oficialmente o telecom continua vigente: registro interno não substitui o da plataforma parceira. Nogle informou ausência de API de comissões; é preciso uma fonte oficial alternativa para conciliá-las, não um valor inventado.

O saldo das contas bancárias é calculado a partir das linhas dos extratos ligados após o saldo inicial. Ainda falta reconciliar o saldo final informado pelo OFX. Arquivos de marketplaces e de Meta não completam a importação automática solicitada.
