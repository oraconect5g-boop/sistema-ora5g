# Configurações e habilitações para o Claude Code — 13/11/2026

Base final `51417a8`, após a revisão funcional de `46638ee`. Este documento contém **nomes**, responsabilidades e provas de aceite; não contém valores de segredos. Nenhum `.env`, configuração secreta ou banco remoto foi lido pelo revisor. “Não verificado” não significa “ausente”. Reutilizar a lista central `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`, atualizando o estado em vez de criar fornecedores/endpoints por suposição.

## 1. Fazer primeiro: ambiente, schema e acesso

| Prioridade | Configuração / ação | Onde / nomes | Estado da revisão | Critério de aceite |
|---|---|---|---|---|
| P0 | Confirmar ambiente e projeto usados pelo aplicativo e pelo worker | `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `ORA_ORGANIZACAO_ID` | Site publica 46638ee; projeto de dados não foi atestado | App, worker e migrations apontam para o ambiente autorizado, com metadados registrados |
| P0 | Validar as 51 migrations agora registradas e J1 (#84) | Histórico do projeto, versões/hashes e funções por perfil | 51417a8 registra 51 aplicadas; 51 MD5 conferidos no arquivo do programador; sem consulta remota independente | RPCs novas respondem por perfil no ambiente correto; não reaplicar SQL com base no texto antigo das 12 pendentes |
| P0 | Configuração web pública | `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Exemplos e validador existem; valores não verificados | Grupos `aplicacao,supabase_publico` válidos, login e sessão renovada no domínio |
| P0 | Worker de identidade e acesso administrativo | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`; `ORA_PASTA_AMBIENTE` no processo | Código existe; execução/configuração remotas não atestadas | Convite vira Auth/perfil/vínculo, bloqueio impede novo acesso; logs só com contagens/códigos |
| P0 | Acesso de migrations pelo caminho autorizado | `DATABASE_URL`, cliente/CLI compatível e pooler de sessão IPv4 conforme ADR-001 | Nome/validador existem; valor/acesso não verificados | Lista de migrations e teste de atualização/RLS executados sem expor URL com senha |
| P0 | Três usuários fictícios: dono, gerente e vendedor | Auth + perfis/vínculos/unidade/turno; contas de teste | Já solicitados/autorizados nesta conversa; J1 ainda sem prova | Cada papel entra, executa só seu escopo e não acessa outra organização/loja. Senhas/acesso por canal privado |
| P0 | Garantir permissões/RLS/grants pós-migration | Funções/tabelas efetivas, configuração da Data API e advisors | 67 tabelas públicas com RLS na prova local; RPCs protegidas testadas; remoto não atestado | Mesmo comportamento no destino para dono/gerente/vendedor/bloqueado/sem vínculo; custo não vaza em agregados/downloads |
| P0 | Lojas e estoque piloto | 11 lojas comerciais + DEFEITOS; códigos, CNPJs/endereços reais, saldos e serializados | Nomes confirmados; cadastros definitivos/carga não homologados | Piloto conciliado, DEFEITOS sem venda e fluxo de transferências auditado |
| P1 | Storage de produtos e documentos | Bucket `produtos` no código de fotos; `SUPABASE_STORAGE_BUCKET_DOCUMENTOS` exemplifica documentos futuros | Fotos implementadas; anexos/contratos ainda incompletos | Políticas por papel/organização, upload e URL assinada funcionando; anexos privados com retenção/acesso quando implementados |
| P1 | Recuperação/convites por e-mail | SMTP **no painel do Supabase**, Site URL e redirect allowlist para confirmação/recuperação | Não atestado | Convite/recuperação chegam à caixa controlada e retornam ao domínio autorizado. E-mail de login do funcionário é assunto diferente do e-mail opcional do cliente |
| P1 | Teto de respostas e escala | `max_rows`/timeout da Data API, paginação estável, teto de locks do importador R2 | Teto remoto não medido; exportação simulada perde linhas quando teto é 1.000 | Exportar/buscar acima de 1.000 sem perda silenciosa; lote no teto executado dentro dos limites reais, sem ampliar indefinidamente a resposta |

O grupo `supabase_servidor` do validador inclui chave administrativa **e** conexão de banco. Isso serve ao conjunto administrativo/migrations; o worker HTTP não deve exigir conexão direta que ele não utiliza. O aplicativo de login usa apenas o grupo público.

## 2. `.env.example`, arquivos reais e validação

Existem `.env.example` na raiz e em `apps/plataforma`. **Não existe `apps/worker/.env.example` próprio**: a configuração central e os scripts documentam o worker. É melhoria de documentação/configuração, não prova de que o worker esteja sem ambiente no servidor. Criar exemplo mínimo do worker com nomes e valores vazios, derivado da referência central para evitar divergência.

A publicação deve continuar usando `deploy/homologacao/ambiente-web.sh`: allowlist de `APP_ENV`, `APP_TIMEZONE`, `APP_DEFAULT_CURRENCY` e `NEXT_PUBLIC_*`. `SUPABASE_SECRET_KEY`, `DATABASE_URL`, Nogle e demais credenciais ficam fora do web. Variáveis `NEXT_PUBLIC_*` são públicas por definição; nunca colocar chave secreta nelas.

O programador pode validar arquivos **no ambiente em que já tem autorização**, sem imprimir valores:

```bash
node packages/config/scripts/verificar-env.ts "<arquivo_web_autorizado>" aplicacao,supabase_publico
node packages/config/scripts/verificar-env.ts "<arquivo_administrativo_autorizado>" supabase_publico,supabase_servidor
```

Os caminhos acima são marcadores a substituir no servidor autorizado, não arquivos para enviar ao revisor. O script mostra nomes/erros e não valores. Não pedir que o proprietário cole `.env`, chave, senha, certificado ou base real em chat/GitHub. Variáveis exemplificadas para integrações futuras não demonstram que o adaptador esteja implementado.

## 3. Ora Connect / Nogle — prioridade operacional

Nogle/Contel é o sistema externo oficial integrado por API. Os nomes Nugo/Noga das mensagens referem-se ao mesmo tema; usar o contrato verificado do fornecedor no código. Não criar servidor/aplicativo paralelo nem substituir confirmação externa por registro local.

| Capacidade | Configuração / contrato necessário | O que o código já tem | Aceite para operar |
|---|---|---|---|
| Identidade da conta e acesso | `NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY`, `ORA_ORGANIZACAO_ID` | Cliente/transportador e validação no worker | Tipo franquia/marca/PDV e permissões confirmados pelo fornecedor, teste autorizado sem expor chaves |
| Operações habilitadas | `NOGLE_OPERACOES_HABILITADAS` | Fila, reivindicação, envio/consulta, resultado incerto e conciliação | Habilitar somente tipos homologados; ativação/recarga/portabilidade com referência e confirmação oficial |
| GET com corpo | `NOGLE_GET_COM_CORPO` | Transportador compatível quando habilitado; repo documenta confirmação do fornecedor em 10/11 | Reproduzir contrato na infraestrutura do destino, sem trocar método/payload por suposição |
| Confirmação por pagamento | `NOGLE_CONSULTA_PAGAMENTO` | Consulta controlada por habilitação e UUID da resposta | Rota liberada para a conta, UUID real de teste e evidência oficial; não ligar só porque a variável existe |
| Referências e catálogo | `CONNECT_UFS` e escopo da conta | Sincronização de listas/planos/DDDs/operadoras/cidades | Listas consistentes com a conta/loja; falhas não apagam referência válida nem criam dado fictício |
| Compra/estoque de chips e movimentação de PDV | Contrato oficial de estoque/transferência, referência ICCID e vínculo PDV | Livro local/ICCID/transferência interna | Conciliação local × Nogle; confirmar quando a transferência precisa existir nos dois sistemas. Transferência interna não comprova aceite externo |
| Gateway e cobrança telecom | Contrato de criação/consulta/cancelamento, método SALDO/LINK e idempotência | Parte do fluxo de operação está modelada; confirmação externa ainda não homologada | Uma cobrança por fato; LINK não cobra outra vez serviço já pago; timeout incerto vai para consulta, sem reenvio cego |
| Recorrência | Assinatura, ciclo, vencimento, alteração/cancelamento, falha e reprocesso documentados | Ainda incompleto | Cobrança/renovação e cancelamento de teste oficiais, eventos duplicados/fora de ordem e conciliação sem duplicar produção |
| Carteira, extrato e repasses | Contrato de saldo/transação/taxas/recebível/repasse e período | Registro local/debito protegido; não equivale a contabilidade oficial | Valor local reconciliado com relatório/extrato oficial; débito da carteira, valor de face, receita e repasse separados |
| Agendamento e observabilidade | `deploy/homologacao/worker-connect.sh`, pasta de ambiente, rotina/log/alerta | Script tem trava e logs de contagens; descreve rotina ainda condicionada à homologação | Rotina executa e consulta sem concorrência duplicada; verificar última execução, desligamento por variável ausente e falhas. Exit zero do cron não prova operação bem-sucedida |

Não presumir webhook da Nogle: o contrato atual usa reconsulta onde documentado. As perguntas oficiais já estão em `docs/integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md` e na referência da API; reconfirmar apenas lacunas, sem pedir de novo respostas registradas. C1/C2 não devem ser classificados como opcionais para declarar a Ora Connect completa.

## 4. Cliente, fiscal e envio da nota por WhatsApp

O cadastro rápido deve aceitar **nome completo + WhatsApp**; e-mail sempre opcional. O endereço completo é exigido no fluxo fiscal: CEP, logradouro, número, complemento quando houver, bairro, município e UF, com demais identificadores que o documento exigir. Coletar no passo pertinente, sem transformar o rápido em formulário fiscal completo. Atualizar formulário, RPC, domínio/tipos, edição, cliente da venda e snapshot do destinatário.

| Capacidade | Configuração / decisão | Implementação restante | Aceite |
|---|---|---|---|
| Emissor fiscal | `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT`; contador define documento/regime/tributos/certificado | Adaptador, cadastro tributário, emissão/retorno, rejeição/cancelamento/reprocesso/contingência | Documento válido de homologação, chave/protocolo e conciliação com a venda. Aprovação interna não atrasa obrigação legal |
| WhatsApp oficial | `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Worker/outbox, templates/mídia quando necessários, assinatura do webhook, idempotência, tentativas e estado de entrega | Nota/documento autorizado enviado ao WhatsApp correto, confirmação/falha registradas e tentativa segura; nenhum e-mail obrigatório/fictício |
| Templates/consentimentos | Regras atuais da Meta, tipo de mensagem, janela e preferências | Vincular envio ao cliente/documento e auditar autor/finalidade | Envio transacional de nota não exige opt-in de marketing; ofertas respeitam preferência própria |
| Documentos e URLs | Storage privado, acesso temporário apropriado ao canal, retenção e auditoria | Anexos/contratos privados e entrega fiscal segura | Documento não fica público por acidente nem vinculado ao cliente errado; validar a necessidade e duração de URL para busca pelo provedor |

