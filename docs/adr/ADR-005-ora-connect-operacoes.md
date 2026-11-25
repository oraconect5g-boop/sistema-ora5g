# ADR-005 — Ora Connect: operações telecom persistentes e adaptador Nogle no servidor

**Data:** 08/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Aceite:** proprietário
**Status:** **proposto**. Aplicado só no **desenvolvimento** (dados fictícios). **Nenhuma operação real foi feita**: em 24/11/2026, com o sim do proprietário, só as primeiras consultas de verdade (o login e o estoque de chips; o adendo do fim): a chave é do tipo marca (a P9 respondida). Falta a homologação das operações com linha de teste. Pode mudar por migration nova.
**Requisitos:** ORA-CONNECT-001 a 010 (011, eSIM e entrega, só no que a Nogle suportar). Depende de ADR-002 (acesso), ADR-003 (estoque com ICCID) e ADR-004 (venda e caixa). Fonte do contrato: [NOGLE_API_REFERENCIA.md](../integracoes/NOGLE_API_REFERENCIA.md) e a cópia oficial em `docs/integracoes/nogle/`.

## Resumo para o proprietário (o que você aceita)

1. **Quatro fatos separados**, cada um com seu registro: a **venda do chip** (no PDV, baixa o ICCID do estoque), o **pedido** de ativação, recarga ou portabilidade (a operação), a **resposta da Nogle** (eventos) e a **produção do vendedor** (uma por operação confirmada). A venda do chip não vira ativação, e a ativação não conta duas vezes.
2. **Só a Nogle confirma.** A operação passa por: registrada → enviando → aceita pela Nogle → **confirmada** (com a evidência da consulta: chip ativo com a linha, recarga no histórico, portabilidade com "Sucesso"), ou recusada/negada.
3. **Resultado desconhecido nunca é reenviado.** Se a Nogle não responder, ou responder de forma ambígua, a operação fica "resultado desconhecido": o sistema consulta e guarda a evidência, mas **quem decide é a gerência** (nunca quem registrou), com o motivo gravado. Assim não há ativação, recarga ou cobrança em dobro.
4. **Formas de pagamento da Nogle:** LINK (o cliente paga direto à Nogle; a loja não recebe nada) ou SALDO (a carteira pré-paga da Ora paga a Nogle). **SALDO só depois de o cliente pagar o serviço no caixa** (item de uma venda concluída). Na recarga ficam separados: valor de face (lista da Nogle), recebido na loja (venda), debitado da carteira (histórico da Nogle) e, por diferença, a receita da Ora.
5. **Plano, valor, DDD, cidade e operadora vêm das listas oficiais da Nogle**, atualizadas pelo servidor; o vendedor escolhe, não digita valor.
6. **Nada funciona antes de liberar:** cada tipo (ativação, recarga, portabilidade) é habilitado por quem gere integrações, com a evidência da homologação, e também no servidor. Sem isso a tela mostra "aguardando homologação".
7. **Dados do cliente (CPF, nascimento, endereço)** só vão à Nogle na ativação e ficam guardados só até o envio; depois fica o documento mascarado (•••.•••.789-09).
8. **Chip ativado não volta ao estoque** e **venda com operação viva não é cancelada pelo PDV**: primeiro a gerência resolve a operação.

## Decisões técnicas

