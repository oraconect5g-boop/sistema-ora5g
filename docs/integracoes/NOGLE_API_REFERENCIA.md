# API NOGLE — referência completa para a Ora Connect

**Fonte oficial:** https://docs.nogle.tech/ (coleção Postman "API NOGLE").

**Nome (pedido do proprietário, 09/11/2026):** a Ora Connect usa a **API oficial da Nogle**, e não há outro fornecedor. A documentação oficial é publicada em nome da Contel Telecom, por isso o endereço (`api.conteltelecom.com.br`) e o e-mail de suporte trazem esse nome. Nas telas, nas mensagens e nestes documentos, o nome usado é **Nogle**.
**Lida por inteiro em:** 07/11/2026 · **Cópia guardada:** `docs/integracoes/nogle/colecao-postman-2026-11-07.json` (SHA-256 `002d13dab3099a95c1e018bdc9d0d63dba30adcacfa141efccdd062f29c88ead`).
**Catálogo no código:** `apps/plataforma/src/integracoes/nogle/catalogo.ts`, gerado por `node scripts/gerar-catalogo-nogle.mjs` e conferido no CI (`--conferir`).

A leitura de 06/11 (`docs/etapa-0/ETAPA_0_DECISOES_2026-11-06.md` §3) tinha visto só 22 funções. A coleção completa tem **62 funções em 16 grupos**, inclusive ativação, recarga, portabilidade, bloqueio, consumo, compra de chip com entrega, carteira e gestão de pontos de venda. Nenhuma rota abaixo foi inventada: tudo vem da cópia guardada.

## 1. Como a API funciona (o que a documentação diz)

| Item | O que está documentado |
|---|---|
| Endereço | `https://api.conteltelecom.com.br`, sempre HTTPS; REST com JSON |
| Autenticação | `POST /auth/token` devolve um token temporário (Bearer). Quando expira, pede-se outro. O tempo de validade não é informado |
| Tipos de chave | **Franquia:** `chave_acesso` + `chave_acesso_franquia`. **Marca/MVNO:** só `chave_acesso`. **PDV:** `chave_acesso` + `chave_acesso_pdv`. A documentação não diz o que cada tipo pode usar (decisão **P9**) |
| Pagamento | Ativação, recarga e compra aceitam `LINK` (link ao cliente) ou `SALDO` (carteira pré-paga da Ora na Nogle; a margem da Ora fica retida). As respostas também trazem campos de Pix, boleto e cartão |
| Suporte | ti@conteltelecom.com.br, resposta em até 12 horas úteis |
| Não documentado | ambiente de testes (sandbox), proteção contra pedido repetido (idempotência), avisos automáticos (webhooks), limites de uso, validade do token |

**Formatos de resposta** (o adaptador normaliza todos; `apps/plataforma/src/integracoes/nogle/regras.ts`, testado com os exemplos da documentação):
`{retorno, mensagem, ...}` (falha de negócio pode vir com HTTP 200 e `retorno: false`) · `{status, mensagem, data}` (atendimento e pagamento) · `{message, errors}` (validação, às vezes com HTTP 200) · `{erro}` (404) · só `{mensagem}` (ambíguo: sucesso no apelido, erro na ativação) · lista ou objeto sem envelope (FAQ, logística, saldo).

**Códigos e listas documentados:** situação do ICCID (88 virgem, 11 ativo, 33 ativação em processamento, 22 erro na ativação, 99 inválido); status de portabilidade (Aguardando confirmação, Portabilidade em andamento, Sucesso, Portabilidade negada; 3 dias úteis depois do aceite); motivos de bloqueio (PERDA, ROUBO, TROCA, BLOQUEIO DE IMEI, INADIMPLÊNCIA); motivos de cancelamento (EX após 75 dias sem recarga, PORTOUT, TROCA DE CHIP, PORTABILIDADE ENTRE MARCAS, SOLICITAÇÃO DO CLIENTE); minutos acima de 999 = ilimitados; compra de "apenas chip" com `id_plano` 88888; até 15 chips por compra.

## 2. As 62 funções e onde aparecem na Ora

"Na Ora" e "Quem" são **proposta** (validar com o proprietário e a Nogle). "Antes de repetir" é a regra da Ora para falhas: sem idempotência documentada, consultar antes de reenviar (ORA-CONNECT-010).

**Token**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Autenticação | `POST /auth/token` | Integração | Sistema | — |