Botão `wa.me`/abrir conversa não atende sozinho ao pedido de integração oficial. Configurar seis variáveis também não implementa essa entrega. O e-mail opcional do cliente não altera a autenticação dos funcionários.

## 5. Pagamentos gerais, financeiras e bancos

| Capacidade | Nomes / fonte | Estado e próximo passo |
|---|---|---|
| Maquininha/Pix da loja | Extratos e cadastros reais de terminais; habilitação do banco/adquirente se automatizar | Registro/conciliação manual implementados. Não inventar API de PicPay POS/PagSeguro; conferir taxas/estornos/liquidação pelo extrato |
| Financeiras PayJoy/Aiva | Prazos/taxas e formato de relatório/retorno oficial, P8/E2 | Recebíveis/repasse manual implementados; corrigir #83 e concluir vencimentos/aging/integração conforme contrato |
| Link online, se escolhido | `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET`; ou `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` | Adaptador/eventos ainda a desenvolver; assinatura, consulta oficial, idempotência e estorno antes de confirmar pagamento |
| Bancos e contas multiempresa | Conta/agência/titular por CNPJ, extrato/identificador e formato de importação ou API contratada | FIN-006 não iniciado; implementar baixa/conciliação sem confundir registro manual com liquidação |
| Contas a pagar / DRE / previsão | Migrations L8 agora registradas; categorias e dados reais; política documentada D-036–038 | Já há código. Corrigir #82, validar a jornada e os números; parâmetros de simulação são estimativa, não saldo bancário confirmado |

