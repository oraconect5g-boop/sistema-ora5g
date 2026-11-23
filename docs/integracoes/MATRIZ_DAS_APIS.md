# A matriz das APIs: uma linha por integração

**Atualizada em:** 23/11/2026 (lote REIN-d: a linha da Rein, com a planilha no servidor; antes, lote AUD-c: as linhas do Supabase, da Nogle e dos extratos do banco, conferidas no servidor só pelos nomes; antes, 18/11, lote INTEG-d) · **Por:** Claude Code · **Revisor:** Codex · **Para:** o proprietário

**A fonte é o arquivo [`MATRIZ_DAS_APIS.json`](MATRIZ_DAS_APIS.json):** um teste confere que cada linha tem todas as colunas, que a situação é uma das sete da orientação de 18/11 e que cada variável existe no `.env.example`. Aqui aparecem só os **nomes** das variáveis, nunca os valores. Os fatos vêm da [lista de APIs](APIS_E_HABILITACOES_NECESSARIAS.md), da [referência da Nogle](NOGLE_API_REFERENCIA.md), do [ADR-020](../adr/ADR-020-integracoes-que-esperam-contrato.md), do código do worker e da PR #97. O que não se sabe fica "a confirmar", com quem confirma.

**As sete situações:** não iniciado, parcial, código testado, configuração pendente, publicado, homologado, bloqueio externo. "Bloqueio externo" quer dizer que só a chamada ou a decisão que depende de fora espera; o resto segue (a coluna "o que pode andar").

## O resumo

