# Os aceites por jornada

> Arquivo GERADO por `node scripts/gerar-rastreabilidade.mjs` a partir de `docs/aceite/jornadas.json` (o mapa lote → jornada) e de `docs/alinhamento/execucao-integral-status.json` (os roteiros, os requisitos, a publicação e a resposta). Não edite à mão.

Em vez de responder roteiro por roteiro, percorra **uma jornada por vez**: o caminho dela, com os roteiros listados como apoio. Responda **"J04 aceito"** ou **"J04 não aceito: o passo e o que aconteceu"**; a resposta vale para os roteiros da jornada (o Claude Code registra em cada lote). Um lote pode aparecer em mais de uma jornada. Requisito parcial continua parcial depois do aceite: o aceite diz que o que foi entregue funciona, não que o requisito acabou. As jornadas são as da matriz J01 a J15 da revisão do Codex de 24/11 (`FLUXOS_E_ACEITE.md`, na branch `docs/revisao-visual-fluxos-20261124`).

| Jornada | Roteiros | Aceitos | Sem resposta | Requisitos (testados / parciais / outros) |
|---|---|---|---|---|
| [J01 — Acesso e loja](#j01) | 8 | 0 | 8 | 6 (1 / 5 / 0) |
| [J02 — Catálogo e fotos](#j02) | 5 | 0 | 5 | 8 (4 / 4 / 0) |
| [J03 — Estoque inicial e inventário](#j03) | 11 | 0 | 11 | 18 (7 / 11 / 0) |
| [J04 — Transferência](#j04) | 10 | 0 | 10 | 3 (1 / 2 / 0) |
| [J05 — Venda presencial](#j05) | 12 | 0 | 12 | 16 (6 / 10 / 0) |
| [J06 — Cliente e fiscal](#j06) | 4 | 0 | 4 | 20 (13 / 6 / 1) |
| [J07 — Devolução e troca](#j07) | 2 | 0 | 2 | 4 (1 / 3 / 0) |
| [J08 — Caixa e financeiro](#j08) | 13 | 0 | 13 | 22 (10 / 12 / 0) |
| [J09 — Site e retirada na loja](#j09) | 14 | 0 | 14 | 11 (2 / 9 / 0) |
| [J10 — Ora Connect](#j10) | 10 | 0 | 10 | 8 (2 / 6 / 0) |
| [J11 — Financeiras (PayJoy e Aiva)](#j11) | 5 | 0 | 5 | 10 (5 / 5 / 0) |
| [J12 — Marketplaces e Meta](#j12) | 7 | 0 | 7 | 19 (7 / 9 / 3) |
| [J13 — Assistência](#j13) | 1 | 0 | 1 | 15 (12 / 3 / 0) |
| [J14 — Metas e bônus](#j14) | 2 | 0 | 2 | 16 (12 / 4 / 0) |
| [J15 — Operação e publicação](#j15) | 15 | 1 | 14 | 19 (0 / 13 / 6) |

## J01

**Acesso e loja.** O caminho: Entrar → vínculo ativo → escolher a loja → turno → o menu do seu papel → sair.

**Os requisitos que os roteiros cobrem:** ORA-ORG-001 (🟡 parcial), ORA-ORG-004 (🟡 parcial), ORA-ORG-006 (🟡 parcial), ORA-POS-015 (🧪 testado), ORA-QUAL-002 (🟡 parcial), ORA-QUAL-010 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| BANCO-a | a arrumação do banco que o Supabase aponta (Onda 0.5); o estado dos dois requisitos não muda | [BANCO-a.md](BANCO-a.md) | `0bfad91` (2026-11-17) | — |
| ORG-a | as 11 lojas e DEFEITOS no sistema, pelo cadastro operacional, sem CNPJ nem endereço inventado; a loja física sem CNPJ não vende até ele chegar (Onda 1, item 2); o estado do requisito não muda | [ORG-a.md](ORG-a.md) | `13fca19` (2026-11-17) | — |
| PWA-a | o site instalável: o Ora 5G na tela inicial do celular, em tela cheia, e a página sem internet quando a conexão cai, sem nada guardado (Onda 1, item 7, primeira parte); o estado dos dois requisitos não muda | [PWA-a.md](PWA-a.md) | `ccdf342` (2026-11-17) | — |
| VEL-c | o sino de avisos e o Início com as pendências da loja numa ida só ao banco (antes, de 17 a 29 pedidos por abertura), com a mesma permissão e o mesmo RLS | [VEL-c.md](VEL-c.md) | `3fd64b6` (2026-11-18) | — |
| J1-a | a prova #11: o login de verdade no site no ar | [J1-a.md](J1-a.md) | `5d3a8ce` (2026-11-19) | — |
| VEL-e | a sessão e o sino com as permissões numa conta só | [VEL-e.md](VEL-e.md) | `92fe105` (2026-11-19) | — |
| J2-b | as provas de acesso por papel e por loja, só lendo | [J2-b.md](J2-b.md) | `bfeff44` (2026-11-19) | — |
| VEL-h | a pré-carga mais leve e a barra de baixo à vista no celular | [VEL-h.md](VEL-h.md) | `538e9a0` (2026-11-19) | — |

## J02

**Catálogo e fotos.** O caminho: Importar ou editar → prévia → conferir código, preço e tipo → aplicar → achar o produto no PDV, no estoque e no site → foto e variação.

**Os requisitos que os roteiros cobrem:** ORA-CAT-002 (🧪 testado), ORA-INV-004 (🟡 parcial), ORA-META-003 (🧪 testado), ORA-META-004 (🧪 testado), ORA-META-006 (🧪 testado), ORA-MKTPL-005 (🟡 parcial), ORA-MKTPL-008 (🟡 parcial), ORA-QUAL-010 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| REIN-a | o importador lê a planilha de produtos da Rein inteira: a observação longa, mais de 2.000 linhas em partes e a linha de total de fora (Onda 1, item 3, a parte sem o arquivo; #89); o estado do requisito não muda | [REIN-a.md](REIN-a.md) | `03123d0` (2026-11-17) | — |
| AUD-a | o que a auditoria do Codex de 17/11 (PR #104) pediu: o rodapé da planilha da Rein (F01), os anúncios com as devoluções, a moeda e o fuso (A14) e os estados honestos (A13) | [AUD-a.md](AUD-a.md) | `3135435` (2026-11-17) | — |
| AUD-b | os achados F18-01, F18-02 e F18-04 da reanálise do Codex de 18/11: a quantidade e o dinheiro do Excel pela origem, o rodapé comprovado ou candidato com a decisão registrada, a tela de entregas e a lista de dependências | [AUD-b.md](AUD-b.md) | `bf5eaf5` (2026-11-18) | — |
| VEL-d | o Catálogo e a lista do Estoque numa ida só ao banco | [VEL-d.md](VEL-d.md) | `5d3a8ce` (2026-11-19) | — |
| REIN-d | a planilha de verdade da Rein (a que o proprietário mandou em 23/11) lida sem erro do começo ao fim: o rodapé com os totais deslocados fica de fora, a tela sugere as colunas do relatório, o custo e o preço com mais casas são arredondados com aviso, "SEM GTIN" não é código de barras, e quem importa diz o tipo de cada família (CELULARES é aparelho) | [REIN-d.md](REIN-d.md) | `329e736` (2026-11-23) | — |

## J03

**Estoque inicial e inventário.** O caminho: Arquivo com o corte → reconciliação → aprovação → livro do estoque → saldo por loja → contagem → ajuste aprovado.

**Os requisitos que os roteiros cobrem:** ORA-CAT-002 (🧪 testado), ORA-FIN-006 (🟡 parcial), ORA-INV-001 (🟡 parcial), ORA-INV-003 (🧪 testado), ORA-INV-004 (🟡 parcial), ORA-INV-005 (🧪 testado), ORA-INV-007 (🧪 testado), ORA-INV-008 (🧪 testado), ORA-INV-009 (🧪 testado), ORA-INV-012 (🟡 parcial), ORA-MKTPL-005 (🟡 parcial), ORA-ONLINE-006 (🟡 parcial), ORA-PAY-009 (🧪 testado), ORA-QUAL-006 (🟡 parcial), ORA-QUAL-010 (🟡 parcial), ORA-REPORT-001 (🟡 parcial), ORA-REPORT-002 (🟡 parcial), ORA-REPORT-005 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| ROT-a | o ORA-INV-005 inteiro (o vencimento automático das reservas); parte do ORA-ONLINE-006 e do ORA-QUAL-006, que seguem parciais mesmo com o aceite | [ROT-a.md](ROT-a.md) | `a2041b1` (2026-11-17) | — |
| REIN-b | o estoque de cada loja pelo relatório da Rein: a prévia por loja, a aprovação do dono e o livro (ADR-021) | [REIN-b.md](REIN-b.md) | `c330d0d` (2026-11-17) | — |
| AUD-b | os achados F18-01, F18-02 e F18-04 da reanálise do Codex de 18/11: a quantidade e o dinheiro do Excel pela origem, o rodapé comprovado ou candidato com a decisão registrada, a tela de entregas e a lista de dependências | [AUD-b.md](AUD-b.md) | `bf5eaf5` (2026-11-18) | — |
| REIN-c | o achado F18-03 da reanálise do Codex de 18/11: a linha com o físico maior que o disponível espera uma decisão registrada (lançar só o disponível, lançar o físico ou deixar de fora), e a carga não se aplica sem ela | [REIN-c.md](REIN-c.md) | `488844b` (2026-11-18) | — |
| CD-a | o depósito não vende (o padrão reversível da D-043): a venda e a reserva de venda recusadas no banco com OR043; a transferência que sai do depósito segue igual; a tela Lojas diz por que cada local não vende | [CD-a.md](CD-a.md) | `3839819` (2026-11-18) | — |
| VEL-d | o Catálogo e a lista do Estoque numa ida só ao banco | [VEL-d.md](VEL-d.md) | `5d3a8ce` (2026-11-19) | — |
| J2-a | as provas com login dos relatórios e do estoque, só lendo | [J2-a.md](J2-a.md) | `0434cb5` (2026-11-19) | — |
| J3-d | o estoque de ponta a ponta, com três pessoas, na loja de teste | [J3-d.md](J3-d.md) | `75fc23a` (2026-11-21) | — |
| AUD-c | os achados F21-01 a F21-03 da auditoria integral do Codex de 21/11 (PR #105): a linha do extrato com um uso só (o mesmo crédito não concilia uma venda e um repasse de marketplace), o rodapé da planilha da Rein escrito com vírgula reconhecido e o registro de cada publicação gravado depois dela, fora dos commits do aplicativo | [AUD-c.md](AUD-c.md) | `5617351` (2026-11-23) | — |
| REIN-d | a planilha de verdade da Rein (a que o proprietário mandou em 23/11) lida sem erro do começo ao fim: o rodapé com os totais deslocados fica de fora, a tela sugere as colunas do relatório, o custo e o preço com mais casas são arredondados com aviso, "SEM GTIN" não é código de barras, e quem importa diz o tipo de cada família (CELULARES é aparelho) | [REIN-d.md](REIN-d.md) | `329e736` (2026-11-23) | — |
| TRF-f | a tela de Transferências com as em andamento sempre visíveis, o histórico em páginas e a busca pelo número; o estoque com "reservado", o produto aberto sem perder a busca e o botão "Pedir a transferência" | [TRF-f.md](TRF-f.md) | `71bf338` (2026-11-24) | — |

## J04

**Transferência.** O caminho: Escolher a origem e o destino → pedir (reserva) → separar → enviar → receber → saldo e auditoria.

**Os requisitos que os roteiros cobrem:** ORA-INV-007 (🧪 testado), ORA-QUAL-006 (🟡 parcial), ORA-QUAL-010 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| TRF-a | a remessa: vários produtos na mesma transferência, cada um com o próprio caminho, e o envio de uma vez dos já separados (Onda 1, item 5; #60); o estado do requisito não muda | [TRF-a.md](TRF-a.md) | `e603531` (2026-11-17) | — |
| TRF-b | o que cada passo da transferência faz no estoque e o saldo de cada lado (o achado F10 da auditoria de 17/11; a decisão D-049 segue do proprietário) | [TRF-b.md](TRF-b.md) | `bdbd8b6` (2026-11-18) | — |
| TRF-c | o achado F18-05 da reanálise do Codex de 18/11 e a D-049 (decidida pela orientação do proprietário de 18/11): o pedido de transferência reserva na origem, sem baixa dupla; a remessa é tudo ou nada | [TRF-c.md](TRF-c.md) | `37a2b03` (2026-11-18) | — |
| J1-c | a transferência de ponta a ponta, com duas pessoas, entre as lojas de teste | [J1-c.md](J1-c.md) | `41d69f2` (2026-11-19) | — |
| J1-d | a transferência de um aparelho pelo IMEI, com duas pessoas, entre as lojas de teste | [J1-d.md](J1-d.md) | `ee9604b` (2026-11-19) | — |
| VEL-g | a tela de Transferências numa ida só ao banco | [VEL-g.md](VEL-g.md) | `5711cab` (2026-11-19) | — |
| TRF-d | o que faltou no recebimento da transferência tem destino: chegou depois (o destino confere), voltou para a origem (a origem confere) ou baixa (quem ajusta estoque na origem), em partes, com o motivo e sem lançar duas vezes (o que faltava para o achado F21-04 da auditoria do Codex de 21/11) | [TRF-d.md](TRF-d.md) | `4131453` (2026-11-23) | — |
| AUD-d | as duas transferências de teste que tinham saído para a Muffato Santa em 17/11 (uma capa e um Galaxy A15), regularizadas com o sim do proprietário de 23/11: recebidas com zero na Muffato Santa e devolvidas à Santa Cândida (teste); a Muffato Santa segue sem nenhum movimento de estoque (o achado F21-04 da auditoria do Codex de 21/11) | [AUD-d.md](AUD-d.md) | `363f844` (2026-11-23) | — |
| TRF-e | a transferência recebida com falta continua nas pendências (o Início e o sino das duas lojas, e a fila "Transferências com falta" da Saúde da operação) até tudo o que faltou ter destino; e a prova no site, entre as duas lojas de teste, dos destinos "chegou depois" e "baixa", autorizada pelo proprietário em 23/11 | [TRF-e.md](TRF-e.md) | `d2a6e4f` (2026-11-23) | — |
| TRF-f | a tela de Transferências com as em andamento sempre visíveis, o histórico em páginas e a busca pelo número; o estoque com "reservado", o produto aberto sem perder a busca e o botão "Pedir a transferência" | [TRF-f.md](TRF-f.md) | `71bf338` (2026-11-24) | — |

## J05

**Venda presencial.** O caminho: Abrir o caixa → buscar o produto → reservar o item ou o IMEI → cliente → desconto autorizado → pagamentos → concluir → comprovante.

**Os requisitos que os roteiros cobrem:** ORA-FISC-001 (🧪 testado), ORA-INV-012 (🟡 parcial), ORA-ONLINE-002 (🟡 parcial), ORA-ONLINE-006 (🟡 parcial), ORA-PAY-001 (🟡 parcial), ORA-PAY-002 (🟡 parcial), ORA-PAY-008 (🟡 parcial), ORA-PAY-014 (🟡 parcial), ORA-POS-002 (🟡 parcial), ORA-POS-005 (🧪 testado), ORA-POS-006 (🧪 testado), ORA-POS-007 (🧪 testado), ORA-POS-008 (🧪 testado), ORA-POS-013 (🟡 parcial), ORA-POS-015 (🧪 testado), ORA-QUAL-010 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| VEL-a | parte dos dois requisitos: os dois seguem parciais mesmo com o aceite | [VEL-a.md](VEL-a.md) | `087ef53` (2026-11-17) | — |
| INTEG-c | as correções dos defeitos #101 e #102 da revisão do Codex de 16/11; o estado de cada requisito não muda | [INTEG-c.md](INTEG-c.md) | `9012f7f` (2026-11-17) | — |
| VEL-b | as permissões do molde da sessão em 46 arquivos, o preço em lote na busca do PDV e o Caixa em três rodadas (ADR-010, "O que veio no VEL-b") | [VEL-b.md](VEL-b.md) | `27b4f6e` (2026-11-18) | — |
| PDV-c | as formas de pagamento por botão; a PayJoy e a Aiva com as parcelas e só sobre o celular; a entrada à parte; o cartão com as parcelas; o chip pago à parte na mesma venda; o link de pagamento só na compra online | [PDV-c.md](PDV-c.md) | `b8760d2` (2026-11-18) | — |
| CD-a | o depósito não vende (o padrão reversível da D-043): a venda e a reserva de venda recusadas no banco com OR043; a transferência que sai do depósito segue igual; a tela Lojas diz por que cada local não vende | [CD-a.md](CD-a.md) | `3839819` (2026-11-18) | — |
| J1-b | a venda de ponta a ponta no celular, na loja de teste | [J1-b.md](J1-b.md) | `a7e3501` (2026-11-19) | — |
| VND-a | o nome de quem vendeu e as vendas da loja para a rede, na lista de Vendas | [VND-a.md](VND-a.md) | `01f3587` (2026-11-19) | — |
| VEL-i | o comprovante da venda em três rodadas | [VEL-i.md](VEL-i.md) | `c76631a` (2026-11-19) | — |
| J3-b | a venda com desconto aprovado e pagamento misto, na loja de teste | [J3-b.md](J3-b.md) | `9652e20` (2026-11-21) | — |
| POS-015a | a prova, com a sessão aberta e no site de verdade, de que nada é presumido nem gravado quando a internet cai: a faixa avisa, o envio é segurado no aparelho, a navegação mostra "Sem internet agora" e, na volta, nada mudou. Nenhuma tela mudou; o roteiro é para repetir num celular da loja, sem gravar nada | [POS-015a.md](POS-015a.md) | `19ac570` (2026-11-24) | — |
| PAY-014b | no balcão, a venda do pedido pago pelo site registra o pago (pelo preço pago) sem cobrar de novo | [PAY-014b.md](PAY-014b.md) | `5fc91b6` (2026-11-24) | — |
| PAY-015a | no Vender, o cartão Pix pela Asaas: o QR Code gerado com o valor, na tela, confirmado na própria Asaas, e o pago entra sozinho na venda (o pagamento misto) | [PAY-015a.md](PAY-015a.md) | a publicar | — |

## J06

**Cliente e fiscal.** O caminho: Cadastro rápido com nome e WhatsApp → reaproveitar o cliente → completar os dados para a nota → pedido de nota → emissor → XML e PDF → envio.

**Os requisitos que os roteiros cobrem:** ORA-CRM-001 (🧪 testado), ORA-CRM-003 (🧪 testado), ORA-CRM-004 (🧪 testado), ORA-CRM-005 (🧪 testado), ORA-CRM-009 (🟡 parcial), ORA-FISC-001 (🧪 testado), ORA-FISC-002 (🧪 testado), ORA-ONLINE-006 (🟡 parcial), ORA-OS-001 (🧪 testado), ORA-OS-002 (🟡 parcial), ORA-OS-003 (🧪 testado), ORA-OS-004 (🧪 testado), ORA-OS-006 (🧪 testado), ORA-PERF-003 (🧪 testado), ORA-PERF-004 (🟡 parcial), ORA-PERF-005 (🟡 parcial), ORA-POS-008 (🧪 testado), ORA-POS-011 (🧪 testado), ORA-WHATS-001 (⛔ bloqueado), ORA-WHATS-006 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| INTEG-c | as correções dos defeitos #101 e #102 da revisão do Codex de 16/11; o estado de cada requisito não muda | [INTEG-c.md](INTEG-c.md) | `9012f7f` (2026-11-17) | — |
| WHATS-a | o executável do worker do WhatsApp, ligado à fila do banco e desligado sem a Meta (Onda 0.4); o estado dos dois requisitos não muda | [WHATS-a.md](WHATS-a.md) | `69bfab6` (2026-11-17) | — |
| J3-e | o cliente, o funil, a ordem de serviço, o pedido de nota sem emitir e as metas, na loja de teste | [J3-e.md](J3-e.md) | `b061e86` (2026-11-21) | — |
| CRM-009a | a venda que atendeu um pedido ou uma reserva do site diz de onde veio: o selo "veio do site" e a frase na tela da venda, e o pedido do site na lista de compras da ficha do cliente; a venda continua sendo do balcão, e a origem fica guardada no pedido | [CRM-009a.md](CRM-009a.md) | `7db5c6c` (2026-11-24) | — |

## J07

**Devolução e troca.** O caminho: Achar a venda → escolher os itens → retorno ou avaria → vale ou estorno → confirmar o estorno de fora → livro e caixa.

**Os requisitos que os roteiros cobrem:** ORA-PAY-003 (🟡 parcial), ORA-PAY-005 (🧪 testado), ORA-PAY-011 (🟡 parcial), ORA-POS-010 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| J3-c | cancelar e devolver, com três pessoas, na loja de teste | [J3-c.md](J3-c.md) | `75fc23a` (2026-11-21) | — |
| PAY-011a | o débito do extrato é a prova do estorno da venda, um débito por estorno: na tela do extrato, o débito confirma o estorno que esperava (pela gerência, na loja da venda) ou guarda a prova do que já estava confirmado; o chargeback fica marcado; a venda mostra qual débito confirmou o estorno. Nada é lançado duas vezes | [PAY-011a.md](PAY-011a.md) | `947a391` (2026-11-24) | — |

## J08

**Caixa e financeiro.** O caminho: Abrir o caixa → receber → sangria e suprimento → fechar → conferir → conciliar recebíveis e extrato → resultado e previsão.

**Os requisitos que os roteiros cobrem:** ORA-CAT-002 (🧪 testado), ORA-FIN-001 (🧪 testado), ORA-FIN-002 (🟡 parcial), ORA-FIN-003 (🧪 testado), ORA-FIN-004 (🧪 testado), ORA-FIN-005 (🧪 testado), ORA-FIN-006 (🟡 parcial), ORA-INV-001 (🟡 parcial), ORA-INV-004 (🟡 parcial), ORA-MKTPL-005 (🟡 parcial), ORA-PAY-002 (🟡 parcial), ORA-PAY-004 (🧪 testado), ORA-PAY-005 (🧪 testado), ORA-PAY-006 (🧪 testado), ORA-PAY-007 (🟡 parcial), ORA-PAY-009 (🧪 testado), ORA-PAY-010 (🟡 parcial), ORA-PAY-011 (🟡 parcial), ORA-REPORT-001 (🟡 parcial), ORA-REPORT-002 (🟡 parcial), ORA-REPORT-005 (🟡 parcial), ORA-REPORT-008 (🧪 testado).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| EXT-a | o extrato da maquininha e do banco por arquivo (CSV, Excel ou OFX), com a coluna de cada campo escolhida pela pessoa, a venda sugerida para cada linha, conciliar uma linha ou as certas, tirar da conta e desfazer com motivo, o bruto, as taxas, o líquido e o que vai cair, e as vendas do período sem conciliação (Onda 3, item E3; ADR-016) | [EXT-a.md](EXT-a.md) | `721e021` (2026-11-17) | — |
| CANAIS-a | os canais de venda lado a lado no mesmo período: as lojas (e, delas, o site), cada marketplace e os anúncios, com a receita, as taxas e tarifas, o líquido e a margem, sem contar duas vezes, e o resultado dos canais estimado (Onda 3; ADR-019) | [CANAIS-a.md](CANAIS-a.md) | `47f2c4f` (2026-11-17) | — |
| GRAF-a | os gráficos reais conferidos tela a tela: a falha da leitura nunca aparece como vazio, o custo e a margem só com a permissão, as exportações sem arquivo pela metade e a demonstração fora dos relatórios reais; a correção dos canais de venda | [GRAF-a.md](GRAF-a.md) | `d27dd1a` (2026-11-18) | — |
| CONTAS-a | as contas bancárias de cada empresa, com o saldo pelo extrato (o saldo inicial num dia mais as linhas dos extratos do banco ligados à conta), só para quem concilia pela rede | [CONTAS-a.md](CONTAS-a.md) | `42bd4a0` (2026-11-18) | — |
| J2-a | as provas com login dos relatórios e do estoque, só lendo | [J2-a.md](J2-a.md) | `0434cb5` (2026-11-19) | — |
| J3-a | o caixa de ponta a ponta, com duas pessoas, na loja de teste | [J3-a.md](J3-a.md) | `9652e20` (2026-11-21) | — |
| J3-f | o financeiro da loja de teste: contas a pagar, conciliação e repasse da financeira | [J3-f.md](J3-f.md) | `c1b8e60` (2026-11-21) | — |
| AUD-c | os achados F21-01 a F21-03 da auditoria integral do Codex de 21/11 (PR #105): a linha do extrato com um uso só (o mesmo crédito não concilia uma venda e um repasse de marketplace), o rodapé da planilha da Rein escrito com vírgula reconhecido e o registro de cada publicação gravado depois dela, fora dos commits do aplicativo | [AUD-c.md](AUD-c.md) | `5617351` (2026-11-23) | — |
| FIN-001a | o cartão "A conta do período" no Financeiro: as vendas concluídas no período, conferidas uma a uma com os pagamentos, o livro do caixa e o livro do estoque; quando não fecha, diz em que lado, de quanto e quais vendas abrir | [FIN-001a.md](FIN-001a.md) | `d2a4b75` (2026-11-23) | — |
| FIN-001b | a parte "O que foi desfeito no período" no cartão "A conta do período" do Financeiro: cada cancelamento e cada devolução conferidos com o destino do valor, o livro do caixa e o livro do estoque; o que espera alguém (o estorno a confirmar, o item a conferir) aparece à parte, com o atalho | [FIN-001b.md](FIN-001b.md) | `2a1f6ce` (2026-11-23) | — |
| PAY-011a | o débito do extrato é a prova do estorno da venda, um débito por estorno: na tela do extrato, o débito confirma o estorno que esperava (pela gerência, na loja da venda) ou guarda a prova do que já estava confirmado; o chargeback fica marcado; a venda mostra qual débito confirmou o estorno. Nada é lançado duas vezes | [PAY-011a.md](PAY-011a.md) | `947a391` (2026-11-24) | — |
| FIN-002a | a taxa da PayJoy e da Aiva no resultado do mês: a observada no repasse (o valor financiado menos o repassado), no mês da venda, numa linha própria do demonstrativo e da planilha; a conta sem repasse registrado fica num aviso, com o atalho para registrar | [FIN-002a.md](FIN-002a.md) | `7594a52` (2026-11-24) | — |
| FIN-006a | a tela Depósitos das maquininhas: o depósito agrupado da PicPay e da PagBank (os pagamentos com o dinheiro para o mesmo dia, pelo líquido) conferido com a linha de crédito do extrato do banco da rede; a diferença e o desfazer com o motivo; a linha com um uso só | [FIN-006a.md](FIN-006a.md) | `f3f1abc` (2026-11-24) | — |

## J09

**Site e retirada na loja.** O caminho: Vitrine → carrinho por loja → nome e WhatsApp → reserva → pedido que se acha de novo → Pix (quando ligado) → confirmação pela reconsulta → retirada no PDV.

**Os requisitos que os roteiros cobrem:** ORA-CRM-009 (🟡 parcial), ORA-INV-005 (🧪 testado), ORA-META-002 (🟡 parcial), ORA-ONLINE-001 (🟡 parcial), ORA-ONLINE-002 (🟡 parcial), ORA-ONLINE-003 (🧪 testado), ORA-ONLINE-006 (🟡 parcial), ORA-PAY-008 (🟡 parcial), ORA-PAY-014 (🟡 parcial), ORA-QUAL-006 (🟡 parcial), ORA-QUAL-010 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| ONLINE-c | parte dos dois requisitos: os dois seguem parciais mesmo com o aceite | [ONLINE-c.md](ONLINE-c.md) | `dc12dce` (2026-11-17) | — |
| ROT-a | o ORA-INV-005 inteiro (o vencimento automático das reservas); parte do ORA-ONLINE-006 e do ORA-QUAL-006, que seguem parciais mesmo com o aceite | [ROT-a.md](ROT-a.md) | `a2041b1` (2026-11-17) | — |
| ENTREGAS-a | o botão Comprar no topo do site (A01 do adendo do Codex de 16/11) e a tela de entregas do projeto (A18, sem ID próprio); o estado do requisito não muda | [ENTREGAS-a.md](ENTREGAS-a.md) | `69bfab6` (2026-11-17) | — |
| MKT-a | de onde veio a reserva do site: a origem, a campanha do link e o domínio de quem mandou, na reserva, na tela Reservas do site e no quadro dos Relatórios, com as vendas que vieram delas e quem vendeu (Onda 2; ADR-013) | [MKT-a.md](MKT-a.md) | `2e3fa24` (2026-11-17) | — |
| ONLINE-d | o carrinho e o pedido do site, reservado de uma vez para retirar e pagar na loja (ADR-023; aceites A03 e A06 do adendo de 16/11) | [ONLINE-d.md](ONLINE-d.md) | `cc50523` (2026-11-18) | — |
| PAY-b | o achado F18-06 da reanálise do Codex de 18/11: o aviso do provedor de pagamento nunca confirma; só a reconsulta, com a cobrança, o valor, a moeda e a ordem; o tempo esgotado não cobra duas vezes | [PAY-b.md](PAY-b.md) | `ddb6cd6` (2026-11-18) | — |
| CRM-009a | a venda que atendeu um pedido ou uma reserva do site diz de onde veio: o selo "veio do site" e a frase na tela da venda, e o pedido do site na lista de compras da ficha do cliente; a venda continua sendo do balcão, e a origem fica guardada no pedido | [CRM-009a.md](CRM-009a.md) | `7db5c6c` (2026-11-24) | — |
| ONLINE-e | a compra com um botão só (o "Pôr no carrinho", só nas lojas com estoque) e o número de itens no Carrinho do topo da loja online; sem foto, um espaço baixo; o topo numa linha só no celular | [ONLINE-e.md](ONLINE-e.md) | `b2d275b` (2026-11-24) | — |
| PAY-014a | o pagamento pelo site com Pix, pela Asaas: o "Pagar agora com Pix" no pedido, o link criado pelo worker, o aviso repassado pelo site, a confirmação só pela reconsulta e o "Pago pelo site" para o cliente e na loja; desligado até a chave e o PAY-014b | [PAY-014a.md](PAY-014a.md) | `7626f14` (2026-11-24) | — |
| ONLINE-f | a vitrine com o catálogo inteiro: quantos são, de 60 em 60 com "Anteriores" e "Próximos" (guardando a busca e a categoria) e os disponíveis primeiro | [ONLINE-f.md](ONLINE-f.md) | `003421d` (2026-11-24) | — |
| ONLINE-g | a cara de loja da loja online: o topo com gradiente e os atalhos das categorias, as vantagens, as categorias em blocos com ícone, o título da seção e o rodapé com "Como comprar" | [ONLINE-g.md](ONLINE-g.md) | `e86db02` (2026-11-24) | — |
| ONLINE-h | o endereço do cadastro da loja (a configuração em vigor da tela Lojas da rede) na página do produto, na reserva e no pedido do site | [ONLINE-h.md](ONLINE-h.md) | `09d5a55` (2026-11-24) | — |
| PAY-014b | no balcão, a venda do pedido pago pelo site registra o pago (pelo preço pago) sem cobrar de novo | [PAY-014b.md](PAY-014b.md) | `5fc91b6` (2026-11-24) | — |
| ONLINE-i | a vitrine da loja online de 7 a 8 vezes mais rápida no banco, com as mesmas ofertas | [ONLINE-i.md](ONLINE-i.md) | `14fe77d` (2026-11-24) | — |

## J10

**Ora Connect.** O caminho: Elegibilidade, chip e cliente → operação → fila do worker → Nogle → confirmação ou reconsulta → produção → repasse oficial.

**Os requisitos que os roteiros cobrem:** ORA-CONNECT-001 (🧪 testado), ORA-CONNECT-003 (🟡 parcial), ORA-CONNECT-006 (🧪 testado), ORA-CONNECT-007 (🟡 parcial), ORA-CONNECT-008 (🟡 parcial), ORA-CONNECT-009 (🟡 parcial), ORA-CONNECT-011 (🟡 parcial), ORA-INV-011 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| CONNECT-c | a conciliação da produção da Ora Connect com os relatórios oficiais de ativações e de recargas da Nogle: o que confere, o valor diferente, o que só a Nogle tem e o que só a Ora tem | [CONNECT-c.md](CONNECT-c.md) | `2efe8cc` (2026-11-18) | — |
| CONNECT-d | a tela Ora Connect → Chips na Nogle: o estoque virgem de chips de cada loja e o geral da MVNO na Nogle, lido pelo servidor a cada 30 minutos, das 7h às 22h; só leitura | [CONNECT-d.md](CONNECT-d.md) | `4070a8b` (2026-11-24) | — |
| CONNECT-e | em Ora Connect → Chips na Nogle, o cartão Transferir chips (eSIM por quantidade, um chip ou um lote), só para o dono, com a lista dos pedidos e o cancelamento; o servidor envia uma vez e confirma pelo estoque do PDV | [CONNECT-e.md](CONNECT-e.md) | a publicar | — |
| CONNECT-f | os planos da Nogle no caixa (a recarga e a ativação de cada plano, pelo valor de face), os chips da Nogle no estoque das lojas pelo ICCID, os chips para conferir (para o dono), a trava do plano na operação e as operações ligadas | [CONNECT-f.md](CONNECT-f.md) | a publicar | — |
| CONNECT-g | em Ora Connect → Consultar linha, as consultas da Nogle que só leem: a situação, o saldo, as recargas e o consumo da linha, o número e a ativação do chip e, para o dono, o saldo da carteira | [CONNECT-g.md](CONNECT-g.md) | a publicar | — |
| CONNECT-h | em Ora Connect → Consultar linha, o relatório completo do número e o do cliente (pelo CPF/CNPJ), numa página que dá para imprimir, e as consultas que faltavam | [CONNECT-h.md](CONNECT-h.md) | a publicar | — |
| CONNECT-k | em Ora Connect → Relatório do vendedor e da loja, as operações do período por vendedor e por loja, para imprimir e exportar; o vendedor vê só o próprio | [CONNECT-k.md](CONNECT-k.md) | a publicar | — |
| CONNECT-j | em Ora Connect → Ações na Nogle, para o dono e os gerentes: bloquear e desbloquear a linha, a recarga automática, o apelido, a recarga programada, o reenvio do SMS da portabilidade, o cliente na Nogle, a compra de chip com entrega e os PDVs | [CONNECT-j.md](CONNECT-j.md) | a publicar | — |
| CONNECT-i | em Ora Connect → Consultar linha, as 16 rotas da coleção oficial que faltavam: o titular da linha, o CNPJ, o CEP, o rastreio, o pagamento de uma solicitação e as informações da Nogle (a loja); a logística e o CPF (a gerência); o extrato e as recargas programadas da carteira, as portabilidades e as listas de linhas e de clientes (a rede) | [CONNECT-i.md](CONNECT-i.md) | a publicar | — |
| CONNECT-l | na Ora Connect, o Pix da Nogle como o padrão da ativação e da recarga, com o QR Code na tela: a loja paga quando o cliente já pagou no caixa, ou o cliente paga direto à Nogle | [CONNECT-l.md](CONNECT-l.md) | a publicar | — |

## J11

**Financeiras (PayJoy e Aiva).** O caminho: Cliente → aprovação na financeira → entrada mais financiado → venda → a receber → prazo → repasse e taxa → resultado.

**Os requisitos que os roteiros cobrem:** ORA-FIN-002 (🟡 parcial), ORA-FIN-003 (🧪 testado), ORA-FIN-004 (🧪 testado), ORA-FIN-005 (🧪 testado), ORA-FIN-007 (🟡 parcial), ORA-FIN-010 (🧪 testado), ORA-PAY-002 (🟡 parcial), ORA-PAY-007 (🟡 parcial), ORA-POS-007 (🧪 testado), ORA-POS-013 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| PDV-c | as formas de pagamento por botão; a PayJoy e a Aiva com as parcelas e só sobre o celular; a entrada à parte; o cartão com as parcelas; o chip pago à parte na mesma venda; o link de pagamento só na compra online | [PDV-c.md](PDV-c.md) | `b8760d2` (2026-11-18) | — |
| J3-f | o financeiro da loja de teste: contas a pagar, conciliação e repasse da financeira | [J3-f.md](J3-f.md) | `c1b8e60` (2026-11-21) | — |
| FIN-007a | o cartão "O que está atrasado" na tela "A receber das financeiras": o dono grava o prazo de repasse de cada financeira, e a tela diz o que venceu, há quantos dias e em que loja; em cada conta em aberto, a gerência registra a cobrança feita à financeira, com o histórico. Sem prazo gravado, nada é chamado de atrasado | [FIN-007a.md](FIN-007a.md) | `bff87de` (2026-11-23) | — |
| FIN-007b | o Início e o sino avisam quem concilia quando um repasse de financeira passa do prazo e quando chega o dia combinado de voltar ao assunto; a previsão de caixa conta o que cada financeira deve na semana do vencimento, e diz o que fica de fora (o atrasado, o que vence depois e o que não tem prazo) | [FIN-007b.md](FIN-007b.md) | `a1100f7` (2026-11-23) | — |
| FIN-002a | a taxa da PayJoy e da Aiva no resultado do mês: a observada no repasse (o valor financiado menos o repassado), no mês da venda, numa linha própria do demonstrativo e da planilha; a conta sem repasse registrado fica num aviso, com o atalho para registrar | [FIN-002a.md](FIN-002a.md) | `7594a52` (2026-11-24) | — |

## J12

**Marketplaces e Meta.** O caminho: Conta ligada → produto e estoque → pedido → reserva e baixa → entrega → tarifa e repasse → conciliação; anúncios → custo e atribuição.

**Os requisitos que os roteiros cobrem:** ORA-CAT-002 (🧪 testado), ORA-FIN-006 (🟡 parcial), ORA-INV-004 (🟡 parcial), ORA-META-001 (🟡 parcial), ORA-META-002 (🟡 parcial), ORA-META-003 (🧪 testado), ORA-META-004 (🧪 testado), ORA-META-006 (🧪 testado), ORA-MKTPL-001 (⛔ bloqueado), ORA-MKTPL-002 (⛔ bloqueado), ORA-MKTPL-003 (🟡 parcial), ORA-MKTPL-004 (🟡 parcial), ORA-MKTPL-005 (🟡 parcial), ORA-MKTPL-006 (🟡 parcial), ORA-MKTPL-007 (⛔ bloqueado), ORA-MKTPL-008 (🟡 parcial), ORA-ONLINE-003 (🧪 testado), ORA-PAY-009 (🧪 testado), ORA-REPORT-008 (🧪 testado).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| MKT-a | de onde veio a reserva do site: a origem, a campanha do link e o domínio de quem mandou, na reserva, na tela Reservas do site e no quadro dos Relatórios, com as vendas que vieram delas e quem vendeu (Onda 2; ADR-013) | [MKT-a.md](MKT-a.md) | `2e3fa24` (2026-11-17) | — |
| META-a | o custo dos anúncios da Meta por arquivo (o relatório do Gerenciador de Anúncios, por dia), junto aos contatos e às vendas de cada campanha: CTR, CPC, CPL, CPA, ROAS, margem, CAC e o recebido de fato, e o funil por loja e por vendedor (Onda 3, item "Meta Ads"; ADR-017) | [META-a.md](META-a.md) | `475ad3e` (2026-11-17) | — |
| MKTPL-a | os pedidos do Mercado Livre, da Shopee e do TikTok Shop por arquivo (o relatório de vendas de cada canal), sem repetir pedido, com o bruto, as tarifas, o frete, os reembolsos, o líquido, o custo e o lucro estimado por canal, anúncio e pedido; os adaptadores de cada canal separados e desligados até o contrato (Onda 3, item "Marketplaces"; ADR-018) | [MKTPL-a.md](MKTPL-a.md) | `93f3a6d` (2026-11-17) | — |
| CANAIS-a | os canais de venda lado a lado no mesmo período: as lojas (e, delas, o site), cada marketplace e os anúncios, com a receita, as taxas e tarifas, o líquido e a margem, sem contar duas vezes, e o resultado dos canais estimado (Onda 3; ADR-019) | [CANAIS-a.md](CANAIS-a.md) | `47f2c4f` (2026-11-17) | — |
| AUD-a | o que a auditoria do Codex de 17/11 (PR #104) pediu: o rodapé da planilha da Rein (F01), os anúncios com as devoluções, a moeda e o fuso (A14) e os estados honestos (A13) | [AUD-a.md](AUD-a.md) | `3135435` (2026-11-17) | — |
| REPASSE-a | o repasse de cada canal (os pedidos com a mesma data de repasse) casado com a linha de crédito do extrato do banco, com a diferença e o motivo registrados | [REPASSE-a.md](REPASSE-a.md) | `42bd4a0` (2026-11-18) | — |
| AUD-c | os achados F21-01 a F21-03 da auditoria integral do Codex de 21/11 (PR #105): a linha do extrato com um uso só (o mesmo crédito não concilia uma venda e um repasse de marketplace), o rodapé da planilha da Rein escrito com vírgula reconhecido e o registro de cada publicação gravado depois dela, fora dos commits do aplicativo | [AUD-c.md](AUD-c.md) | `5617351` (2026-11-23) | — |

## J13

**Assistência.** O caminho: Cliente e aparelho → OS e fotos → orçamento → aprovação → serviço e peça → recebimento → entrega e garantia.

**Os requisitos que os roteiros cobrem:** ORA-CRM-001 (🧪 testado), ORA-CRM-003 (🧪 testado), ORA-CRM-004 (🧪 testado), ORA-CRM-005 (🧪 testado), ORA-FISC-001 (🧪 testado), ORA-FISC-002 (🧪 testado), ORA-OS-001 (🧪 testado), ORA-OS-002 (🟡 parcial), ORA-OS-003 (🧪 testado), ORA-OS-004 (🧪 testado), ORA-OS-006 (🧪 testado), ORA-PERF-003 (🧪 testado), ORA-PERF-004 (🟡 parcial), ORA-PERF-005 (🟡 parcial), ORA-POS-011 (🧪 testado).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| J3-e | o cliente, o funil, a ordem de serviço, o pedido de nota sem emitir e as metas, na loja de teste | [J3-e.md](J3-e.md) | `b061e86` (2026-11-21) | — |

## J14

**Metas e bônus.** O caminho: Regra e faixas → eventos de venda, telecom e OS → estornos → apuração → revisão → fechamento.

**Os requisitos que os roteiros cobrem:** ORA-CRM-001 (🧪 testado), ORA-CRM-003 (🧪 testado), ORA-CRM-004 (🧪 testado), ORA-CRM-005 (🧪 testado), ORA-FISC-001 (🧪 testado), ORA-FISC-002 (🧪 testado), ORA-OS-001 (🧪 testado), ORA-OS-002 (🟡 parcial), ORA-OS-003 (🧪 testado), ORA-OS-004 (🧪 testado), ORA-OS-006 (🧪 testado), ORA-PERF-001 (🟡 parcial), ORA-PERF-003 (🧪 testado), ORA-PERF-004 (🟡 parcial), ORA-PERF-005 (🟡 parcial), ORA-POS-011 (🧪 testado).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| PERF-a | os chips como a quinta medida das metas e do bônus (unidades), por vendedor e por loja, com o extrato e a planilha; o teto do valor aprovado no fechamento em R$ 500.000,00 | [PERF-a.md](PERF-a.md) | `bfb3125` (2026-11-18) | — |
| J3-e | o cliente, o funil, a ordem de serviço, o pedido de nota sem emitir e as metas, na loja de teste | [J3-e.md](J3-e.md) | `b061e86` (2026-11-21) | — |

## J15

**Operação e publicação.** O caminho: Commit → CI → migration compatível → publicação → domínio e SHA → conferência → monitoramento → recuperação.

**Os requisitos que os roteiros cobrem:** ORA-FISC-007 (⛔ bloqueado), ORA-FISC-008 (🟡 parcial), ORA-FISC-010 (⛔ bloqueado), ORA-META-005 (⛔ bloqueado), ORA-ONLINE-007 (⛔ bloqueado), ORA-ONLINE-008 (⛔ bloqueado), ORA-ORG-004 (🟡 parcial), ORA-PAY-013 (⛔ bloqueado), ORA-PAY-014 (🟡 parcial), ORA-QUAL-001 (🟡 parcial), ORA-QUAL-002 (🟡 parcial), ORA-QUAL-004 (🟡 parcial), ORA-QUAL-006 (🟡 parcial), ORA-QUAL-008 (🟡 parcial), ORA-QUAL-010 (🟡 parcial), ORA-QUAL-013 (🟡 parcial), ORA-QUAL-014 (🟡 parcial), ORA-REPORT-002 (🟡 parcial), ORA-REPORT-003 (🟡 parcial).

| Lote | O que entrega | Roteiro | No ar | Resposta |
|---|---|---|---|---|
| BANCO-a | a arrumação do banco que o Supabase aponta (Onda 0.5); o estado dos dois requisitos não muda | [BANCO-a.md](BANCO-a.md) | `0bfad91` (2026-11-17) | — |
| SAUDE-a | o que é fila e o que é aviso na Saúde da operação (a venda sem o pedido da nota vira fila; o estoque abaixo do mínimo, aviso) e a página /saude com uma leitura leve do banco (Onda 0.6; ADR-012); o estado dos dois requisitos não muda | [SAUDE-a.md](SAUDE-a.md) | `7e1ff5f` (2026-11-17) | — |
| GIT-a | a arrumação do GitHub (Onda 0.7): a situação de cada issue aberta, com o commit e o teste das corrigidas; o Dependabot; o histórico sem segredo; a lista do que o repositório público expõe; o estado dos três requisitos não muda | [GIT-a.md](GIT-a.md) | `3235772` (2026-11-17) | — |
| DEP-a | a lista única do que depende de fora (aceite A19 do adendo do Codex de 16/11), conferida no servidor em 17/11, só pelos nomes; nenhum requisito muda de estado | [DEP-a.md](DEP-a.md) | `569eab8` (2026-11-17) | — |
| PWA-b | o aviso no celular de desconto, nota e saída de caixa a aprovar, para quem decide (menos quem pediu), com o toque que abre a tela da aprovação (Onda 1, item 7, a segunda parte; ADR-014); o estado dos requisitos não muda | [PWA-b.md](PWA-b.md) | `252bcad` (2026-11-17) | aceito |
| QUAL-a | o alerta no celular quando um desconto, uma nota ou uma saída de caixa espera além do limite (para quem decide) e quando uma rotina do banco falha ou atrasa (para o dono e o administrador), um por dia (Onda 2; ADR-015); o estado do requisito não muda | [QUAL-a.md](QUAL-a.md) | `87c8dbe` (2026-11-17) | — |
| ADAPT-a | as integrações que esperam contrato: o link de pagamento e os eventos de conversão com o adaptador desligado, a regra e os testes; e o que falta para ligar cada integração bloqueada (ADR-020) | [ADAPT-a.md](ADAPT-a.md) | `7c7bdf1` (2026-11-17) | — |
| DEMO-a | a demonstração com os nomes das 11 lojas, os canais por arquivo e lado a lado, e no ar em todo ambiente, isolada (ADR-022; F06 e A16) | [DEMO-a.md](DEMO-a.md) | `bdbd8b6` (2026-11-18) | — |
| INTEG-d | a seção 4 da orientação de 18/11: a matriz das APIs, uma linha por integração, com as 15 colunas, quem fornece o que falta e o que pode andar sem isso; a leitura da PR #97 | [INTEG-d.md](INTEG-d.md) | `5334b6a` (2026-11-18) | — |
| DEMO-b | os fluxos novos na demonstração, com dados fictícios: os extratos da maquininha e do banco, a carga do estoque pelo relatório da Rein, a origem das reservas do site e a conciliação da Ora Connect com a Nogle | [DEMO-b.md](DEMO-b.md) | `aaedf0d` (2026-11-18) | — |
| OBS-a | os erros do servidor na Saúde da operação: quantos, em que tela, quando e o código que a página de erro mostra à loja; o aviso no topo quando houve erro na última hora; nunca o texto do erro nem os valores do endereço | [OBS-a.md](OBS-a.md) | `52d0fff` (2026-11-18) | — |
| VEL-f | as conexões com o banco aquecidas | [VEL-f.md](VEL-f.md) | `ce8b5db` (2026-11-19) | — |
| ROB-a | a varredura de todas as telas e o Início que não cai | [ROB-a.md](ROB-a.md) | `069d614` (2026-11-21) | — |
| QUAL-006a | o aviso no celular quando o servidor dá erro: o erro de uma tela vira o alerta "Erro no servidor do site" no celular do dono e do administrador (no máximo um por hora), o site sem responder por 5 minutos vira "O site não responde" e, na volta, "O site voltou"; os pedidos estranhos (robôs) ficam fora da conta; a Saúde da operação mostra se o aviso está ligado | [QUAL-006a.md](QUAL-006a.md) | `8ac0e78` (2026-11-24) | — |
| AUD-e | a lista única conciliada (só o que falta, com o que cada resposta bloqueia), os placares de uma fonte só e os roteiros de aceite por jornada (J01 a J15) | [AUD-e.md](AUD-e.md) | `3244734` (2026-11-24) | — |