## 6. Expansão: configuração futura não deve bloquear o núcleo

| Integração | Variáveis previstas no exemplo | O que ainda precisa de código/contrato |
|---|---|---|
| Mercado Livre | `MERCADOLIVRE_APP_ID`, `MERCADOLIVRE_CLIENT_SECRET`, `MERCADOLIVRE_REDIRECT_URI`, `MERCADOLIVRE_WEBHOOK_PATH` | OAuth/renovação, notificações verificadas, catálogo/estoque/pedido/logística/repasse |
| Shopee | `SHOPEE_ENVIRONMENT`, `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI` | Adaptador, assinatura/autorização e fluxos comerciais/reconciliação |
| TikTok Shop | `TIKTOKSHOP_APP_KEY`, `TIKTOKSHOP_APP_SECRET`, `TIKTOKSHOP_SERVICE_ID`, `TIKTOKSHOP_REDIRECT_URI` | Contrato verificado, autorização, eventos e operação |
| Meta/atribuição | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_IDS`, `META_PIXEL_ID` | Habilitações, eventos consentidos, atendimento/atribuição e relatórios |
| Loja online/logística | `NEXT_PUBLIC_LOJA_URL`, dados fiscais/estoque de origem e fornecedor logístico a definir | Aplicação online, checkout, reserva, frete/etiqueta/rastreio, devolução e financeiro |
| IA | Fornecedor/modelo e política de dados ainda a definir; não inventar uma variável obrigatória global | Integração supervisionada, limites/avaliação, acesso por finalidade e humano para atos sensíveis |
| Operação | `SENTRY_DSN`, push/rotinas/chaves internas quando utilizadas | Exemplos não comprovam instrumentação; implementar alertas, monitoramento de jobs e restauração testada |

## 7. Entrega esperada por lote

Registrar requisito/issue, commit, migration/compatibilidade, estado antes/depois, testes e evidências sem valores sensíveis. Conferir versão pública, schema e jornada autenticada, não apenas build. Se faltar dado/contrato, nomear a dependência e seguir a parte independente. Produção e operações reais respeitam o escopo de autorização; esta revisão não executa nenhuma delas.
