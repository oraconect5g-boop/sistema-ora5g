# O que depende do proprietário (a lista única)

**Atualizado em:** 23/11/2026 (lote AUD-c, achado F21-03 da auditoria do Codex de 21/11) · **Por:** Claude Code (programador) · **Revisor:** Codex
**Conferido no servidor em 23/11, só pelos nomes** (`definir-chave.sh --situacao`): gravadas a chave secreta do Supabase, as quatro dos avisos no celular e a chave de acesso da Nogle (e, em 24/11, o tipo dela, `marca`, depois do primeiro login de verdade); ausentes todas as outras de fora (e-mail, fiscal, pagamento online, WhatsApp, Meta e marketplaces). Das pastas de entrada do servidor, `~/entrada/rein` tem a planilha da Rein desde 23/11 (lote REIN-d); `lojas`, `fotos` e `equipe` seguem **vazias**.

**Esta é a lista única.** Só entra aqui o que é dado, decisão ou acesso que só o proprietário (ou um fornecedor, por ele) pode dar. Erro de código não é pendência do proprietário, e o que já chegou não é pedido de novo. O detalhe técnico de cada integração fica em [`integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`](integracoes/APIS_E_HABILITACOES_NECESSARIAS.md) e na [`matriz das APIs`](integracoes/MATRIZ_DAS_APIS.md).

**Valores de chaves, senhas, tokens e certificados nunca passam pelo chat (Claude ou Codex), pelo GitHub nem por log.** Eles são gravados direto no servidor pelo comando da seção 4, ou ficam no painel do próprio fornecedor. O Codex confere só pelos **nomes**.

Tudo o que não está aqui o Claude Code faz sozinho: programação, testes, migrations no banco da homologação, publicação na homologação (já autorizada ao fim de cada lote) e as chaves geradas por nós.

---

## 0. A lista única (23/11/2026; conciliada em 24/11 com o adendo do Codex e o teste das telas)

Esta lista não é um bloqueio único: cada linha destrava uma parte, e o resto anda. Não se pede de novo o que já está decidido ou feito: o catálogo e a carga (D-053), o gateway do site (a Asaas, D-052), o endereço da loja online (`ora5g.com.br/loja`, D-024) e o bônus mensal sem comissão por venda (D-014; faltam só os valores e as faixas).