- **Saída pelo worker (outbox):** a tela chama `connect_registrar` como a pessoa logada (RLS e permissões no banco). Só o worker do servidor (`apps/worker`, ADR-002 §2.5) tem as credenciais da Nogle e chama a Nogle, pelas funções `connect_worker_*` liberadas apenas ao `service_role`. Navegador e servidor web nunca veem chave nem token.
- **Estados:** `registrada`, `enviando`, `aguardando_operadora`, `resultado_desconhecido`, `confirmada`, `recusada`, `negada`, `erro_operadora`, `nao_recebida`, `cancelada`. Só `aguardando_operadora` muda sozinha com evidência; `resultado_desconhecido` e `erro_operadora` só pela gerência (`connect.gerir`, não a própria operação, motivo com 10+ caracteres).
- **Falha de rede:** sem conexão (DNS, recusa, tempo antes de conectar, TLS, login) = nada saiu → volta para a fila. Conectou e não voltou resposta = desconhecido. Worker que parou no meio (envio há mais de 5 minutos) = desconhecido. Resposta atrasada de um envio expirado ainda vale como evidência.
- **401** pede outro token uma vez (validade não documentada); **429** e login recusado devolvem à fila; **5xx** é desconhecido; erro de campo e `retorno=false` são recusa; só `{mensagem}` é ambíguo (desconhecido). Portabilidade com `retorno=false` e id preenchido (exemplo contraditório da documentação, pergunta 7) é desconhecida.
- **Evidência:** ativação por `POST /ativacao/validaIccid` (11 ativo com a linha confirma; 33 espera; 88 não prova; 22/99 erro); recarga por `GET /linhas/historico` casando a **mesma data de cadastro** devolvida no envio (o histórico não traz o id: pergunta 10); portabilidade por `GET /portabilidade/status`. Consultas com o tempo crescendo (2 min → 10 min → 1 h → 6 h).
- **GET com corpo** (25 consultas da documentação): o worker sabe mandar como documentado (node:https), mas **só liga** com `NOGLE_GET_COM_CORPO=documentado`, depois de a Nogle confirmar (pergunta 2). Até lá, essas consultas ficam "bloqueadas" e a operação espera (a ativação não depende delas).
- **Duplicidade:** chave de idempotência por organização (mesmo conteúdo devolve a mesma operação; outro conteúdo = OR004); índices únicos: um chip com uma ativação viva (inclusive confirmada), uma recarga em envio/desconhecida por linha, uma portabilidade em curso por linha doadora, um serviço pago por operação viva (OR013). Produção com `operacao_id` único.
- **Pedido só com campos documentados**, provado em teste contra a cópia oficial da coleção (tabelas de atributos e exemplos). Recarga no formato `numeros: [{numero, id_plano}]` do exemplo, que é o que a validação da API cobra (`numeros.0.numero` no exemplo de erro); `sms: "N"` (sem mensagem automática ao cliente); `sistema_origem: "Ora 5G"`.
- **Ordem das travas:** chave → venda do serviço (compartilhada) → chip (item serializado) → operação; compatível com o cancelamento da venda (venda → caixa → item).
- **Códigos:** OR011 chip do estoque ainda não vendido; OR012 operação não habilitada; OR013 operação em andamento ou feita para o mesmo chip, linha ou serviço pago (também ao cancelar venda ou devolver chip com operação viva).

## Variáveis do worker (nomes; valores só no ambiente do servidor)

`NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE` (franquia | marca | pdv), `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY` (franquia ou PDV), `NOGLE_OPERACOES_HABILITADAS` (ex.: `ativacao,recarga`), `NOGLE_GET_COM_CORPO` (`documentado` só após a Nogle confirmar), `ORA_ORGANIZACAO_ID`, `CONNECT_UFS` (UFs das cidades), além de `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY`. Sem elas o worker diz "desligado" e sai sem erro.

## Provas (sem credencial real)

- `packages/banco/src/connect.test.ts` (9 cenários F, G e I) e 2 disputas reais no PostgreSQL 17 em `concorrencia.test.ts` (dois workers; o mesmo chip por duas pessoas).
- `packages/dominio/src/nogle.test.ts` (16): pedido só com campos documentados e leitura de resposta/evidência com os exemplos oficiais.
- `apps/worker/src/connect/transporte.test.ts` (6) e `ponta-a-ponta.test.ts`: banco com todas as migrations + worker de verdade + servidor local respondendo com os exemplos oficiais: listas, venda do chip, ativação, recarga SALDO, portabilidade sem resposta (não reenviada), token renovado, produção uma vez, CPF fora dos registros.
- **Não prova a Nogle.** Homologar exige credenciais no servidor, a resposta da P9 e uma linha/chip de teste autorizados pela Nogle.

## Fora desta etapa

Compra de chip com entrega (`/compra/solicitar`), bloqueio/desbloqueio, consumo, carteira e extrato (repasses, ORA-CONNECT-009), transferência de chips entre PDVs, troca de chip (sem rota documentada, pergunta 8), comissão sobre a produção (P8/D-009), devolução de chip ou recarga (depende do contrato, D-016).

## Perguntas para o proprietário e a Nogle