**Geral**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Listar DDDs | `GET /ddds` | Ativar chip | Loja | — |
| Listar Planos | `GET /planos` | Ativar chip | Loja | — |
| Listar Planos Campanhas | `GET /planosCampanhas` | Recarga | Loja | — |
| Listar Estados | `GET /estados` | Ativar chip | Loja | — |
| Listar Cidades | `GET /cidades/UF` | Ativar chip | Loja | — |
| Logística | `GET /logistica` | Chips e entrega | Loja | — |

**Cliente**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Criar | `POST /cliente/criar` | Ativar chip | Loja | — |
| Atualizar | `PUT /cliente/atualizar` | Ativar chip | Loja | — |
| Consultar | `GET /cliente/buscar` | Ativar chip | Loja | GET com corpo |
| Linhas do Cliente | `GET /cliente/linhas` | Consultar linha | Loja | GET com corpo |
| Listar | `GET /cliente/listar` | Carteira e relatórios | Gerente e dono | GET com corpo |

**Linha**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Detalhes da linha | `GET /linhas/detalhes` | Consultar linha | Loja | GET com corpo |
| Consultar Saldo | `GET /linhas/saldo` | Consultar linha | Loja | GET com corpo |
| Histórico de Recargas | `GET /linhas/historico` | Consultar linha | Loja | GET com corpo |
| Validar Existência | `GET /linhas/verificaExistencia` | Consultar linha | Loja | GET com corpo |
| Consultar pelo ICCID | `GET /linhas/numeroPeloIccid` | Consultar linha | Loja | GET com corpo |
| Validar Titularidade | `GET /linhas/validaTitularidade` | Consultar linha | Loja | GET com corpo |
| Listar Todas | `GET /linhas/listar` | Carteira e relatórios | Gerente e dono | GET com corpo |
| Estoque Virgem | `GET /linhas/estoque` | Chips e entrega | Loja | GET com corpo |
| Recargas Solicitadas | `GET /linhas/cobrancasGeradas` | Consultar linha | Loja | GET com corpo |
| Atualizar Apelido Linha | `POST /linhas/atualizar` | Consultar linha | Loja | — |

**Histórico de consumo**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Dados | `GET /linhas/consumo/dados` | Consultar linha | Loja | GET com corpo |
| Voz | `GET /linhas/consumo/voz` | Consultar linha | Loja | GET com corpo |
| SMS | `GET /linhas/consumo/sms` | Consultar linha | Loja | GET com corpo |

**Ativação**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Ativação | `POST /ativacao/solicitar` | Ativar chip | Loja | antes de repetir: /ativacao/validaIccid, /ativacao/detalhar |
| Detalhar Ativação | `GET /ativacao/detalhar` | Ativar chip | Loja | GET com corpo |
| Verifica Plano Pago | `GET /ativacao/verificaPlanoPago` | Ativar chip | Loja | GET com corpo |
| Validar ICCID | `POST /ativacao/validaIccid` | Ativar chip | Loja | — |

**Recarga**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Solicitar Recarga | `POST /recarga/solicitar` | Recarga | Loja | antes de repetir: /linhas/historico, /linhas/cobrancasGeradas |
| Bloqueio / Desbloqueio | `POST /recarga/alterarStatusRecargaAutomatica` | Recarga | Gerente e dono | — |
| Saldo - Programar | `POST /recarga/saldo/adicionar` | Recarga | Gerente e dono | — |

**Portabilidade**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Solicitar Portabilidade | `POST /portabilidade/solicitar` | Portabilidade | Loja | antes de repetir: /portabilidade/status |
| Consultar Status | `GET /portabilidade/status` | Portabilidade | Loja | GET com corpo |
| Operadoras Disponíveis | `GET /portabilidade/operadorasDisponiveis` | Portabilidade | Loja | — |
| Reenviar SMS | `POST /portabilidade/reenviarsms` | Portabilidade | Loja | — |

**Compra**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Cadastrar Compra | `POST /compra/solicitar` | Chips e entrega | Loja | antes de repetir: /pagamento |
| Rastreio | `POST /compra/rastrear` | Chips e entrega | Loja | — |

**Atendimento**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Bloqueio | `POST /atendimento/bloqueio` | Bloqueio e atendimento | Gerente e dono | antes de repetir: /linhas/detalhes |
| Desbloqueio | `POST /atendimento/desbloqueio` | Bloqueio e atendimento | Gerente e dono | antes de repetir: /linhas/detalhes |

