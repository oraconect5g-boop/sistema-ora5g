# O que depende do proprietário (a lista única)

**Atualizado em:** 23/11/2026 (lote AUD-c, achado F21-03 da auditoria do Codex de 21/11) · **Por:** Claude Code (programador) · **Revisor:** Codex
**Conferido no servidor em 23/11, só pelos nomes** (`definir-chave.sh --situacao`): gravadas a chave secreta do Supabase, as quatro dos avisos no celular e a chave de acesso da Nogle; ausentes todas as outras de fora (e-mail, fiscal, pagamento online, WhatsApp, Meta e marketplaces). Das pastas de entrada do servidor, `~/entrada/rein` tem a planilha da Rein desde 23/11 (lote REIN-d); `lojas`, `fotos` e `equipe` seguem **vazias**.

**Esta é a lista única.** Só entra aqui o que é dado, decisão ou acesso que só o proprietário (ou um fornecedor, por ele) pode dar. Erro de código não é pendência do proprietário, e o que já chegou não é pedido de novo. O detalhe técnico de cada integração fica em [`integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`](integracoes/APIS_E_HABILITACOES_NECESSARIAS.md) e na [`matriz das APIs`](integracoes/MATRIZ_DAS_APIS.md).

**Valores de chaves, senhas, tokens e certificados nunca passam pelo chat (Claude ou Codex), pelo GitHub nem por log.** Eles são gravados direto no servidor pelo comando da seção 4, ou ficam no painel do próprio fornecedor. O Codex confere só pelos **nomes**.

Tudo o que não está aqui o Claude Code faz sozinho: programação, testes, migrations no banco da homologação, publicação na homologação (já autorizada ao fim de cada lote) e as chaves geradas por nós.

---

## 0. A lista única (23/11/2026)

