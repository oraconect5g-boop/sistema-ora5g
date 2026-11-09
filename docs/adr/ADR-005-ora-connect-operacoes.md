# ADR-005 — Ora Connect: operações telecom persistentes e adaptador Nogle no servidor

**Data:** 08/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Aceite:** proprietário
**Status:** **proposto**. Aplicado só no **desenvolvimento** (dados fictícios). **Nenhuma chamada real à Nogle foi feita**: faltam as credenciais no servidor, o tipo da chave (P9) e a homologação com linha de teste. Pode mudar por migration nova.
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