| API | Situação | O que falta (o mínimo) | Quem fornece | O que pode andar sem isso |
|---|---|---|---|---|
| **Supabase: login, banco e arquivos** | configuração pendente | O SMTP próprio, os dois modelos de e-mail e a Site URL no painel; para a produção, outro projeto com backup (D-027). A SUPABASE_SECRET_KEY está no servidor desde 18/11 (só os workers a leem) | O proprietário (o SMTP, os modelos e a Site URL, no painel) | Tudo: o código, os testes e as provas autenticadas por perfil seguem; só o e-mail do convite e o da recuperação de senha esperam o SMTP |
| **Nogle: Ora Connect (chips, ativação, recarga, portabilidade, carteira)** | bloqueio externo | O tipo da chave (P9) e, se ele pedir, a segunda chave (a de acesso está no servidor desde 18/11, só no worker); quais operações ligar; as respostas às perguntas 6, 7, 11 e 12 e, da 10, o nome do uuid e a liberação de /consultaPagamento; uma linha e um chip de teste autorizados. Comissões e bonificações: a Nogle respondeu que não há na API; a fonte oficial (relatório ou extrato da Nogle) precisa ser indicada (D-016, #54) | A Nogle (chaves, respostas, linha de teste e a fonte das comissões), pelo proprietário | Feito no CONNECT-c: a conciliação com os relatórios, provada com os exemplos oficiais; a conferência real espera a Nogle ligada |
| **Emissor fiscal (NFC-e, NF-e, NFS-e)** | bloqueio externo | O contador (o regime e o documento de cada operação por filial; CFOP, CST, CSOSN e NCM); o emissor contratado; o certificado A1 de cada CNPJ; os CNPJs das 11 filiais | O contador e o proprietário | A preparação por filial na tela (sem inventar CNPJ) e a fila, que já existe; a emissão espera o emissor |
| **WhatsApp Business Platform (Cloud API)** | bloqueio externo | A verificação da empresa na Meta, o número habilitado, o token de usuário do sistema, o segredo do app e um modelo de utilidade aprovado | O proprietário, no Meta for Developers | A caixa de entrada e o atendimento no sistema (histórico, etiquetas, distribuição), sem envio real; o e-mail continua opcional |
| **Link de pagamento e Pix online (PicPay ou PagBank)** | bloqueio externo | A escolha do provedor (E1) e a credencial do escolhido | O proprietário | A tabela das cobranças e a tela da conciliação, sem provedor; o checkout pago espera a escolha |
| **PayJoy (financiamento do aparelho)** | bloqueio externo | O contrato e a documentação da conta da Ora; o valor e o prazo do repasse (P8) | A PayJoy, pelo proprietário | O modelo por capacidade (em preparação, aguardando contrato, em homologação, ativo), sem nenhum botão de aprovar que só grave sucesso local |
| **Aiva (financiamento do aparelho)** | bloqueio externo | A documentação e a parceria pelo canal oficial; o valor e o prazo do repasse (P8) | A Aiva, pelo proprietário | O mesmo modelo por capacidade da PayJoy |
| **QI Tech (crédito; extensão futura)** | não iniciado | O produto e a parceria da Ora, o acesso provisionado e os requisitos de produção | A QI Tech, pelo proprietário | Nada específico até a parceria |
| **J7 (crédito; extensão futura)** | não iniciado | A identidade da empresa, o produto de crédito e a API | O proprietário | Nada até a identidade |
| **Mercado Livre (marketplace)** | bloqueio externo | A conta de desenvolvedor, o app aprovado e a autorização da conta vendedora | O proprietário, no portal do canal | O mapeamento do catálogo e do estoque por canal no sistema; a ligação espera o app aprovado |
| **Shopee (marketplace)** | bloqueio externo | A conta de desenvolvedor, o app aprovado e a autorização da conta vendedora | O proprietário, no portal do canal | O mapeamento do catálogo e do estoque por canal no sistema; a ligação espera o app aprovado |
| **TikTok Shop (marketplace)** | bloqueio externo | A conta de desenvolvedor, o app aprovado e a autorização da conta vendedora | O proprietário, no portal do canal | O mapeamento do catálogo e do estoque por canal no sistema; a ligação espera o app aprovado |
| **Meta: gasto e atribuição dos anúncios (Marketing API)** | bloqueio externo | A verificação da empresa na Meta e o acesso à conta de anúncios | O proprietário | Nada: o arquivo já cobre a leitura; a API espera o acesso |
| **Meta: eventos de conversão (Conversions API)** | bloqueio externo | A conta de anúncios, a autorização e a base legal (D-022 e D-048) | O proprietário e o jurídico | Nada até a base legal |
| **Meta: comércio (catálogo no Facebook e no Instagram)** | não iniciado | A verificação da empresa e o gerenciador de comércio | O proprietário | Publicar produtos e fotos na loja do site, que é a mesma base do catálogo |
| **Avisos no celular (Web Push)** | homologado | Nada (as quatro WEB_PUSH_* preenchidas, conferido só pelos nomes em 18/11) | Ninguém | Nada pendente |
| **E-mail de envio (SMTP)** | configuração pendente | A caixa nao-responda@ora5g.com.br no cPanel e o SMTP no painel do Supabase, com os dois modelos de e-mail | O proprietário | O e-mail continua opcional no cadastro do cliente |
| **Maquininhas PicPay POS e PagSeguro** | configuração pendente | Um extrato real de cada maquininha, como arquivo (18/11: nenhum carregado) | O proprietário | Nada: espera o arquivo |
| **Extratos do banco e Pix** | configuração pendente | Um extrato real do banco; a decisão D-011 para a API | O proprietário | Nada: espera o arquivo |
| **Frete, etiqueta e rastreio da loja online** | bloqueio externo | As decisões P10 e D-025 (o CNPJ da nota online, de onde sai o estoque, a transportadora) | O proprietário | A disponibilidade por loja e a retirada |
| **Rein (sistema atual)** | publicado | As decisões do proprietário (a tabela de preço, o tipo das famílias e o código do produto) e o sim dele para a prévia; a planilha chegou em 23/11 e fica em ~/entrada/rein/, fora do GitHub | O proprietário | Tudo o que não usa o catálogo de verdade |
| **IA (atendimento e análises)** | não iniciado | O fornecedor e o orçamento (D-030) | O proprietário | Nada até a decisão |
| **Monitoramento de erros** | não iniciado | A escolha (opcional) | O proprietário | Nada |

## Cada API, coluna por coluna

### Supabase: login, banco e arquivos

**Situação:** configuração pendente · **Requisitos:** ORA-ORG-001 a 010; a jornada com login por perfil (J1)

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: Admin API de usuários (createUser, generateLink), login no servidor (SSR), SMTP próprio e controle de acesso do Storage, em supabase.com/docs. Conferida em 06/11 e 14/11 (lista de APIs, A1) |
| Operações necessárias | Login por senha e sessão por turno; Admin API para convidar, criar as contas de teste e bloquear; banco PostgreSQL com RLS; Storage privado (fotos, documentos e notas) |
| O que já existe | O banco com RLS, auditoria e as funções de cada módulo (as migrations em packages/banco); o login SSR, a escolha da loja e a sessão por turno; a tela da equipe; o Storage privado; o worker de identidade (apps/worker/src/identidade.ts), que convida pela Admin API |
| Código que falta | Nada para o piloto. A jornada por perfil foi provada no domínio com as contas de teste (lotes J1 a J3, de 19 a 21/11) |
| Acesso ou contrato que falta | O SMTP próprio, os dois modelos de e-mail e a Site URL no painel; para a produção, outro projeto com backup (D-027). A SUPABASE_SECRET_KEY está no servidor desde 18/11 (só os workers a leem) |
| Variáveis (só os nomes) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET_DOCUMENTOS` |
| Ambiente de teste | O projeto ora5g-dev, com dados fictícios; é o banco da homologação ora5g.com.br |
| Autenticação | O par público no navegador e no servidor web (a RLS decide); a chave secreta só no worker (ADR-002, 2.5) |
| Limites | Sem SMTP próprio, o Supabase manda pouquíssimos e-mails por hora; a API corta cada resposta em 1.000 linhas (as leituras grandes vão em páginas, B5) |
| Idempotência | Chave de idempotência nas funções do banco que mudam dinheiro e estoque (venda, reserva, transferência, carga); o convite repetido não duplica a pessoa |
| Aviso (webhook) ou reconsulta | Não há aviso externo; o bloqueio de acesso vale na hora pela RLS |
| Conciliação | Não se aplica: é a própria base. As divergências do estoque têm a função privado.divergencias_estoque |
| Testes | packages/banco (PGlite e PostgreSQL 17 com duas conexões); apps/worker/src/identidade.test.ts |
| Publicação | No ar na homologação, com as migrations aplicadas no ora5g-dev |
| Homologação | O login do dono em uso; as cinco contas de teste (vendedor, dois gerentes, administrador e dono) criadas em 18, 19 e 21/11, com as provas J1 a J3 passando no domínio; nenhum desses roteiros aceito ainda pelo proprietário |

### Nogle: Ora Connect (chips, ativação, recarga, portabilidade, carteira)

**Situação:** bloqueio externo · **Requisitos:** ORA-CONNECT-001 a 011 (o 009, parcial desde o CONNECT-c: a produção conciliada; as comissões sem fonte na API)

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: docs.nogle.tech, lida por inteiro em 07/11 (62 funções; cópia com SHA-256 no repositório e o catálogo conferido no CI). Respostas da Nogle de 10/11 aos itens 5 a 7 (docs/integracoes/NOGLE_API_REFERENCIA.md, 3.1) |
| Operações necessárias | Ativação de chip físico e eSIM, recarga, portabilidade, consulta de linha, plano e saldo; estoque de chips do PDV e da MVNO; transferência de chips entre PDVs; o extrato do saldo (GET /saldo/extrato) e os relatórios de ativações, recargas e transações (GET /relatorios/*); a consulta do pagamento pelo uuid, prometida pela Nogle e fora da coleção oficial |
| O que já existe | As regras em packages/dominio/src/nogle.ts (só campos documentados; resposta, evidência e listas oficiais); o worker em apps/worker/src/connect (token, envio, consulta e listas; resultado desconhecido nunca é reenviado); as operações persistentes no banco (ADR-005); as telas /connect e /demo/connect; desde o CONNECT-c (18/11), a conciliação com os relatórios oficiais de ativações e de recargas (o comando --conciliar do worker e a tela /connect/conciliacao) |
| Código que falta | O extrato do saldo na conciliação (espera a primeira resposta real, porque o exemplo oficial não traz os campos); a compra com entrega, o bloqueio, o consumo e a transferência de chips no PDV da Nogle; o agendamento do worker (com autorização) |
| Acesso ou contrato que falta | O tipo da chave (P9) e, se ele pedir, a segunda chave (a de acesso está no servidor desde 18/11, só no worker); quais operações ligar; as respostas às perguntas 6, 7, 11 e 12 e, da 10, o nome do uuid e a liberação de /consultaPagamento; uma linha e um chip de teste autorizados. Comissões e bonificações: a Nogle respondeu que não há na API; a fonte oficial (relatório ou extrato da Nogle) precisa ser indicada (D-016, #54) |
| Variáveis (só os nomes) | `NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY`, `NOGLE_OPERACOES_HABILITADAS`, `NOGLE_GET_COM_CORPO`, `NOGLE_CONSULTA_PAGAMENTO` |
| Ambiente de teste | Sem sandbox documentado: pedido à Nogle um ambiente ou uma linha e um chip de teste; nenhuma operação real sem essa autorização |
| Autenticação | POST /auth/token com a chave de acesso (e a secundária, de franquia ou PDV); o token temporário fica só na memória do worker e é pedido de novo no 401 (validade não documentada) |
| Limites | Não documentados (perguntado à Nogle) |
| Idempotência | Cada operação é um registro com chave própria e estado; resultado desconhecido não reenvia: consulta, e a gerência decide. A Nogle diz validar a duplicidade de pagamentos |
| Aviso (webhook) ou reconsulta | Nenhum aviso documentado; o worker reconsulta o estado (ativação, recarga, portabilidade) |
| Conciliação | Os relatórios oficiais de ativações e de recargas, ligados à operação confirmada (CONNECT-c: conferida, valor diferente, só na Nogle, só na Ora); o extrato do saldo e o custo da carteira por linha (#56) esperam a primeira resposta real; as comissões não têm fonte na API |
| Testes | packages/dominio/src/nogle.test.ts; apps/worker/src/connect/*.test.ts (ponta a ponta contra um servidor local com os exemplos oficiais, inclusive a conciliação); packages/banco/src/connect-conciliacao.test.ts; o catálogo das 62 funções no CI |
| Publicação | As telas estão no ar; o worker da Ora Connect não está agendado e falta o tipo da chave (a de acesso está gravada desde 18/11): nenhuma operação real |
| Homologação | Não homologado |

### Emissor fiscal (NFC-e, NF-e, NFS-e)

**Situação:** bloqueio externo · **Requisitos:** ORA-FISC-001 a 010

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Depende do emissor escolhido com o contador: nenhum escolhido, nada implementado contra API de fornecedor não escolhido |
| Operações necessárias | Emitir por operação e por filial, consultar, cancelar, carta de correção, contingência, XML e PDF, envio ao cliente |
| O que já existe | A fila fiscal com a aprovação que não segura a emissão; o registro da nota pela chave de acesso (dígito e CNPJ conferidos); os dados para emitir no portal (K1b); o PDF e o XML guardados com SHA-256 (L10a); a conciliação fiscal (L10b); o cancelamento e a carta de correção registrados (L10c, FISC-009b); o envio da nota pelo WhatsApp em fila (K1c, desligado) |
| Código que falta | O adaptador do emissor escolhido: a emissão a partir da venda, a autorização e a rejeição, o cancelamento e a contingência, com a identidade da operação |
| Acesso ou contrato que falta | O contador (o regime e o documento de cada operação por filial; CFOP, CST, CSOSN e NCM); o emissor contratado; o certificado A1 de cada CNPJ; os CNPJs das 11 filiais |
| Variáveis (só os nomes) | `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT` |
| Ambiente de teste | A homologação da SEFAZ, pelo emissor escolhido |
| Autenticação | Conforme o emissor; o certificado A1 fica com o emissor ou no cofre de segredos, nunca no projeto |
| Limites | Conforme o emissor e a SEFAZ |
| Idempotência | Uma nota por operação (a venda); a chave de acesso é única no registro |
| Aviso (webhook) ou reconsulta | Conforme o emissor: o aviso de autorização ou rejeição, com a conferência da origem e a reconsulta |
| Conciliação | A conciliação fiscal (L10b) confere a venda com a nota registrada |
| Testes | Os testes das funções fiscais no banco e das telas fiscais |
| Publicação | As telas fiscais estão no ar (o registro da nota emitida no portal) |
| Homologação | Não homologado; a emissão automática não existe |

### WhatsApp Business Platform (Cloud API)

**Situação:** bloqueio externo · **Requisitos:** ORA-WHATS-001 a 008, ORA-OS-005, ORA-CRM-007 e o contato do ORA-META-002

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: developers.facebook.com/docs/whatsapp/cloud-api, consultada em 06/11; reconfirmar ao ligar |
| Operações necessárias | Enviar modelo de utilidade com documento (a nota, o orçamento da OS); receber e verificar o aviso (as mensagens e a situação de cada envio); a caixa de entrada do atendimento, com histórico, etiquetas, distribuição e pós-venda |
| O que já existe | A fila da nota com estados e sem envio duplicado (K1c); o programa que lê a fila (WHATS-a), desligado; a conferência do destinatário (INTEG-c); o botão que abre a conversa pronta, sem automação |
| Código que falta | O adaptador oficial (o envio do modelo com o documento e a leitura da resposta da Meta); a rota do aviso, com o token de verificação e a assinatura com o segredo do app; a caixa de entrada, as etiquetas, a distribuição e o pós-venda |
| Acesso ou contrato que falta | A verificação da empresa na Meta, o número habilitado, o token de usuário do sistema, o segredo do app e um modelo de utilidade aprovado |
| Variáveis (só os nomes) | `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| Ambiente de teste | O número de teste do app na Meta (a confirmar na documentação ao ligar) |
| Autenticação | O token de acesso do usuário do sistema (Graph API); o token de verificação do aviso o Claude gera, com autorização |
| Limites | Fora da janela de 24 horas, só modelo aprovado; os limites de envio por número a confirmar na documentação ao ligar |
| Idempotência | A fila nunca marca "enviado" sem a resposta da Meta; o mesmo pedido não sai duas vezes |
| Aviso (webhook) ou reconsulta | O aviso verificado traz a situação de cada envio e as mensagens recebidas |
| Conciliação | A situação de cada envio (enviado, entregue, lido, falhou) contra a fila |
| Testes | apps/worker/src/whatsapp/*.test.ts |
| Publicação | O worker não está ligado; o botão que abre a conversa está no ar |
| Homologação | Não homologado |

### Link de pagamento e Pix online (PicPay ou PagBank)

**Situação:** bloqueio externo · **Requisitos:** ORA-PAY-008, ORA-PAY-013, ORA-PAY-014, ORA-POS-009 e o pagamento do ORA-ONLINE-002

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial, parcial: PicPay Link de Pagamento (introdução, autenticação e aviso) e PagBank (token e criação de checkout), conferidas em 06/11; o formato e a assinatura do aviso a confirmar ao gerar a credencial |
| Operações necessárias | Criar a cobrança, consultar (a reconsulta), receber o aviso, cancelar, estornar e conciliar com o extrato do provedor |
| O que já existe | O meio "link" é recusado no PDV e na Ora Connect da loja (D-050, decisão do proprietário de 18/11: o link é só da compra online); no worker (cobranca/cobranca.ts): a interface, o formato comum do aviso e da reconsulta e as regras do PAY-b: o aviso nunca confirma, só a reconsulta, conferindo a cobrança, o valor, a moeda e a ordem; o tempo esgotado não cobra duas vezes |
| Código que falta | O adaptador oficial do provedor escolhido, a rota do aviso, a tabela das cobranças com a fila, o checkout pago da loja online e a conciliação com o extrato do provedor |
| Acesso ou contrato que falta | A escolha do provedor (E1) e a credencial do escolhido |
| Variáveis (só os nomes) | `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET`, `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` |
| Ambiente de teste | O sandbox do PagBank; o do PicPay a confirmar no painel |
| Autenticação | PicPay: o identificador e o segredo do cliente; PagBank: o token (conforme as páginas oficiais de autenticação) |
| Limites | A confirmar na documentação do escolhido |
| Idempotência | O nosso identificador em toda tentativa; o resultado desconhecido consulta antes de criar de novo |
| Aviso (webhook) ou reconsulta | O aviso assinado só leva à reconsulta; só a reconsulta confirma (PAY-b) |
| Conciliação | O que não fecha (pago depois de cancelado, estorno sem pagamento, outro valor ou moeda) vai para a conciliação; o extrato do provedor fecha o dia |
| Testes | apps/worker/src/cobranca/cobranca.test.ts |
| Publicação | Nada ligado: o pedido do site é retirar e pagar na loja |
| Homologação | Não homologado |

### PayJoy (financiamento do aparelho)

**Situação:** bloqueio externo · **Requisitos:** ORA-POS-013, ORA-PAY-002, ORA-PAY-011 e o vencimento do ORA-FIN-003

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Pública: Retail Partner API (índice, endpoints, autenticação e avisos), consultada pelo Codex em 14/11 (PR #97). Ela não confirma a originação e a aprovação no Brasil, o sandbox nem o escopo da conta da Ora |
| Operações necessárias | As que o contrato liberar: proposta, consulta, aprovação, contrato e termos, cancelamento, o aviso de volta, o repasse, as taxas e os prazos. Não inferir o endpoint de aprovação a partir da API de consulta |
| O que já existe | A venda financiada manual: o registro da venda e do a receber de cada financeira; o e-mail opcional na PayJoy (INTEG-a) |
| Código que falta | O adaptador por capacidade, depois do contrato: os estados, a proposta persistida, a fila, a caixa de entrada dos avisos, a idempotência e a reconciliação |
| Acesso ou contrato que falta | O contrato e a documentação da conta da Ora; o valor e o prazo do repasse (P8) |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A confirmar com a PayJoy |
| Autenticação | Chave de parceiro (documentação pública); o escopo da conta a confirmar |
| Limites | A confirmar |
| Idempotência | A projetar com o contrato: o resultado desconhecido consulta, nunca cria outro financiamento |
| Aviso (webhook) ou reconsulta | O aviso de volta com assinatura (documentação pública), e a reconsulta antes de mudar a venda |
| Conciliação | O repasse contra o a receber da financeira (hoje manual, em /pagamentos/recebiveis) |
| Testes | Os testes da venda financiada manual |
| Publicação | O registro manual está no ar |
| Homologação | Não homologado |

### Aiva (financiamento do aparelho)

**Situação:** bloqueio externo · **Requisitos:** ORA-POS-013, ORA-PAY-002 e ORA-PAY-011

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Só o site oficial (aivapay.com.br); não foi localizada documentação pública suficiente de API (PR #97, 14/11). Isso não significa que não exista |
| Operações necessárias | As que o contrato liberar (as mesmas perguntas da PayJoy: proposta, decisão, contrato, cancelamento, repasse) |
| O que já existe | A venda financiada manual, como na PayJoy |
| Código que falta | O adaptador, depois da documentação |
| Acesso ou contrato que falta | A documentação e a parceria pelo canal oficial; o valor e o prazo do repasse (P8) |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A confirmar com a Aiva |
| Autenticação | A confirmar |
| Limites | A confirmar |
| Idempotência | A projetar com o contrato |
| Aviso (webhook) ou reconsulta | A confirmar |
| Conciliação | O repasse contra o a receber da financeira (manual hoje) |
| Testes | Os testes da venda financiada manual |
| Publicação | O registro manual está no ar |
| Homologação | Não homologado |

### QI Tech (crédito; extensão futura)

**Situação:** não iniciado · **Requisitos:** Extensão pedida para análise e aprovação de crédito, empréstimo e compra do aparelho

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Pública: docs.qitech.com.br (primeiros passos e referência da API), consultada pelo Codex em 14/11 (PR #97) |
| Operações necessárias | A definir com o produto e a parceria |
| O que já existe | Nada (extensão futura, por decisão) |
| Código que falta | O adaptador por capacidade, depois da parceria |
| Acesso ou contrato que falta | O produto e a parceria da Ora, o acesso provisionado e os requisitos de produção |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A homologação da QI Tech, depois do provisionamento |
| Autenticação | A confirmar com o provisionamento |
| Limites | A confirmar |
| Idempotência | A projetar com o contrato |
| Aviso (webhook) ou reconsulta | A confirmar |
| Conciliação | A projetar (dinheiro aprovado não é dinheiro recebido; juros da financeira não são receita da Ora) |
| Testes | Nenhum |
| Publicação | Nada |
| Homologação | Não homologado |

### J7 (crédito; extensão futura)

**Situação:** não iniciado · **Requisitos:** A mesma extensão de crédito

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Nenhuma: o nome oficial, o CNPJ, o site e a API não foram confirmados. Não confundir com a J17 por semelhança de nome |
| Operações necessárias | A definir |
| O que já existe | Nada |
| Código que falta | Tudo, depois da identidade e da documentação |
| Acesso ou contrato que falta | A identidade da empresa, o produto de crédito e a API |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A confirmar |
| Autenticação | A confirmar |
| Limites | A confirmar |
| Idempotência | A projetar |
| Aviso (webhook) ou reconsulta | A confirmar |
| Conciliação | A projetar |
| Testes | Nenhum |
| Publicação | Nada |
| Homologação | Não homologado |

### Mercado Livre (marketplace)

**Situação:** bloqueio externo · **Requisitos:** ORA-MKTPL-001 a 008

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: autenticação e autorização em developers.mercadolivre.com.br, consultada em 06/11; o resto a conferir ao ligar |
| Operações necessárias | A autorização da conta, o catálogo e os anúncios, o preço, o estoque, os pedidos, os cancelamentos, as devoluções, os repasses e as notificações |
| O que já existe | Os códigos do canal em cada variação; os pedidos por arquivo do canal, sem repetir pedido, com o lucro (MKTPL-a) e os canais lado a lado (CANAIS-a); o adaptador escrito e desligado (apps/worker/src/marketplaces/adaptadores.ts) |
| Código que falta | O adaptador oficial: a autorização, o catálogo, o preço, o estoque, os pedidos, os cancelamentos, as devoluções e os repasses, com o monitoramento. O arquivo não encerra a automação pedida |
| Acesso ou contrato que falta | A conta de desenvolvedor, o app aprovado e a autorização da conta vendedora |
| Variáveis (só os nomes) | `MERCADOLIVRE_APP_ID`, `MERCADOLIVRE_CLIENT_SECRET`, `MERCADOLIVRE_REDIRECT_URI`, `MERCADOLIVRE_WEBHOOK_PATH` |
| Ambiente de teste | A confirmar no portal do canal |
| Autenticação | OAuth com token de 6 horas renovado (documentação oficial), guardado criptografado no banco; o endereço de retorno idêntico ao cadastrado |
| Limites | A confirmar na documentação do canal |
| Idempotência | O pedido do canal entra uma vez (pelo código do pedido, já no arquivo) |
| Aviso (webhook) ou reconsulta | O aviso do canal leva à reconsulta do recurso avisado |
| Conciliação | O repasse do canal contra o pedido; hoje pelo arquivo |
| Testes | apps/worker/src/marketplaces/adaptadores.test.ts; os testes da importação por arquivo |
| Publicação | A importação por arquivo está no ar (/relatorios/marketplaces e /relatorios/canais) |
| Homologação | Não homologado |

### Shopee (marketplace)

**Situação:** bloqueio externo · **Requisitos:** ORA-MKTPL-001 a 008

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: Shopee Open Platform (cadastro de parceiro); a conferir ao ligar |
| Operações necessárias | A autorização da conta, o catálogo e os anúncios, o preço, o estoque, os pedidos, os cancelamentos, as devoluções, os repasses e as notificações |
| O que já existe | Os códigos do canal em cada variação; os pedidos por arquivo do canal, sem repetir pedido, com o lucro (MKTPL-a) e os canais lado a lado (CANAIS-a); o adaptador escrito e desligado (apps/worker/src/marketplaces/adaptadores.ts) |
| Código que falta | O adaptador oficial: a autorização, o catálogo, o preço, o estoque, os pedidos, os cancelamentos, as devoluções e os repasses, com o monitoramento. O arquivo não encerra a automação pedida |
| Acesso ou contrato que falta | A conta de desenvolvedor, o app aprovado e a autorização da conta vendedora |
| Variáveis (só os nomes) | `SHOPEE_ENVIRONMENT`, `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URI` |
| Ambiente de teste | A confirmar no portal do canal |
| Autenticação | Parceiro aprovado pela Shopee; cada loja autoriza o app (shop_id e tokens) |
| Limites | A confirmar na documentação do canal |
| Idempotência | O pedido do canal entra uma vez (pelo código do pedido, já no arquivo) |
| Aviso (webhook) ou reconsulta | O aviso do canal leva à reconsulta do recurso avisado |
| Conciliação | O repasse do canal contra o pedido; hoje pelo arquivo |
| Testes | apps/worker/src/marketplaces/adaptadores.test.ts; os testes da importação por arquivo |
| Publicação | A importação por arquivo está no ar (/relatorios/marketplaces e /relatorios/canais) |
| Homologação | Não homologado |

### TikTok Shop (marketplace)

**Situação:** bloqueio externo · **Requisitos:** ORA-MKTPL-001 a 008

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: TikTok Shop Partner Center; os detalhes (inclusive a assinatura do aviso) a confirmar |
| Operações necessárias | A autorização da conta, o catálogo e os anúncios, o preço, o estoque, os pedidos, os cancelamentos, as devoluções, os repasses e as notificações |
| O que já existe | Os códigos do canal em cada variação; os pedidos por arquivo do canal, sem repetir pedido, com o lucro (MKTPL-a) e os canais lado a lado (CANAIS-a); o adaptador escrito e desligado (apps/worker/src/marketplaces/adaptadores.ts) |
| Código que falta | O adaptador oficial: a autorização, o catálogo, o preço, o estoque, os pedidos, os cancelamentos, as devoluções e os repasses, com o monitoramento. O arquivo não encerra a automação pedida |
| Acesso ou contrato que falta | A conta de desenvolvedor, o app aprovado e a autorização da conta vendedora |
| Variáveis (só os nomes) | `TIKTOKSHOP_APP_KEY`, `TIKTOKSHOP_APP_SECRET`, `TIKTOKSHOP_SERVICE_ID`, `TIKTOKSHOP_REDIRECT_URI` |
| Ambiente de teste | A confirmar no portal do canal |
| Autenticação | App no Partner Center; cada loja autoriza e gera o token |
| Limites | A confirmar na documentação do canal |
| Idempotência | O pedido do canal entra uma vez (pelo código do pedido, já no arquivo) |
| Aviso (webhook) ou reconsulta | O aviso do canal leva à reconsulta do recurso avisado |
| Conciliação | O repasse do canal contra o pedido; hoje pelo arquivo |
| Testes | apps/worker/src/marketplaces/adaptadores.test.ts; os testes da importação por arquivo |
| Publicação | A importação por arquivo está no ar (/relatorios/marketplaces e /relatorios/canais) |
| Homologação | Não homologado |

### Meta: gasto e atribuição dos anúncios (Marketing API)

**Situação:** bloqueio externo · **Requisitos:** ORA-META-001, 003, 004 e 006

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: Marketing API da Meta, a conferir ao ligar (nada implementado contra ela) |
| Operações necessárias | Importar o gasto por campanha e por dia; a atribuição às reservas e às vendas. Atribuição não prova causa |
| O que já existe | A origem e a campanha (UTM) da reserva do site (MKT-a); o gasto por arquivo do Gerenciador, com CPL, CPA, ROAS, margem e CAC e as devoluções (META-a, AUD-a) |
| Código que falta | A importação automática do gasto pela API |
| Acesso ou contrato que falta | A verificação da empresa na Meta e o acesso à conta de anúncios |
| Variáveis (só os nomes) | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_IDS` |
| Ambiente de teste | A conta de anúncios real, só leitura |
| Autenticação | O token de usuário do sistema |
| Limites | A confirmar |
| Idempotência | O mesmo dia e a mesma campanha entram uma vez (como no arquivo) |
| Aviso (webhook) ou reconsulta | Leitura periódica, sem aviso |
| Conciliação | O gasto contra o extrato da conta de anúncios |
| Testes | Os testes da importação por arquivo e do painel |
| Publicação | O painel por arquivo está no ar (/relatorios/anuncios) |
| Homologação | Não homologado |

### Meta: eventos de conversão (Conversions API)

**Situação:** bloqueio externo · **Requisitos:** ORA-META-005

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: Conversions API da Meta, a conferir ao ligar |
| Operações necessárias | Mandar à Meta que um contato virou venda, só com a base legal e o consentimento |
| O que já existe | A interface, o formato comum do evento e a regra de quais eventos podem sair, desligados (apps/worker/src/meta/conversoes.ts; ADR-020) |
| Código que falta | O adaptador oficial e a fila dos eventos |
| Acesso ou contrato que falta | A conta de anúncios, a autorização e a base legal (D-022 e D-048) |
| Variáveis (só os nomes) | `META_APP_ID`, `META_SYSTEM_USER_TOKEN`, `META_PIXEL_ID` |
| Ambiente de teste | O evento de teste do pixel (a confirmar ao ligar) |
| Autenticação | O token de usuário do sistema |
| Limites | A confirmar |
| Idempotência | O mesmo evento (o mesmo identificador) não sai duas vezes |
| Aviso (webhook) ou reconsulta | Não se aplica (envio) |
| Conciliação | Não se aplica |
| Testes | apps/worker/src/meta/conversoes.test.ts |
| Publicação | Nada ligado |
| Homologação | Não homologado |

### Meta: comércio (catálogo no Facebook e no Instagram)

**Situação:** não iniciado · **Requisitos:** O comércio pedido na orientação de 18/11, separado dos anúncios e das conversões

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | A conferir na documentação oficial da Meta ao iniciar |
| Operações necessárias | Publicar o catálogo, o preço e a disponibilidade |
| O que já existe | Nada; a vitrine do site existe (/loja) |
| Código que falta | Tudo, depois do acesso |
| Acesso ou contrato que falta | A verificação da empresa e o gerenciador de comércio |
| Variáveis (só os nomes) | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN` |
| Ambiente de teste | A confirmar |
| Autenticação | O token de usuário do sistema |
| Limites | A confirmar |
| Idempotência | A projetar |
| Aviso (webhook) ou reconsulta | A confirmar |
| Conciliação | A projetar |
| Testes | Nenhum |
| Publicação | Nada |
| Homologação | Não homologado |

### Avisos no celular (Web Push)

**Situação:** homologado · **Requisitos:** O item 7 da onda 1 do plano (o dono aprova em um toque) e o aviso fora da tela do ORA-QUAL-006

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Os padrões oficiais RFC 8291 e RFC 8188 (a cifra) e RFC 8292 (VAPID), implementados com o próprio Node e conferidos byte a byte com o exemplo da RFC (ADR-014) |
| Operações necessárias | Inscrever cada celular, mandar o aviso e retirar a inscrição que expirou |
| O que já existe | A inscrição em Minha conta, a fila no banco e o worker dos avisos (apps/worker/src/avisos), agendado a cada minuto desde 17/11 16:32 |
| Código que falta | Nada para o aviso de teste; as aprovações reais aparecem quando houver aprovações |
| Acesso ou contrato que falta | Nada (as quatro WEB_PUSH_* preenchidas, conferido só pelos nomes em 18/11) |
| Variáveis (só os nomes) | `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `WEB_PUSH_SEGREDO_DA_FILA` |
| Ambiente de teste | O próprio celular do dono |
| Autenticação | Chaves VAPID geradas no servidor; o segredo da fila só no worker |
| Limites | Os do serviço de push de cada navegador |
| Idempotência | Cada aviso da fila sai uma vez |
| Aviso (webhook) ou reconsulta | A inscrição expirada é retirada pela resposta do serviço de push |
| Conciliação | Não se aplica |
| Testes | apps/worker/src/avisos/*.test.ts |
| Publicação | No ar desde 17/11 |
| Homologação | O lote PWA-b aceito pelo proprietário em 17/11 (o aviso de teste) |

### E-mail de envio (SMTP)

**Situação:** configuração pendente · **Requisitos:** O convite de gente nova e o "esqueci minha senha" (ORA-ORG), os comprovantes por e-mail (opcionais)

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Oficial: o SMTP próprio no Supabase (supabase.com/docs, auth-smtp), conferido em 06/11 |
| Operações necessárias | Mandar o convite, a troca de senha e, opcionalmente, o comprovante |
| O que já existe | Os modelos com o link que funciona em qualquer celular (/auth/confirmar); o worker de identidade |
| Código que falta | Nada |
| Acesso ou contrato que falta | A caixa nao-responda@ora5g.com.br no cPanel e o SMTP no painel do Supabase, com os dois modelos de e-mail |
| Variáveis (só os nomes) | `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |
| Ambiente de teste | Um e-mail de teste do próprio dono |
| Autenticação | Usuário e senha do SMTP, no painel do Supabase |
| Limites | Os do provedor do e-mail |
| Idempotência | O convite repetido não duplica a pessoa |
| Aviso (webhook) ou reconsulta | Não se aplica |
| Conciliação | Não se aplica |
| Testes | apps/worker/src/identidade.test.ts |
| Publicação | O convite funciona até o envio do e-mail, que espera o SMTP |
| Homologação | Não homologado |

### Maquininhas PicPay POS e PagSeguro

**Situação:** configuração pendente · **Requisitos:** ORA-PAY-009, ORA-PAY-010, ORA-PAY-013

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Sem API por decisão do projeto (DEC-U28, DEC-U29): automatizar exige contrato oficial |
| Operações necessárias | Registrar o comprovante e conciliar pelo extrato |
| O que já existe | O registro do comprovante no PDV (L7a) e o extrato por arquivo com a conciliação assistida (EXT-a) |
| Código que falta | Nada por arquivo; a API, só com contrato |
| Acesso ou contrato que falta | Um extrato real de cada maquininha, como arquivo (18/11: nenhum carregado) |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | Um extrato real com dados de teste |
| Autenticação | Não se aplica (arquivo) |
| Limites | Não se aplica |
| Idempotência | A mesma linha do extrato entra uma vez |
| Aviso (webhook) ou reconsulta | Não se aplica |
| Conciliação | O bruto, as taxas, o líquido e o que ainda vai cair, linha a linha (EXT-a) |
| Testes | Os testes dos extratos no banco e nas telas |
| Publicação | No ar (/pagamentos/extratos) |
| Homologação | Não homologado (falta o primeiro extrato real) |

### Extratos do banco e Pix

**Situação:** configuração pendente · **Requisitos:** ORA-FIN-006 e o Pix direto (D-011)

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | O extrato por arquivo (CSV, Excel ou OFX); a API Pix do banco só com a decisão D-011 |
| Operações necessárias | Conciliar o que caiu na conta |
| O que já existe | O extrato por arquivo e a conciliação assistida (EXT-a); cada linha com um uso só: uma venda, um repasse de marketplace ou fora da conta (AUD-c) |
| Código que falta | Nada por arquivo; a API Pix, só com a D-011 |
| Acesso ou contrato que falta | Um extrato real do banco; a decisão D-011 para a API |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | Um extrato real |
| Autenticação | Não se aplica (arquivo); a API Pix pede certificado próprio |
| Limites | Não se aplica |
| Idempotência | A mesma linha do extrato entra uma vez e tem um uso só (AUD-c); repetir a conciliação ou o repasse devolve o que já estava gravado |
| Aviso (webhook) ou reconsulta | Não se aplica |
| Conciliação | Por linha do extrato (EXT-a) |
| Testes | Os testes dos extratos e os da linha com um uso só, inclusive com duas conexões num PostgreSQL de verdade (packages/banco/src/extratos.test.ts e linha-do-extrato-um-uso*.test.ts) |
| Publicação | No ar (/pagamentos/extratos) |
| Homologação | Não homologado |

### Frete, etiqueta e rastreio da loja online

**Situação:** bloqueio externo · **Requisitos:** O frete e a entrega do ORA-ONLINE-004

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Nenhuma: a transportadora não foi escolhida |
| Operações necessárias | Cotar o frete, gerar a etiqueta, rastrear e devolver |
| O que já existe | A retirada na loja, com a reserva de 24 horas (ONLINE-b) e o pedido do site (ONLINE-d) |
| Código que falta | Tudo do frete, depois da escolha |
| Acesso ou contrato que falta | As decisões P10 e D-025 (o CNPJ da nota online, de onde sai o estoque, a transportadora) |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A confirmar |
| Autenticação | A confirmar |
| Limites | A confirmar |
| Idempotência | A projetar |
| Aviso (webhook) ou reconsulta | A confirmar |
| Conciliação | A projetar |
| Testes | Os testes da retirada na loja |
| Publicação | A retirada na loja está no ar |
| Homologação | Não homologado |

### Rein (sistema atual)

**Situação:** publicado · **Requisitos:** ORA-CAT-002 e ORA-INV-004

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Sem API por decisão do projeto: só o arquivo de importação |
| Operações necessárias | Importar produtos, preços e o estoque de cada loja pela planilha |
| O que já existe | A importação do catálogo (REIN-a, AUD-b) e a carga do estoque por loja com prévia, decisão e aprovação (REIN-b, REIN-c); a leitura do relatório de verdade, provada com o arquivo original (REIN-d) |
| Código que falta | Nada para a importação nem para a carga |
| Acesso ou contrato que falta | As decisões do proprietário (a tabela de preço, o tipo das famílias e o código do produto) e o sim dele para a prévia; a planilha chegou em 23/11 e fica em ~/entrada/rein/, fora do GitHub |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A própria planilha, primeiro na prévia |
| Autenticação | Não se aplica |
| Limites | 5 MB e 10.000 linhas por arquivo; 3.000 produtos por loja |
| Idempotência | O mesmo arquivo da mesma loja devolve a mesma prévia; o aplicado não se aplica de novo |
| Aviso (webhook) ou reconsulta | Não se aplica |
| Conciliação | A data de corte, o saldo no sistema na data e a decisão de cada diferença |
| Testes | apps/plataforma/src/lib/importacao (com a prova do arquivo original, só no servidor) e lib/estoque; packages/banco/src/estoque-carga.test.ts |
| Publicação | No ar |
| Homologação | Não homologado (falta a importação de verdade e o aceite) |

### IA (atendimento e análises)

**Situação:** não iniciado · **Requisitos:** A camada de IA do plano (D-030)

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Fornecedor não escolhido |
| Operações necessárias | Resumir, sugerir e apoiar o atendimento; nunca autorizar pagamento, desconto, crédito, nota ou ativação |
| O que já existe | Nada |
| Código que falta | Tudo, depois da escolha |
| Acesso ou contrato que falta | O fornecedor e o orçamento (D-030) |
| Variáveis (só os nomes) | Nenhuma ainda: os nomes entram com o contrato e o adaptador (nada inventado) |
| Ambiente de teste | A definir |
| Autenticação | A definir |
| Limites | A definir |
| Idempotência | Não se aplica |
| Aviso (webhook) ou reconsulta | Não se aplica |
| Conciliação | Não se aplica |
| Testes | Nenhum |
| Publicação | Nada |
| Homologação | Não homologado |

### Monitoramento de erros

**Situação:** não iniciado · **Requisitos:** A observabilidade antes da produção

| Coluna | Detalhe |
|---|---|
| Documentação oficial e revisão | Opcional; o fornecedor a decidir antes da produção |
| Operações necessárias | Receber os erros do aplicativo e do worker |
| O que já existe | O log de tempos (ORA_MEDIR_TEMPOS) e a página /saude |
| Código que falta | A ligação com o fornecedor, se escolhido |
| Acesso ou contrato que falta | A escolha (opcional) |
| Variáveis (só os nomes) | `SENTRY_DSN` |
| Ambiente de teste | A homologação |
| Autenticação | O endereço do projeto no fornecedor |
| Limites | Os do plano do fornecedor |
| Idempotência | Não se aplica |
| Aviso (webhook) ou reconsulta | Não se aplica |
| Conciliação | Não se aplica |
| Testes | Os testes da /saude |
| Publicação | A /saude está no ar |
| Homologação | Não homologado |