1. **P9:** tipo da chave da Ora (franquia, marca/MVNO ou PDV) e quais funções ela libera.
2. **D-016 (proposta reversível aplicada):** SALDO só com o serviço já pago no caixa; LINK sem venda na loja. Confirma?
3. Para a Nogle: perguntas 2, 6, 7 e as novas 10 e 11 da [referência](../integracoes/NOGLE_API_REFERENCIA.md#3-perguntas-para-a-contel-antes-de-ligar).

## Adendo de 09/11/2026 — Revisão do Codex 9b1109e (#56–#59)

Migrations `20261109150526_correcoes_acesso_lote1` (#56) e `20261109190400_connect_evidencia_lote2` (#57–#59), aplicadas no `ora5g-dev` com md5 conferida. Regressões em `packages/banco/src/correcoes-acesso.test.ts` e `connect-lote2.test.ts`.

1. **Custo (#56):** o débito da carteira fica em `connect_operacoes_custos`, lido só com `custo.ver`. Não aparece na operação, na evidência nem nos eventos.
2. **LINK × serviço pago (#57):** serviço já recebido no caixa vai só pelo SALDO. O LINK cobraria o cliente de novo; o banco e a tela recusam.
3. **Titular na chave (#58):** o conteúdo da chave inclui um resumo do titular (nome, documento, nascimento, contatos e endereço normalizados), calculado com um segredo por organização (`privado.connect_segredos`, que ninguém de fora lê). A mesma chave com outro titular dá OR004, também depois do descarte do pedido enviado. O CPF não fica no resumo.
4. **Uma evidência, uma recarga (#59):** o histórico da linha não traz o id da recarga (pergunta 10 à Nogle), e a data de cadastro sozinha não é chave única garantida. Três situações vão para a **conferência da gerência** (resultado desconhecido, resolvido em `connect_resolver` com a evidência): duas recargas com a mesma data no histórico, outra operação da linha com a mesma data, ou recarga do histórico que já confirmou outra operação (`evidencia_chave`, única por organização). Confirmação sem as datas de cadastro e de realização não confirma.

## Adendo de 18/11/2026 — A conciliação com os relatórios oficiais (lote CONNECT-c; ORA-CONNECT-009)

**Pedida por:** a orientação do proprietário de 18/11 ("ORA-CONNECT-009 não pode ficar esquecido"; o movimento externo se liga ao registro interno, com confirmação e reconciliação; quando uma informação, como a comissão, não vem da API, registrar a limitação e a fonte oficial necessária).

**As decisões:**

1. **A fonte é o relatório oficial.** A coleção oficial de 07/11 documenta `GET /relatorios/ativacoes` e `GET /relatorios/recargas`, com `{ data_de, data_ate, page }` no corpo. A resposta traz a linha, o ICCID, o dia da operação, o plano e o valor. O domínio lê só esses campos (`lerRelatorio`, em `packages/dominio/src/nogle.ts`); o nome e o apelido do cliente não são guardados.
2. **O worker lê página por página, até a primeira vazia** (o tamanho da página não é documentado), com o máximo de 50 páginas. Se uma página falha, não se entende ou passa do máximo, **nada daquele relatório é gravado**: a conciliação pela metade esconderia diferença. O comando é `executar-connect.ts --conciliar`, com o período (`--de` e `--ate`) ou, sem ele, os 7 dias até ontem, no horário de Brasília. Ele pede o GET com corpo, que a Nogle confirmou em 10/11 (`NOGLE_GET_COM_CORPO=documentado`).
3. **O banco liga cada linha à operação local** (`connect_worker_registrar_conciliacao`, só o worker chama). Ele procura a operação do mesmo tipo, confirmada e da mesma rede, pelo ICCID ou pela linha (a do pedido ou a ativada), no mesmo dia ou no dia vizinho, porque o fuso do relatório não é documentado. Cada operação se liga a uma linha só.
4. **Os resultados:**
   - **conferida**;
   - **com valor diferente** (ligada, com outro valor);
   - **só na Nogle** (pode ser a renovação feita pelo cliente, ou uma operação fora da Ora);
   - **sem linha e sem ICCID**;
   - **só na Ora** (confirmada aqui no período e ausente do relatório).
   Nada na operação muda: a conciliação só registra.
5. **Quem vê:** quem gere a Ora Connect na rede (`connect.gerir`), em `/connect/conciliacao`. A tela mostra só o final da linha e do ICCID.

**O que fica de fora, com a dependência registrada:**

- **O extrato do saldo** (`GET /saldo/extrato`): o exemplo oficial da resposta é só o eco do pedido. Os campos que a Nogle descreveu em 10/11 entram quando a primeira resposta real os confirmar.
- **As comissões e as bonificações (os repasses):** a Nogle respondeu em 10/11 que não há na API. A fonte oficial (um relatório ou um extrato da Nogle, com o formato) precisa ser indicada pela Nogle ou pelo proprietário (D-016, #54). Nenhum valor é calculado aqui e apresentado como repasse oficial.

## Adendo de 24/11/2026: o estoque de chips da Nogle (lote CONNECT-d), só leitura

- **A primeira chamada de verdade**, autorizada pelo proprietário só para consultar: o login com a chave de acesso sozinha funcionou (`NOGLE_AUTH_KEY_TYPE=marca`), e `GET /pdv/listar`, `GET /pdv/estoque` (com o id no corpo) e `GET /linhas/estoque` responderam como os exemplos da coleção oficial ([NOGLE_API_REFERENCIA.md](../integracoes/NOGLE_API_REFERENCIA.md), seção 3.2).
- **O worker ganhou o modo `--estoque`**, agendado a cada 30 minutos, das 7h às 22h (D-056): lê a lista dos PDVs, o estoque da MVNO e o de cada PDV e entrega ao banco de uma vez (`connect_worker_gravar_estoque`). Sem a lista, nada grava; a MVNO ou o PDV que falhou fica como estava. O modo das operações (o envio, a consulta e as listas) continua fora do agendamento.
- **A correção da primeira leitura de verdade (24/11):** a lista geral (`GET /linhas/estoque`) traz o estoque virgem inteiro da MVNO, inclusive o que já está nos PDVs. Os PDVs que responderam são gravados primeiro, e a lista geral só acrescenta o que não está em nenhum PDV (migration `20261125022938_estoque_de_chips_sem_pdv`): a contagem "sem PDV" fica certa, e o PDV que falhou fica com os seus chips.
- **Minimização:** do PDV, só o id, o nome, a cidade, a UF e o estoque mínimo; do chip, só o ICCID, o tipo e a data do repasse. A lista da MVNO traz o código de ativação, o QR e o PDF de cada eSIM: o domínio os descarta antes de qualquer gravação.
- **Leitura e ligação:** o dono vê a rede toda; o administrador, os PDVs e as contagens; quem opera a Ora Connect numa loja, o PDV e os chips dela (RLS). Ligar o PDV à loja é do dono ou do administrador (`connect_ligar_pdv`), uma loja por PDV, na auditoria.
- **Fica de fora:** a transferência de chips pela API (`POST /pdv/transferir-chip-*`), que muda o estoque na Nogle e espera o sim do proprietário a cada operação, e a entrada dos chips da Nogle no livro de estoque da Ora.
- **A primeira transferência de verdade:** em 25/11/2026 às 06:04, com o sim do proprietário ("Sim, 1 eSIM"), `POST /pdv/transferir-chip-esim` com `{"id": 5233, "quantidade": 1}` respondeu HTTP 200 com `{"message": "Sucesso."}` em 0,5 s; o PDV da Santa Cândida passou de 3 para 4 eSIM (o novo termina em 431415, escolhido pela Nogle) e a leitura seguinte do sistema (nº 4) mostrou 154 eSIM sem PDV (eram 155). A resposta não diz qual eSIM foi: a transferência pelo sistema, quando vier, confirma pelo estoque do PDV lido de novo, e uma resposta que não chega vira resultado desconhecido (não se repete).

## Adendo de 25/11/2026: a transferência de chips pelo sistema (lote CONNECT-e)

- **Quem pede:** só o dono (a D-057); a função do banco confere, e cada pedido é o sim daquela operação.
- **O envio:** o worker (`--transferencias`, a cada minuto, só com `NOGLE_TRANSFERENCIAS=habilitada`) lê o estoque do PDV, envia uma vez e lê de novo. A mesma regra das operações: o que não saiu (sem conexão, sem a leitura de antes) volta para a fila; o que saiu sem resposta clara é resultado desconhecido e nunca se reenvia; o envio parado em 10 minutos também.
- **A confirmação:** pelo estoque do PDV (a resposta só diz "Sucesso."): confirmada, em parte ou, sem os chips no estoque depois do "Sucesso.", resultado desconhecido (conferir no painel da Nogle).

## Adendo de 25/11/2026: as operações ligadas, os planos no caixa e os chips no estoque (lote CONNECT-f)

- **As operações:** ligadas pelo proprietário (a D-058), com a habilitação de cada tipo no banco e `NOGLE_OPERACOES_HABILITADAS`; o worker roda a cada minuto. As regras do envio e da consulta não mudam.
- **O serviço do caixa é o plano:** cada plano da lista oficial tem a sua recarga (REC-<plano>) e a sua ativação (ATV-<plano>), com o preço da rede igual ao valor de face, mantidas pelo worker depois das listas. A operação só aceita o serviço pago do mesmo plano (OR055): a carteira da Ora paga à Nogle o valor de face do plano da operação.
- **Os chips no estoque:** os chips físicos do PDV de cada loja ligada entram no estoque da loja pelo ICCID depois de cada leitura (a D-059); a ativação de chip físico continua pedindo o chip vendido (OR011). O chip disponível no estoque e fora do PDV da loja na Nogle é divergência, para o dono conferir; nada é apagado sozinho.

## Adendo de 25/11/2026: as consultas que só leem (lote CONNECT-g)

- **O caminho:** o mesmo das operações: a tela grava o pedido no banco (`connect_consultar`, que confere quem pode) e o worker consulta a Nogle. O site continua sem a chave da Nogle.
- **O tempo:** o `--consultas` roda a cada minuto por uns 50 segundos, olhando a fila a cada 2 segundos, com a trava própria (não segura a leitura do estoque, as transferências nem as operações); a tela se atualiza sozinha enquanto espera.
- **Os dados pessoais:** o worker guarda só os campos que a tela mostra (o documento do titular mascarado; nunca o PDF do eSIM); só quem pediu vê a resposta, que é apagada depois de 24 horas (fica o registro de quem consultou o quê e quando).
- **A falha:** a consulta que a Nogle não respondeu falha com o aviso, e a pessoa pede de novo (só lê: repetir não faz mal, mas não se repete sozinha).

## Adendo de 25/11/2026: os relatórios do número e do cliente (lote CONNECT-h)

- **Em partes:** o worker monta cada relatório chamando as consultas simples (e o relatório oficial de transações filtrado pela linha); os detalhes da linha, ou o cadastro do cliente, vêm primeiro e, sem eles, o relatório para aí. A parte que falha fica marcada, sem derrubar as outras.
- **Os dados pessoais:** como no CONNECT-g (só quem pediu vê, a resposta sai em 24 horas), e o CPF ou o CNPJ do relatório do cliente sai junto (fica o mascarado, para a tela). Nada de link ou código de pagamento, termo, rua, documento inteiro ou custo na tela da loja.

## Adendo de 25/11/2026: as funções que mudam algo na Nogle (lote CONNECT-j)

- **Quem pede:** o dono e os gerentes (a D-061), na loja do turno; o PDV que já existe, só o da loja de quem pede (o dono, em todos). Cada pedido fica com quem pediu, o motivo e a auditoria.
- **O envio:** o mesmo das transferências: o worker (`--acoes`, a cada minuto, só com `NOGLE_ACOES=habilitada`) envia UMA vez; sem conexão, volta para a fila; enviado sem resposta clara, ou parado em 10 minutos, é resultado desconhecido e nunca se reenvia. O sensível (o CPF, o endereço, a senha do usuário do PDV) fica em `privado.connect_acoes_dados` só até o envio.

## Adendo de 25/11/2026: as outras consultas (lote CONNECT-i)

- **Quem consulta o quê:** a loja (quem opera a Ora Connect), o titular da linha, o CNPJ, o CEP, o rastreio da compra, o pagamento de uma solicitação e as informações da Nogle; a gerência (o dono e os gerentes), também o custo da logística e o CPF (que devolve o nome e o nascimento); quem gere a rede, o extrato e as recargas programadas da carteira, as portabilidades e as listas de linhas e de clientes. O banco confere cada uma.
- **O que fica guardado:** só os campos que a tela mostra; o documento mascarado (também dentro do apelido); a lista até ~90 KB, com o aviso do que não coube; tudo apagado em 24 horas, com o CPF e o CNPJ do parâmetro.