| # | O que é preciso | Para quê (o que destrava) | Quem fornece, e por onde | O que já chegou | O que falta | O que anda enquanto isso |
|---|---|---|---|---|---|---|
| A1 | Chave secreta do Supabase e contas de teste | Convites pela tela da equipe e as provas com login (ORA-ORG-006, J1 a J3) | — | **Tudo:** a chave gravada em 18/11 (só os workers a leem); 5 contas de teste (vendedor, 2 gerentes, administrador e dono), criadas em 18, 19 e 21/11 com o seu sim; as provas J1, J2 e J3 passaram no domínio | **Nada** | — |
| A2 | E-mail do sistema: a caixa `nao-responda@ora5g.com.br`, o SMTP e os dois modelos de e-mail no painel do Supabase, e o endereço do site (Site URL) | O convite de gente nova e o "esqueci minha senha" por e-mail (ORA-ORG-006) | Você: cPanel e painel do Supabase (seção 5, itens 5.1 a 5.3) | Nada | Os três passos da seção 5 | A tela **Equipe e acessos** já registra o convite, e a rotina que o envia está ligada desde 18/11; bloquear e tirar acesso funcionam. Sem o SMTP próprio, o e-mail não chega à pessoa |
| B1 | **O catálogo e o estoque de verdade: feitos em 24/11 com as suas respostas** (D-053: a TABELA NORMAL, a coluna Código, CELULARES com IMEI e o resto por quantidade; na loja online, os que têm estoque) | Manter o estoque do sistema igual ao das lojas e pôr os celulares no estoque (ORA-INV-004) | Você: exportar da Rein **um relatório de produtos novo** e, se a Rein tiver, **o relatório dos IMEIs** dos celulares de cada loja, e copiar para `~/entrada/rein/` (ou mandar na conversa, como os anteriores) | O catálogo (2.271 produtos) e o estoque das 12 lojas no banco do site; 634 acessórios na loja online (as peças de ASSISTÊNCIA fora, como você pediu) | **Só a posição do dia da virada e os IMEIs** (a escolha da tabela, do código e das famílias já está feita: D-053). O relatório de 24/11 é o mesmo de 10/11 (o número no nome do arquivo é a hora em que a Rein o gerou): o estoque no sistema é a posição de 10/11 às 13:12. Os 52 celulares com estoque só entram com o IMEI de cada um. Nas 39 linhas com mais unidades que livres para vender, entrou só o livre (a diferença espera a contagem na loja) | Tudo: o catálogo, os preços e o estoque dos acessórios já valem no sistema; a carga nova se faz desfazendo a antiga |
| B2 | Dados das 11 lojas: CNPJ, endereço, telefone e horário | A venda em cada loja de verdade, a nota e a vitrine do site (sem CNPJ a loja existe para estoque, mas não vende: ORA-ORG-001) | Você: planilha em `~/entrada/lojas/`, ou direto na tela **Lojas da rede** | Os nomes das 11 lojas e de DEFEITOS (09/11), já cadastrados. Em 24/11, o CNPJ da matriz (o que você mandou na conversa): no site antigo, ele é o da Super-Cell na Av. Manoel Ribas, 8285, que o rodapé chama de Butiatuvinha e a página Sobre, de Santa Felicidade. Você disse que é da **Butiatuvinha** e confirmou o endereço (Av. Manoel Ribas, 8285, quiosque dentro do mercado, Curitiba-PR), gravado no cadastro dela em 24/11; o CNPJ entra quando chegar o estoque novo e alguém da loja tiver acesso (D-054). Em 24/11, às 19:19, a Butiatuvinha, a Água Verde e a Almirante Tamandaré ganharam endereço e horário (9h às 21h, todos os dias) | O CNPJ e o telefone de cada loja; o endereço das outras; e dizer qual loja do sistema é cada endereço que não bate com os nomes (Santa Felicidade, São Braz e Campo Comprido). **Do lado do Claude Code (não é pendência sua):** a empresa está com a raiz de CNPJ de teste, então o sistema recusa o CNPJ de verdade de qualquer loja; trocar pela raiz da matriz que você mandou é o próximo lote de código, e a pergunta D-055 (uma loja pode usar o CNPJ de outra?) é sua. Nada é inventado | Estoque, transferência e inventário já funcionam sem o CNPJ |
| B3 | Fotos dos produtos | Distinguir produtos parecidos na venda, na busca e no site (ORA-CAT-011) | Você: pela tela **Catálogo e fotos** (do celular), ou arquivos em `~/entrada/fotos/` | **2.269 fotos** (conferido no banco em 24/11): 2.269 dos 2.277 produtos ativos e 631 dos 634 da loja online têm foto; nenhuma é ilustração; só 1 produto tem mais de uma variação | **Só as 8 que faltam** (3 delas na loja online; a tela Catálogo e fotos mostra quais) e uma conferência por amostra de que cada foto é do produto certo: a contagem não prova a correspondência. Não se usa foto de outra variação | O envio de foto está pronto e testado |
| B4 | Pessoas da loja piloto | Os logins de verdade da Santa Cândida | Você: pela tela **Equipe e acessos**, ou a lista em `~/entrada/equipe/` | Nada | Nome, loja e função de cada pessoa | As contas de teste cobrem as provas |
| C1 | Nogle (Ora Connect): quais operações liberar e uma linha e um chip de teste (o tipo da chave já se sabe: marca) | Ativação, recarga e portabilidade de verdade (ORA-CONNECT-003, 007, 008 e 011) | A Nogle, por você (o e-mail da seção 2.1). As chaves pelo comando da seção 4 | A chave de acesso (gravada em 18/11; a que você mandou pelo chat em 24/11 é a mesma), o endereço da API, as respostas da Nogle de 10/11 e, desde 24/11, o tipo da chave: **marca** (com o seu sim para só consultar, o login de verdade com a chave sozinha funcionou) | As três operações foram ligadas em 25/11, com o seu "Sim, ligue" (D-058; CONNECT-f): falta o aceite, que é a primeira ativação, a primeira recarga e a primeira portabilidade de verdade (`docs/aceite/CONNECT-f.md`). A transferência de chips já é feita pelo sistema: só o dono pede, em Chips na Nogle (CONNECT-e; D-057). **Trocar no painel da Nogle a chave que passou pelo chat (de novo em 24/11)** e gravar a nova pelo comando da seção 4, nunca no chat | O adaptador, a fila, a reconsulta e a conciliação dos relatórios estão prontos e testados com os exemplos oficiais; desde 24/11 o estoque de chips da Nogle aparece no sistema (CONNECT-d, só leitura, a cada 30 minutos); em 25/11, com o seu sim, a primeira transferência de teste (1 eSIM para a Santa Cândida) deu certo; fora ela, nada que mude algo na Nogle é feito |
| C2 | Nogle: carteira, extrato, recorrência, repasse e comissões | A conta do telecom fechada com a fonte oficial (ORA-CONNECT-009, #54) | A Nogle, por você | A resposta de que a API não traz comissões | A fonte oficial das comissões (relatório ou extrato da Nogle) e a liberação da consulta de pagamento | A produção já é conciliada com os relatórios oficiais de ativação e recarga |
| D1 | Contador e emissor fiscal | A nota emitida pelo sistema (ORA-FISC-003 a 010) | Você e o contador (o e-mail da seção 2.2) | Nada | O emissor contratado, o certificado de cada filial e as regras por operação | O pedido, a aprovação, o registro da chave de acesso, o PDF e o XML guardados já funcionam com a emissão feita no portal |
| E1 | Pagamento online: **a Asaas** (a sua escolha de 24/11; D-052; não se reabre a escolha: a PicPay e a PagBank seguem nas maquininhas) | A compra paga no site (ORA-PAY-014, ORA-ONLINE-002) | Você: criar a conta da Asaas e a **chave de teste (sandbox)**, gravar pelo comando da seção 4 (`ASAAS_AMBIENTE` = sandbox, `ASAAS_API_KEY`, `ASAAS_EMAIL_DOS_AVISOS`) e dizer **"sim"** para ligar o worker dos pagamentos. Nunca mande a chave pela conversa | O pagamento pelo site com Pix pronto e desligado (lote PAY-014a): o "Pagar agora com Pix" no pedido, o aviso da Asaas, a confirmação só pela reconsulta e o "Pago pelo site" na tela da loja | A chave de teste e o ensaio com o dinheiro de mentira do sandbox (o balcão do pedido pago, sem cobrar de novo, ficou pronto no lote PAY-014b, de 24/11). Para a maquininha PicPay avisar o sistema sozinha (ORA-PAY-013), a PicPay precisa oferecer isso em contrato | A reserva no site com pagamento na loja |
| E2 | PayJoy e Aiva: o contrato e a documentação da API de cada uma; o prazo e a taxa do repasse (P8) | A venda financiada pela API (ORA-POS-013, ORA-PAY-002) | Você, com cada financeira | Nada | Contrato, documentação e as respostas de prazo e taxa | A venda financiada à mão, a entrada separada e o repasse registrado já funcionam (prova J3-f) |
| E3 | Extratos de verdade: um de cada maquininha e um do banco, em arquivo | A conciliação conferida com o arquivo real (ORA-PAY-009, ORA-PAY-010, ORA-FIN-006) | Você: baixar no site ou no app de cada um e importar no sistema, em **Gestão → Conciliação → Extratos por arquivo → Importar extrato** | Nada (0 extratos importados) | Os arquivos; e dizer como a PicPay e a PagBank mandam o dinheiro ao banco (um depósito por dia, vários dias juntos, ou o dinheiro fica na conta delas) | A importação por arquivo e a conciliação assistida estão prontas; o defeito F21-02 foi corrigido antes do primeiro extrato real; desde o FIN-006a (24/11), o depósito agrupado da maquininha se confere com o extrato do banco, um por maquininha e por dia (a escolha que a sua resposta pode mudar) |
| F1 | WhatsApp oficial (Meta): a verificação da empresa, o número, o modelo de mensagem | O envio da nota e dos avisos pela API oficial (ORA-WHATS-001 a 008) | Você: Meta Business (seção 5, item 5.6) | Nada | A verificação (demora semanas), o número e o modelo aprovado | A fila do envio da nota está pronta e desligada; na ordem de serviço e na reserva do site, o botão que abre a conversa do WhatsApp já funciona |
| F2 | Mercado Livre, TikTok Shop e Shopee: contas de desenvolvedor | Pedidos, estoque e repasses automáticos (ORA-MKTPL-001 a 008) | Você: o cadastro em cada portal (seção 5, item 5.7) | Nada | As contas e a autorização de cada loja | Os pedidos por arquivo, o lucro por pedido e o repasse casado com o extrato já funcionam |
| F3 | Meta Ads: o acesso à conta de anúncios | O gasto dos anúncios automático e o aviso das vendas à Meta (ORA-META-001, ORA-META-005) | Você: o mesmo cadastro da Meta | Nada | O acesso | O gasto por arquivo e o painel de CPL, CPA e ROAS já funcionam |
| G | As decisões da seção 3 | Cada uma destrava a regra dela | Você | As de 18 a 21/11 (seção 3); a D-014 (bônus mensal, sem comissão por venda), a D-024 (a loja online em `ora5g.com.br/loja`), a D-052 (a Asaas), a D-053 (o catálogo) e a D-054 (o CNPJ da Butiatuvinha depois do estoque novo) | As que estão marcadas como abertas; da D-014, só os valores e as faixas do bônus; a D-055 (uma loja pode usar o CNPJ de outra?) | O sistema usa o padrão reversível escrito em cada uma |
| H | Produção: o servidor perto do banco, o banco com processador próprio e backup, e o plano do banco de teste | A operação comercial, com backup e restauração ensaiados (ORA-QUAL-005, ORA-QUAL-012), e o fim das travadas do banco de teste | Você: decisão de custo | Nada | A decisão | Tudo segue na homologação |
| I | Os aceites, **por jornada**: "J04 aceito" ou "J04 não aceito: o passo" (as 15 jornadas em `docs/aceite/JORNADAS.md`, cada uma com o caminho e os roteiros dela) | Fechar cada lote: só o seu "aceito" faz um requisito virar homologado (o requisito parcial continua parcial) | Você: percorrer uma jornada por vez e responder na conversa (a tela **Entregas do projeto** mostra a lista e o que cada lote entregou) | 1 aceito (PWA-b) | 91 roteiros sem resposta | Nenhum lote para por falta de aceite |

**Não é pendência:** as 11 lojas e DEFEITOS (decididas), Supabase e PostgreSQL (decididos), a publicação na homologação ao fim de cada lote (autorizada), as contas de teste (criadas) e a chave secreta do Supabase (gravada).

## 1. O que realmente falta (só as respostas) e o que cada uma bloqueia

O resto da lista ou já está feito, ou é tarefa do Claude Code, ou espera um contrato de fora. Ordem pelo prazo de
estabilização (a revisão do Codex de 24/11).

| Ordem | O que falta | O que bloqueia |
|---|---|---|
| 1 | O CNPJ, o telefone e o endereço de cada loja, começando pela piloto, e qual loja é cada endereço que não bate com os nomes (B2); a D-055 | A venda de verdade em cada loja, no balcão e no site (sem CNPJ a loja guarda estoque mas não vende), e a nota |
| 2 | O relatório da Rein do dia da virada e o dos IMEIs (B1) | O estoque de hoje no sistema (o carregado é de 10/11) e os celulares no estoque e na vitrine |
| 3 | As pessoas da loja piloto (B4) e o SMTP no painel do Supabase (A2) | O login de verdade da equipe, o convite e o "esqueci minha senha" por e-mail |
| 4 | As maquininhas (provedor e loja de cada uma), um extrato de cada uma e do banco (E3) e o prazo e a taxa das financeiras (P8) | A conciliação conferida com o arquivo real e a previsão do repasse |
| 5 | A chave de teste da Asaas, o e-mail dos avisos e o "sim" para ligar o worker (E1) | O Pix do site no sandbox (o balcão do pedido pago já está pronto: PAY-014b) |
| 6 | Nogle: a troca da chave que passou pelo chat (de novo em 24/11) e o aceite das operações ligadas em 25/11 (C1); o tipo da chave já se sabe (marca) | A confirmação de que a ativação, a recarga e a portabilidade de verdade funcionam (ligadas em 25/11, com o seu sim; a leitura do estoque de chips e a transferência de chips pelo sistema, só pelo dono, estão ligadas desde 24 e 25/11) |
| 7 | As regras que entram na operação: o desconto por categoria (P14), quem aprova o ajuste de estoque, a troca e os valores e faixas do bônus (D-014) | Só a regra de cada uma: até a resposta, o sistema usa o padrão reversível escrito na seção 3 (todo desconto pede aprovação, o dono aprova o ajuste) |
| 8 | Os aceites, por jornada (I) | Fechar os lotes: comece pelas jornadas da piloto (J04 transferência, J05 venda, J09 site) |
| 9 | A produção: o servidor, o banco com processador próprio e o backup (H) | A operação comercial e o fim dos erros sob carga do banco de teste (A1 e A2 do teste das telas) |
| 10 | As 8 fotos que faltam e a conferência por amostra (B3) | Distinguir produtos parecidos na venda e no site |

Os contratos de fora (fiscal, WhatsApp, Meta, marketplaces, PayJoy e Aiva pela API) seguem na lista única (D1, E2, F1 a F3): não impedem a estabilização do caixa e do estoque.

## 2. E-mails para enviar (textos prontos)

### 2.1 Nogle (API da Nogle): o tipo da chave e as perguntas que faltam

**Para:** ti@conteltelecom.com.br · **Assunto:** Integração API NOGLE: dúvidas antes da homologação (Ora 5G)

Em 24/11, com o seu sim, o sistema fez as primeiras consultas de verdade: a chave entra como **marca** (a P9 respondida) e o estoque de chips respondeu como a documentação (lote CONNECT-d). A Nogle já respondeu parte das perguntas em 10/11: o GET com os dados no corpo, o estoque e a transferência de chips, o extrato do saldo, os relatórios de ativações e recargas, e que a API não traz comissões (a lista inteira está em [`integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md`](integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md), e as respostas, na [referência, seção 3.1](integracoes/NOGLE_API_REFERENCIA.md)). O que ainda falta perguntar:

> Olá, equipe Nogle. Somos a Ora 5G. Seguimos a documentação de docs.nogle.tech, já temos a chave de acesso e recebemos as suas respostas de 10/11 (obrigado). Antes de homologar, falta confirmar:
> 1. A nossa chave entra como marca/MVNO (o login só com a chave de acesso funciona). Ela libera todas as funções da documentação, inclusive ativação, recarga, portabilidade e a transferência de chips?
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