**Relatórios**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Portabilidades | `GET /portabilidade/listar` | Carteira e relatórios | Gerente e dono | GET com corpo |
| Ativações | `GET /relatorios/ativacoes` | Carteira e relatórios | Gerente e dono | GET com corpo |
| Recargas | `GET /relatorios/recargas` | Carteira e relatórios | Gerente e dono | GET com corpo |
| Transações | `GET /relatorios/transacoes` | Carteira e relatórios | Gerente e dono | GET com corpo |

**FAQ**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Categorias | `GET /faq/categorias` | Bloqueio e atendimento | Loja | — |
| Perguntas e Respostas | `GET /faq/categoria/X` | Bloqueio e atendimento | Loja | — |

**Validações**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| CEP | `POST /validar/cep` | Ativar chip | Loja | — |
| CPF | `POST /validar/cpf` | Ativar chip | Loja | — |
| CNPJ | `POST /validar/cnpj` | Ativar chip | Loja | — |

**Pagamento**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Pagamento | `POST /pagamento` | Recarga | Loja | — |

**Saldo**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Consulta de saldo | `GET /saldo/saldo` | Carteira e relatórios | Gerente e dono | — |
| Extrato | `GET /saldo/extrato` | Carteira e relatórios | Gerente e dono | GET com corpo |
| Recargas Programadas | `GET /saldo/programado` | Carteira e relatórios | Gerente e dono | GET com corpo |

**PDV**

| Função | Rota | Na Ora | Quem | Notas |
|---|---|---|---|---|
| Criar | `POST /pdv/cadastrar` | Integração | Administração | — |
| Novo usuário | `POST /pdv/usuario` | Integração | Administração | — |
| Inativar | `DELETE /pdv/inativar` | Integração | Administração | — |
| Atualizar | `PUT /pdv/atualizar` | Integração | Administração | — |
| Buscar Estoque | `GET /pdv/estoque` | Chips e entrega | Loja | GET com corpo |
| Listar | `GET /pdv/listar` | Integração | Administração | — |
| Transferir chip físico - unidade | `POST /pdv/transferir-chip-fisico-unidade` | Chips e entrega | Gerente e dono | — |
| Transferir chip físico - lote | `POST /pdv/transferir-chip-fisico-lote` | Chips e entrega | Gerente e dono | — |
| Transferir chip eSIM | `POST /pdv/transferir-chip-esim` | Chips e entrega | Gerente e dono | — |

## 3. Perguntas para a Nogle antes de ligar

1. **Tipo da chave da Ora (P9):** franquia, marca/MVNO ou PDV? Quais das 62 funções cada tipo libera?
2. **GET com corpo:** 25 consultas mandam os dados no corpo de um GET (`/linhas/detalhes`, `/cliente/buscar`...). A API aceita os mesmos dados como parâmetros no endereço? O `fetch` do Node e os navegadores não enviam corpo em GET.
3. **Ambiente de testes:** existe sandbox? Se não, uma linha e um chip de teste para homologar.
4. **Pedido repetido:** existe chave de idempotência ou aviso automático (webhook) de ativação, recarga e portabilidade?
5. **Validade do token** e limite de chamadas por minuto.
6. **Corpo da recarga:** a tabela pede `numero` e `id_plano`; o exemplo manda `numeros: [{ numero, id_plano }]`. Qual vale?
7. **Exemplo de portabilidade** com sucesso vem com `retorno: false`: é erro do exemplo?
8. **Troca de chip:** aparece como motivo de cancelamento, mas não há rota para pedir. Como fazer pela API?
9. **Pix, boleto e cartão:** as respostas têm esses campos, mas o pagamento documentado é `LINK` ou `SALDO`. Quais formas a Ora pode usar?
10. **Recarga sem id no histórico:** `GET /linhas/historico` não devolve o id da recarga. A Ora casa pela `data_cadastro` devolvida no envio (mesmo texto, com milissegundos). Esse casamento é seguro? Existe consulta da recarga pelo id (o `POST /pagamento` com `tipo: R` não diz se foi paga)?
11. **eSIM:** a documentação manda não enviar `iccid` e enviar `"esim": "SIM"`. A Ora envia dentro do item de `chips` (onde a resposta também traz `esim`). Está certo? O ICCID do eSIM sempre vem na resposta?
12. **Erro sem envelope:** o exemplo "Chip já está ativo." vem só com `{mensagem}` e sem o código HTTP. Qual código a API devolve nesse caso?