| # | O que é preciso | Para quê (o que destrava) | Quem fornece, e por onde | O que já chegou | O que falta | O que anda enquanto isso |
|---|---|---|---|---|---|---|
| A1 | Chave secreta do Supabase e contas de teste | Convites pela tela da equipe e as provas com login (ORA-ORG-006, J1 a J3) | — | **Tudo:** a chave gravada em 18/11 (só os workers a leem); 5 contas de teste (vendedor, 2 gerentes, administrador e dono), criadas em 18, 19 e 21/11 com o seu sim; as provas J1, J2 e J3 passaram no domínio | **Nada** | — |
| A2 | E-mail do sistema: a caixa `nao-responda@ora5g.com.br`, o SMTP e os dois modelos de e-mail no painel do Supabase, e o endereço do site (Site URL) | O convite de gente nova e o "esqueci minha senha" por e-mail (ORA-ORG-006) | Você: cPanel e painel do Supabase (seção 5, itens 5.1 a 5.3) | Nada | Os três passos da seção 5 | A tela **Equipe e acessos** já registra o convite, e a rotina que o envia está ligada desde 18/11; bloquear e tirar acesso funcionam. Sem o SMTP próprio, o e-mail não chega à pessoa |
| B1 | **As decisões para importar o catálogo de verdade** (a planilha `relatorioProdutos131258.xlsx` chegou em 23/11) | O catálogo real (2.271 produtos) e, depois, o estoque da loja piloto (ORA-CAT-002, ORA-INV-004) | Você: responder na conversa | A planilha (guardada no servidor, fora do GitHub) e a leitura dela provada com o arquivo original (lote REIN-d) | (1) **qual tabela de preço vale na loja:** TABELA NORMAL, MERCADO LIVRE ou NOVA TABELA; (2) **o tipo das famílias:** só "CELULARES" vem como aparelho (com IMEI); dizer se outra é aparelho ou chip, e se "ASSISTÊNCIA" é peça ou serviço; (3) **o código do produto:** o relatório tem a coluna "Código" (até 4 algarismos, em todos os produtos) e a coluna "SKU" (igual ao Código em 1.908 produtos e com um código próprio nos outros 363); dizer qual a equipe usa no balcão (a sugestão é o "Código"); (4) **o seu sim** para eu gerar a prévia com a conta de administrador de teste (você confere e aplica). **Em 23/11 você recebeu, na conversa, um resumo privado do relatório para responder:** os seus produtos mais vendidos com os três preços lado a lado, as 28 famílias com o tipo que eu usaria e as duas colunas de código (o arquivo fica no servidor, fora do GitHub) | O caminho inteiro foi ensaiado num banco de teste em memória: 2.271 produtos sem linha com erro; a Santa Cândida com 227 produtos que entram (2.018 unidades) e 6 celulares que pedem o IMEI. O estoque se carrega com um relatório do dia em que a loja começar a usar o sistema |
| B2 | Dados das 11 lojas: CNPJ, endereço, telefone e horário | A venda em cada loja de verdade, a nota e a vitrine do site (sem CNPJ a loja existe para estoque, mas não vende: ORA-ORG-001) | Você: planilha em `~/entrada/lojas/`, ou direto na tela **Lojas da rede** | Os nomes das 11 lojas e de DEFEITOS (09/11), já cadastrados | CNPJ, endereço, telefone e horário de cada uma. Nada é inventado | Estoque, transferência e inventário já funcionam sem o CNPJ |
| B3 | Fotos dos produtos | Distinguir produtos parecidos na venda, na busca e no site (ORA-CAT-011) | Você: pela tela **Catálogo e fotos** (do celular), ou arquivos em `~/entrada/fotos/` | Nada (0 fotos) | As fotos de verdade de cada produto e variação. Não se usa foto de outra variação | O envio de foto está pronto e testado |
| B4 | Pessoas da loja piloto | Os logins de verdade da Santa Cândida | Você: pela tela **Equipe e acessos**, ou a lista em `~/entrada/equipe/` | Nada | Nome, loja e função de cada pessoa | As contas de teste cobrem as provas |
| C1 | Nogle (Ora Connect): o tipo da chave, a segunda chave se houver, e quais operações liberar | Ativação, recarga e portabilidade de verdade (ORA-CONNECT-003, 007, 008 e 011) | A Nogle, por você (o e-mail da seção 2.1). As chaves pelo comando da seção 4 | A chave de acesso (gravada em 18/11), o endereço da API e as respostas da Nogle de 10/11 | Dizer se a chave é de franquia, marca ou PDV (`NOGLE_AUTH_KEY_TYPE`); a segunda chave, se o tipo pedir (`NOGLE_SECONDARY_KEY`); quais operações ligar (`NOGLE_OPERACOES_HABILITADAS`); uma linha e um chip de teste. **Trocar no painel da Nogle as chaves que passaram pelo chat** e gravar as novas pelo comando | O adaptador, a fila, a reconsulta e a conciliação dos relatórios estão prontos e testados com os exemplos oficiais; nenhuma operação real é feita |
| C2 | Nogle: carteira, extrato, recorrência, repasse e comissões | A conta do telecom fechada com a fonte oficial (ORA-CONNECT-009, #54) | A Nogle, por você | A resposta de que a API não traz comissões | A fonte oficial das comissões (relatório ou extrato da Nogle) e a liberação da consulta de pagamento | A produção já é conciliada com os relatórios oficiais de ativação e recarga |
| D1 | Contador e emissor fiscal | A nota emitida pelo sistema (ORA-FISC-003 a 010) | Você e o contador (o e-mail da seção 2.2) | Nada | O emissor contratado, o certificado de cada filial e as regras por operação | O pedido, a aprovação, o registro da chave de acesso, o PDF e o XML guardados já funcionam com a emissão feita no portal |
| E1 | Pagamento online: PicPay, PagBank ou os dois | A compra paga no site e o link de pagamento (ORA-PAY-014, ORA-ONLINE-002) | Você: a escolha e a credencial do escolhido (seção 4) | Nada | A escolha e a credencial. Para a maquininha PicPay avisar o sistema sozinha (ORA-PAY-013), a PicPay precisa oferecer isso em contrato: sem a documentação dela, nada é programado | A reserva no site com pagamento na loja; a regra que só confirma depois de reconsultar o provedor; na loja, a conferência pelo comprovante e pelo extrato |
| E2 | PayJoy e Aiva: o contrato e a documentação da API de cada uma; o prazo e a taxa do repasse (P8) | A venda financiada pela API (ORA-POS-013, ORA-PAY-002) | Você, com cada financeira | Nada | Contrato, documentação e as respostas de prazo e taxa | A venda financiada à mão, a entrada separada e o repasse registrado já funcionam (prova J3-f) |
| E3 | Extratos de verdade: um de cada maquininha e um do banco, em arquivo | A conciliação conferida com o arquivo real (ORA-PAY-009, ORA-PAY-010, ORA-FIN-006) | Você: baixar no site ou no app de cada um e importar no sistema, em **Gestão → Conciliação → Extratos por arquivo → Importar extrato** | Nada (0 extratos importados) | Os arquivos | A importação por arquivo e a conciliação assistida estão prontas; o defeito F21-02 foi corrigido antes do primeiro extrato real |
| F1 | WhatsApp oficial (Meta): a verificação da empresa, o número, o modelo de mensagem | O envio da nota e dos avisos pela API oficial (ORA-WHATS-001 a 008) | Você: Meta Business (seção 5, item 5.6) | Nada | A verificação (demora semanas), o número e o modelo aprovado | A fila do envio da nota está pronta e desligada; na ordem de serviço e na reserva do site, o botão que abre a conversa do WhatsApp já funciona |
| F2 | Mercado Livre, TikTok Shop e Shopee: contas de desenvolvedor | Pedidos, estoque e repasses automáticos (ORA-MKTPL-001 a 008) | Você: o cadastro em cada portal (seção 5, item 5.7) | Nada | As contas e a autorização de cada loja | Os pedidos por arquivo, o lucro por pedido e o repasse casado com o extrato já funcionam |
| F3 | Meta Ads: o acesso à conta de anúncios | O gasto dos anúncios automático e o aviso das vendas à Meta (ORA-META-001, ORA-META-005) | Você: o mesmo cadastro da Meta | Nada | O acesso | O gasto por arquivo e o painel de CPL, CPA e ROAS já funcionam |
| G | As decisões da seção 3 | Cada uma destrava a regra dela | Você | As de 18 a 21/11 (seção 3) | As que estão marcadas como abertas | O sistema usa o padrão reversível escrito em cada uma |
| H | Produção: o servidor perto do banco, o banco com processador próprio e backup, e o plano do banco de teste | A operação comercial, com backup e restauração ensaiados (ORA-QUAL-005, ORA-QUAL-012), e o fim das travadas do banco de teste | Você: decisão de custo | Nada | A decisão | Tudo segue na homologação |
| I | Os aceites: "aceito" ou "não aceito" em cada roteiro de `docs/aceite/` | Fechar cada lote: só o seu "aceito" faz um requisito virar homologado | Você: seguir o roteiro e responder na conversa (a tela **Entregas do projeto** mostra a lista e o que cada lote entregou) | 1 aceito (PWA-b) | 75 roteiros sem resposta | Nenhum lote para por falta de aceite |

**Não é pendência:** as 11 lojas e DEFEITOS (decididas), Supabase e PostgreSQL (decididos), a publicação na homologação ao fim de cada lote (autorizada), as contas de teste (criadas) e a chave secreta do Supabase (gravada).

## 1. Por onde começar (o que destrava mais)

| Ordem | O quê | Por quê |
|---|---|---|
| 1 | Copiar a planilha da Rein para `~/entrada/rein/` (B1) | É o que falta para provar a leitura com o arquivo original e pôr o catálogo de verdade |
| 2 | Mandar o CNPJ e o endereço das lojas (B2) | Sem o CNPJ a loja de verdade não vende |
| 3 | Responder as decisões rápidas da seção 3 marcadas com **agora** | São respostas de uma linha |
| 4 | Ligar o SMTP no painel do Supabase (A2) | Para convidar a equipe da piloto por e-mail |
| 5 | Nogle: o tipo da chave e trocar as chaves que passaram pelo chat (C1) | Para começar pelas consultas oficiais |

## 2. E-mails para enviar (textos prontos)

### 2.1 Nogle (API da Nogle): o tipo da chave e as perguntas que faltam

**Para:** ti@conteltelecom.com.br · **Assunto:** Integração API NOGLE: dúvidas antes da homologação (Ora 5G)

A Nogle já respondeu parte das perguntas em 10/11: o GET com os dados no corpo, o estoque e a transferência de chips, o extrato do saldo, os relatórios de ativações e recargas, e que a API não traz comissões (a lista inteira está em [`integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md`](integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md), e as respostas, na [referência, seção 3.1](integracoes/NOGLE_API_REFERENCIA.md)). O que ainda falta perguntar:

> Olá, equipe Nogle. Somos a Ora 5G. Seguimos a documentação de docs.nogle.tech, já temos a chave de acesso e recebemos as suas respostas de 10/11 (obrigado). Antes de homologar, falta confirmar:
> 1. Qual tipo de chave a Ora tem (franquia, marca/MVNO ou PDV), quais funções ela libera e se precisamos também de uma segunda chave?
> 2. Existe ambiente de testes? Se não, podem nos ceder uma linha e um chip de teste?
> 3. Existe aviso automático (webhook) de ativação, recarga e portabilidade?
> 4. Qual a validade do token e o limite de chamadas por minuto?
> 5. Na recarga, o corpo é `numero` + `id_plano` (como na tabela) ou a lista `numeros` (como no exemplo)?
> 6. O exemplo de portabilidade bem-sucedida vem com `retorno: false`: é engano do exemplo?
> 7. Como pedir a troca de chip pela API?
> 8. Além de LINK e SALDO, podemos usar Pix, boleto e cartão?
> 9. No eSIM, o `"esim": "SIM"` vai dentro do item de `chips`? O ICCID do eSIM sempre vem na resposta?
> 10. Quando a ativação responde só `{"mensagem": "Chip já está ativo."}`, qual é o código HTTP?
> 11. Na consulta por `uuid` (`/consultaPagamento`): em que campo da resposta da ativação e da recarga vem o `uuid`, e podem liberar essa consulta para a nossa conta?
> 12. Como a API não traz comissões, qual é a fonte oficial para conferi-las (relatório, extrato, outro)?
> 13. Como trocamos as chaves com segurança?
>
> Obrigado!

### 2.2 Contador: a nota pelo sistema

**Assunto:** Ora 5G: emissão de notas pelo sistema próprio

> Olá. Estamos implantando um sistema próprio nas 11 lojas da Ora 5G (um CNPJ raiz com uma filial por loja) e queremos que a nota seja emitida pelo sistema, por um emissor com API, depois da aprovação do dono. Precisamos da sua orientação:
> 1. Que documento cada operação exige: venda de aparelho e acessório na loja (NFC-e ou NF-e?), venda online, assistência técnica (NFS-e?), venda de chip e recarga de celular?
> 2. Regime tributário de cada filial e o que precisamos configurar (CFOP, CST/CSOSN, NCM dos produtos).
> 3. Que emissor por API você recomenda ou já usa, e o certificado digital (A1) de cada filial está em dia?
> 4. Qual o prazo legal para emitir depois da venda, para nossa aprovação interna nunca atrasar a emissão?
>
> Podemos marcar uma conversa rápida? Obrigado!

## 3. Decisões que só você pode tomar

**Abertas, para responder agora (uma linha cada):**

| # | Pergunta | O que vale enquanto não responde |
|---|---|---|
| BON | **A regra do bônus:** quanto paga cada faixa de meta, e de que medida (vendido, aparelhos, chips, acessórios, Ora Connect)? | Não há regra: o bônus aparece zerado e o fechamento do mês não tem o que fechar |
| AJU | **Quem aprova o ajuste de estoque:** só o dono, ou o gerente também, na loja dele? | Só o dono aprova; o gerente e o vendedor contam e pedem |
| P14 | **Desconto por categoria:** até quantos % o vendedor dá sem pedir, e a margem mínima de cada categoria? | Todo desconto pede aprovação do gerente ou do dono |
| D-026 | **Troca e devolução:** em quantos dias, em que estado o aparelho é aceito, devolve dinheiro ou só vale-troca? | O sistema registra e controla (a gerência decide caso a caso) |
| P8 | **Financeiras:** em quantos dias a PayJoy e a Aiva repassam, e com que taxa? Desde o lote FIN-007a (23/11), o prazo se grava na própria tela, pelo dono: **Gestão → A receber das financeiras**, em "O prazo de repasse de cada financeira" | O repasse é registrado à mão, e a taxa é a diferença para o valor a receber. Sem o prazo gravado, o sistema não chama nenhuma conta de atrasada |
| MAQ | **As maquininhas de verdade de cada loja** (qual maquininha, de qual provedor) | Nenhuma cadastrada: o PDV não pergunta qual foi usada |
| APT | **Os aparelhos da loja de teste:** a prova do financeiro pode trazer o próprio aparelho, com uma compra fictícia que não é desfeita? | A prova gasta um Galaxy A15 de teste a cada vez; sobrou um |

**Abertas, sem pressa:**

| # | Pergunta | Observação |
|---|---|---|
| P3 | No ranking, o vendedor vê o nome dos colegas ou só a própria posição? | Hoje vê os nomes |
| P5 | O técnico da assistência terá login próprio ou a gerência registra em nome dele? | Hoje a gerência registra em nome dele (prova J3-e) |
| P7 | Qual portal emite a nota hoje e de que tipo (NFC-e ou NF-e)? | E-mail 2.2 ao contador |
| P9 | O tipo da chave da Nogle | E-mail 2.1 |
| P10 | Loja online: com qual CNPJ sai a nota, de onde sai o estoque, qual transportadora | Para a entrega; a retirada na loja já funciona |
| D-016 | Recarga e ativação pagas pela carteira da Ora só depois de o cliente pagar no caixa? | Já está assim (ADR-005), reversível |
| D-006 | O gerente aprova toda nota ou só exceções? Quem pediu pode aprovar a própria? | Hoje todas passam pela fila, e a aprovação nunca segura a emissão |
| G1 | Piloto em paralelo com a Rein: quantas semanas? | [Go/no-go](operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md) |
| G2 | Se a internet da loja cair: a venda espera ou vai para o papel? Quem atende no horário da loja? | [Contingência](operacao/CONTINGENCIA_E_INCIDENTES.md) |
| D-047 | As metas de tempo no celular | [Desempenho no celular](operacao/DESEMPENHO_NO_CELULAR.md); a frente de velocidade está parada a seu pedido (20/11) |
| D-048 | LGPD com o jurídico: base legal, prazo de guarda, quem atende o titular | O relatório dos dados do titular já existe |

**Respondidas (não são pedidas de novo):** a planilha da Rein no servidor (você a mandou em 23/11; lote REIN-d); a prova no site da transferência com falta, entre as duas lojas de teste ("Sim, provar", 23/11; lote TRF-e); as duas transferências de teste da Muffato Santa, regularizadas em 23/11 com o seu "Sim, registrar" (recebidas com zero lá e devolvidas à loja de teste; lote AUD-d); as 11 lojas e DEFEITOS (09/11); o cadastro rápido do cliente com nome e WhatsApp, e-mail opcional (12/11); a transferência reserva no pedido, D-049 (18/11); o celular financiado, o chip e a entrada separados, D-050 (18/11); a demonstração dispensada e desligada, D-051 (18/11); as funcionalidades antes da velocidade (20/11); as provas que gravam, só nas lojas de teste e uma a uma (21/11).

## 4. Chaves e senhas: como gravar no servidor sem passar pelo chat

1. Pegue o valor no painel do fornecedor (a coluna "Quem fornece" abaixo).
2. Abra um terminal conectado ao servidor (usuário `dev`, porta 22022) e rode, trocando o nome:
   ```bash
   bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh NOME_DA_CHAVE
   ```
   Cole o valor quando pedir. **Ele não aparece na tela** e não fica no histórico. O comando recusa nomes fora da lista.
3. Para ver o que já está gravado (só "preenchida" ou "ausente", nunca o valor):
   ```bash
   bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh --situacao
   ```
4. Avise o Claude Code ("gravei a chave X"). Ele confere pelo nome e publica de novo para valer.

Se uma chave passar pelo chat por engano, ela é tratada como exposta: troque no painel do fornecedor e grave a nova pelo comando.

### 4.1 Situação de cada chave na homologação (conferida em 23/11, só pelos nomes)

| Nome | Para quê | Quem fornece | Em 23/11 |
|---|---|---|---|
| `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `ORA_DEMO_DESLIGADA`, `LOJA_ONLINE_ORGANIZACAO`, `ORA_ORGANIZACAO_ID` | O ambiente, o endereço e a rede | Claude | preenchidas |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Login e banco (são públicas) | Claude | preenchidas |
| `SUPABASE_SECRET_KEY` | Convites e contas (só os workers a leem) | Você (gravada em 18/11) | **preenchida** |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `WEB_PUSH_SEGREDO_DA_FILA` | Os avisos no celular | Claude gerou no servidor, com o seu sim de 17/11 | **preenchidas** |
| `NOGLE_API_BASE_URL`, `NOGLE_GET_COM_CORPO` | O endereço da API da Nogle | Claude (públicos, da documentação) | preenchidas |
| `NOGLE_ACCESS_KEY` | A chave de acesso da Nogle | Você (gravada em 18/11) | **preenchida** (a trocar: passou pelo chat) |
| `NOGLE_AUTH_KEY_TYPE`, `NOGLE_SECONDARY_KEY`, `NOGLE_OPERACOES_HABILITADAS`, `NOGLE_CONSULTA_PAGAMENTO` | O tipo da chave, a segunda chave e o que fica ligado | Você, com a resposta da Nogle (C1) | ausentes |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | E-mails mandados pelo próprio sistema | Você (hoje o e-mail do login é o do painel do Supabase: A2) | ausentes |
| `FISCAL_PROVIDER`, `FISCAL_API_BASE_URL`, `FISCAL_API_TOKEN`, `FISCAL_ENVIRONMENT` | A nota pelo sistema | Você e o contador (D1) | ausentes |
| `PICPAY_CLIENT_ID`, `PICPAY_CLIENT_SECRET`, `PICPAY_WEBHOOK_SECRET`, `PAGBANK_ENVIRONMENT`, `PAGBANK_API_TOKEN` | O pagamento online (E1) | Você | ausentes |
| `WHATSAPP_*` (seis nomes) | O WhatsApp oficial (F1) | Você, depois da verificação na Meta | ausentes |
| `META_*` (cinco nomes) | Os anúncios (F3) | Você | ausentes |
| `MERCADOLIVRE_*`, `TIKTOKSHOP_*`, `SHOPEE_*` | Os marketplaces (F2) | Você | ausentes |
| `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `DATABASE_URL`, `SENTRY_DSN` | Uso interno, só quando o código precisar | Claude gera (com o seu sim) ou pede | ausentes (ainda não usadas) |

Sem chave por decisão do projeto: a Rein (só arquivo) e as maquininhas PicPay e PagSeguro (conferência pelo comprovante e pelo extrato). Os tokens de cada loja nos marketplaces ficarão no banco, criptografados. Detalhes de cada nome: [`integracoes/VARIAVEIS_DE_AMBIENTE.md`](integracoes/VARIAVEIS_DE_AMBIENTE.md).

## 5. Configurações em painéis (fora do servidor)

| # | Onde | O quê | Situação em 23/11 |
|---|---|---|---|
| 5.1 | **cPanel** (conta `wwora5`) | Criar a caixa `nao-responda@ora5g.com.br` (o remetente dos e-mails do sistema) | A fazer |
| 5.2 | **Supabase → Authentication → Emails → SMTP Settings** | Ligar o SMTP próprio com essa caixa (os dados **digitados por você no painel**). Nos modelos **Invite user** e **Reset password**, trocar o link pelo texto da seção A1 de `integracoes/APIS_E_HABILITACOES_NECESSARIAS.md` | A fazer |
| 5.3 | **Supabase → Authentication → URL Configuration** | **Site URL** = `https://ora5g.com.br` | A conferir (o Codex não viu o painel; o Claude também não) |
| 5.4 | **WHM/DNS** | O subdomínio `hml-app.ora5g.com.br`, quando quiser tirar a homologação do domínio principal | Só quando houver produção |
| 5.5 | **GitHub** | Proteger a `main` contra exclusão e push forçado | A fazer (a auditoria do Codex de 17/11, F07, achou a `main` sem proteção; a de 21/11 ainda lista a política de branches entre o que falta) |
| 5.6 | **Meta Business** | Iniciar a **verificação da empresa** (WhatsApp oficial e anúncios) | A fazer: a aprovação demora semanas |
| 5.7 | **Mercado Livre, TikTok Shop, Shopee** | O cadastro de desenvolvedor ou parceiro com a conta da empresa | A fazer: a aprovação demora |
| 5.8 | **Supabase → Authentication → Attack Protection** | Ligar a proteção contra senha vazada (pode exigir o plano Pro) | A fazer (o aviso do Supabase segue aceso em 21/11) |

## 6. Para o Codex: como usar esta lista

- Pergunte ao proprietário pelos itens da seção 1, na ordem; para as chaves (seção 4), peça só a saída de `definir-chave.sh --situacao`.
- **Não peça valores**: se o proprietário colar uma chave no chat, oriente a trocar a chave no painel do fornecedor e gravar a nova pelo comando.
- O que está publicado: `https://ora5g.com.br/saude/versao` (agora) e a branch `registro/publicacoes` (cada publicação conferida). O que foi aceito: `docs/aceite/` e a tela Entregas do projeto.
- Item concluído sai da coluna "o que falta" com a data; o Claude atualiza ao conferir no servidor.