**Evidência para a pergunta 6:** o exemplo de erro da recarga cita o campo `numeros.0.numero`, o que indica que a validação cobra a lista `numeros`. A Ora usa a lista (ADR-005) até a Nogle confirmar.

## 3.1 Respostas da Nogle recebidas em 10/11/2026 (itens 5 a 7, enviadas pelo proprietário)

Chegaram as respostas dos itens 5, 6 e 7 de uma lista enviada pelo proprietário. Os itens 1 a 4 não vieram nesta mensagem; o item 6 cita o item 4 para dizer que **não há comissões na API**. Conferência com a coleção oficial de 07/11:

| Tema | O que a Nogle respondeu | Está na coleção oficial? | Efeito na Ora |
|---|---|---|---|
| Estoque do PDV | `GET /pdv/estoque` com `{"id": <id do PDV>}` **no corpo** devolve o estoque virgem do PDV (ICCID e tipo de chip) | Sim | Confirma o GET com corpo (pergunta 2): o worker já envia assim com `NOGLE_GET_COM_CORPO=documentado` |
| Estoque da MVNO | `GET /linhas/estoque`, com filtro `?tipo=esim` ou `?tipo=físico` | Sim | Conferência do estoque de chips da Ora com o da Nogle |
| Transferir um chip físico | `POST /pdv/transferir-chip-fisico-unidade` com `{"id": <PDV de destino>, "iccid": "…"}` | Sim | Liga a transferência interna de chips (ADR-007) ao PDV de destino na Nogle |
| Transferir eSIM | `POST /pdv/transferir-chip-esim` com `{"id": <PDV>, "quantidade": n}`; a Nogle escolhe os eSIMs disponíveis | Sim | Idem, para eSIM (por quantidade) |
| Transferir lote de chips | `POST /pdv/transferir-chip-fisico-lote` com `{"id", "iccid_inicial", "iccid_final"}` **sem o último dígito** (o verificador) | Sim | Atenção: no lote, o ICCID vai sem o dígito verificador; no envio unitário, completo |
| Extrato do saldo | `GET /saldo/extrato`: cada uso do saldo (`tipo`, `data`, `valor`, `descricao_cliente`, `linha`, `iccid`, `plano_nome`, `plano_valor`) | Sim | Conciliação do débito da carteira (custo, #56) por linha, data e valor |
| Comissões | Não há na API | — | Repasse e comissão continuam sem fonte por API (D-016/#54) |
| Renovações | `GET /relatorios/recargas` e `GET /relatorios/ativacoes`: todas as recargas e ativações, com `id`, `id_externo`, cliente, documento, ICCID, linha, plano, `plano_inicio`, `plano_fim`, `plano_valor`, `vendedor`, `pdv`, `tipo_linha`, `forma_pagto` | Sim | Acompanhar renovações e conciliar a produção; o relatório traz CPF: guardar só o necessário |
| Resultado e nova tentativa | A resposta de cada chamada diz se deu certo; a Nogle valida duplicidade de pagamentos | — | Responde em parte a pergunta 4 |
| Consulta por `uuid` | Toda ativação ou recarga devolve um `uuid`; `GET /consultaPagamento` com `{"tipo": "ATIVREC", "uuid": "…"}` devolve `status`, `data_pagamento` (**preenchida só se a ativação ou recarga deu certo**) e, no eSIM, `esim`, `activation_code_esim` e `qr_code_esim`. A Nogle diz que pode **disponibilizar** a rota | **Não**: nem a rota nem o campo `uuid` estão na coleção; os exemplos oficiais de resposta trazem só `id` e `data_cadastro` | Resolve a pergunta 10 (recarga sem id no histórico) e o #59: a confirmação passa a ser pela operação exata. **Falta confirmar** o nome e o lugar do `uuid` na resposta e a liberação da rota para a conta da Ora. Implementado desligado (`NOGLE_CONSULTA_PAGAMENTO`) até a primeira resposta real em homologação |

## 3.2 Conferido na API de verdade em 24/11/2026 (só leitura, com o sim do proprietário; lote CONNECT-d)

A primeira chamada real à Nogle, autorizada pelo proprietário só para consultas (entrar, listar os PDVs e ler o estoque de chips). Nada que muda algo na Nogle foi chamado. A chave nunca aparece em log, documento ou resposta.

| Rota | O que respondeu | Efeito na Ora |
|---|---|---|
| `POST /auth/token` com `{ chave_acesso }` sozinha | HTTP 200 com `{ retorno, mensagem, token }` | **A chave é do tipo marca** (a pergunta 1, a P9, respondida sem a Nogle): `NOGLE_AUTH_KEY_TYPE=marca`, sem chave secundária |
| `GET /pdv/listar` | `{ pdvs: [...] }` com 18 PDVs, cada um com `id`, `nome`, `razao_social`, `cnpj`, `cpf`, os contatos, o endereço, `estoque_minimo_chips`, `total_ativo` e os `usuarios` do PDV | A Ora guarda só o id, o nome, a cidade, a UF e o estoque mínimo (minimização); as 11 lojas têm o seu PDV, com o nome "SUPERCELL …" (D-056) |
| `GET /pdv/estoque` com `{ id }` no corpo | `{ total, data: [{ id, iccid, data_repasse, tipo }] }`, igual ao exemplo oficial; o tipo vem "físico" ou "eSIM" | Confirma de novo o GET com corpo; a Ora guarda o ICCID, o tipo e a data do repasse |
| `GET /linhas/estoque` | `{ retorno, mensagem, total, data: [{ id, iccid, tipo, pdf_esim, activation_code_esim, qr_code_esim }] }`: **o estoque virgem INTEIRO da MVNO, inclusive os chips que já estão nos PDVs** (em 24/11, 693 = 370 nos PDVs + 323 sem PDV) | A Ora conta como "sem PDV" só o que não está em nenhum PDV (a correção do CONNECT-d, migration `20261125022938_estoque_de_chips_sem_pdv`). **O código de ativação, o QR e o PDF do eSIM vêm na lista**: bastam para instalar o eSIM, e a Ora não os guarda |
| O filtro do estoque da MVNO | `?tipo=esim` filtra; `?tipo=fisico` (sem acento) filtra; `?tipo=físico` (com acento, como a resposta de 10/11 escreveu) devolve tudo; o mesmo filtro no corpo do GET só funcionou com `esim` | A Ora pede o estoque inteiro, sem filtro, e separa pelo tipo de cada chip |

Os tempos: o login e cada consulta levaram de 0,2 a 1,2 s; a leitura inteira (a lista, a MVNO e os 18 PDVs) leva uns 10 segundos.

## 4. O que já está pronto e o que falta

| Pronto (testado, sem chamada real) | Falta |
|---|---|
| Catálogo das 62 funções gerado da cópia oficial e conferido no CI | ~~Credenciais no ambiente do worker e resposta da P9~~: gravadas, e a P9 respondida em 24/11 (marca; a seção 3.2) |
| Regras em `packages/dominio/src/nogle.ts`: normalização, pedido só com campos documentados, leitura da resposta e da evidência, listas oficiais (testadas com os exemplos oficiais) | Respostas da Nogle às perguntas 6, 7, 11 e 12; da 10, o nome e o lugar do `uuid` na resposta e a liberação de `/consultaPagamento` |
| ADR-005: operações persistentes no banco (ativação, recarga, portabilidade), eventos, produção única, resultado desconhecido com a gerência | Homologação com linha/chip de teste autorizados pela Nogle |
| Worker no servidor (`apps/worker/src/connect/`): token, envio, consulta e listas; ponta a ponta contra servidor local com os exemplos oficiais | Compra com entrega, bloqueio, consumo, carteira/extrato e a transferência de chips (fora do ADR-005; a leitura do estoque de chips entrou no CONNECT-d, em 24/11) |
| Tela Ora Connect da demonstração (18 testes E2E) e tela real `/connect` | Agendar o worker das operações no servidor (só com a autorização do proprietário; a leitura do estoque de chips já está agendada desde 24/11, com o sim dele) |

**Nunca** colocar chaves no código, no chat ou no navegador: `NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY` e `NOGLE_SECONDARY_KEY` estão no catálogo de variáveis (`docs/integracoes/VARIAVEIS_DE_AMBIENTE.md`) e só o worker as lê. As chaves de controle do ADR-005 (`NOGLE_OPERACOES_HABILITADAS`, `NOGLE_GET_COM_CORPO`, `ORA_ORGANIZACAO_ID`, `CONNECT_UFS`) não são segredo.
