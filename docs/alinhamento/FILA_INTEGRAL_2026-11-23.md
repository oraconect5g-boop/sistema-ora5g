# Fila integral pela ordem do prompt de 23/11/2026

> **Estado em 25/11/2026, depois do lote PAY-015a (o Pix pela Asaas no caixa, a D-062), do CONNECT-i (as outras consultas da Nogle: as 62 funções da coleção oficial em uso), do CONNECT-j (as funções que mudam algo na Nogle, para o dono e os gerentes), do CONNECT-k (o relatório do vendedor e da loja), do CONNECT-h (a consulta completa: o relatório do número e o do cliente), do CONNECT-g (as consultas da Nogle que só leem: Consultar linha e a Carteira), do CONNECT-f (a Ora Connect pronta para operar nas lojas: os planos no caixa, os chips no estoque pelo ICCID e as operações ligadas), do CONNECT-e (a transferência de chips pela Nogle, pelo sistema, só pelo dono), do CONNECT-d (o estoque de chips da Nogle no sistema, só leitura: a primeira chamada de verdade, com o sim do proprietário, e a correção do estoque sem PDV), do AUD-e (a lista única conciliada e os aceites por jornada; o F24-05 do Codex), do TRF-f (a transferência em andamento não some da tela; os achados F24-01 a F24-04 do Codex), do ONLINE-i (a vitrine mais rápida), do PAY-014b (o pedido pago pelo site no balcão), do ONLINE-h (o endereço do cadastro na loja online), do ONLINE-g (a cara de loja, a pedido do proprietário), do ONLINE-f (a vitrine de 60 em 60), do PAY-014a (a Asaas) e da carga do catálogo e do estoque de verdade (B1, a seção 4).** Este arquivo põe o que falta na ordem do prompt que o proprietário entregou em 23/11 (escrito pelo Codex): a seção 4 (cadastros e estoque da loja piloto), as áreas A a R da seção 5 e a revisão da seção 6. Em 23/11 à noite o proprietário pediu para seguir esse planejamento. A fonte do estado de cada requisito continua sendo `status-requisitos.json`; o que depende do proprietário está, inteiro, em `docs/PENDENCIAS_DO_PROPRIETARIO.md`. Aqui fica só a ordem de trabalho.

## Placar

<!-- placar: gerado por scripts/gerar-rastreabilidade.mjs a partir de status-requisitos.json; não editar à mão -->
Dos 179 requisitos: **73 testados**, 78 parciais, 14 não iniciados, 12 bloqueados e 2 restrições respeitadas. Nenhum homologado: o aceite do proprietário e a revisão do Codex vêm depois de cada lote. Parcial não conta como pronto.
<!-- fim do placar -->

## O que já saiu do prompt

| Seção do prompt | Situação |
|---|---|
| 1 e 2. Leitura dos relatórios e reconciliação | Feito: `LEITURA_AUDITORIA_2026-11-21.md` |
| 3. Defeitos reproduzidos pelo Codex (F21-01 a F21-04) | Feito e no ar: lotes AUD-c, TRF-d e AUD-d |
| 4, passos 1 e 2. O relatório original da Rein, lido inteiro em ambiente privado | Feito: lote REIN-d (83 colunas, 2.271 produtos, nenhuma linha com erro) |

## Seção 4: cadastros e estoque da loja piloto

Feita em 24/11 (D-053 e o lote B1), menos a posição do dia da virada e os dados das lojas:

| Passo | O que falta | Quem resolve |
|---|---|---|
| 3. Confirmar o mapeamento das colunas | **Feito em 24/11** (D-053): a TABELA NORMAL, a coluna Código, CELULARES com IMEI e o resto por quantidade | — |
| 4. Apresentar a prévia e as inconsistências | **Feito em 24/11** (o lote B1) | — |
| 5 a 8. Reconciliar e aprovar a carga | **Feito em 24/11**: o catálogo (2.271 produtos) e o estoque das 12 lojas no banco do site, com a posição de 10/11 | — |
| 9 a 11. Estoque de cada loja | Um relatório novo, do dia da virada (o de 10/11 não é a posição de hoje) | O proprietário, no dia da virada |
| Lojas, pessoas e fotos | CNPJ, endereço, telefone e horário de cada loja (três já têm endereço e horário); as pessoas de verdade; as fotos só do que falta (2.269 dos 2.277 produtos ativos já têm) | O proprietário (a raiz de teste do CNPJ da empresa é do Claude Code) |

## Seção 5: as áreas, na ordem do prompt

"Posso fazer já" quer dizer: sem contrato, sem credencial e sem decisão que falte. O resto está na lista única do proprietário.

| Área | Não testados | Posso fazer já | Espera quem |
|---|---|---|---|
| A. Organização, lojas e acessos | 7 parciais | Nada | Proprietário: dados das lojas (ORG-001), SMTP próprio (ORG-002 e 006), os papéis novos (ORG-003), a verificação em duas etapas obrigatória (ORG-007, D-046). Contador: parâmetros por estado (ORG-010). Codex: conferências |
| B. Catálogo, fotos e preços | 1 parcial (o CAT-002 passou a testado: o catálogo de verdade entrou no banco do site em 24/11) | Nada | Proprietário: o aceite do REIN-d e as fotos de verdade (CAT-011) |
| C. Estoque, compras e transferências | 4 parciais | Nada (o **TRF-f**, de 24/11, corrigiu os achados F24-01 a F24-04 da revisão do Codex de 24/11: a transferência em andamento não some da tela, o "reservado" no saldo, o produto aberto sem perder a busca e o "Pedir a transferência"; o estoque das 12 lojas entrou no banco do site em 24/11, com a posição de 10/11) | Proprietário: aceites, a decisão D-043 (INV-012), um relatório novo da Rein e o dos IMEIs (INV-004). Nogle: o ICCID na ativação (INV-011) |
| D. Clientes e CRM | 4 parciais | Nada (o **CRM-009a**, de 24/11, pôs o pedido do site na tela da venda e na ficha do cliente) | Nogle (CRM-002), WhatsApp oficial (CRM-007), decisão D-045 (CRM-008). No CRM-009: o contrato de cada marketplace e a decisão de privacidade sobre os pedidos do site que não viraram venda |
| E. PDV e vendas | 8 parciais | Nada (o **POS-015a**, de 24/11, provou no site, com login, que nada é gravado sem rede: o ORA-POS-015 passou a testado) | Proprietário: aceites, o celular de verdade da loja (POS-015 e POS-016), D-035 (POS-014). Nogle (POS-003). Provedor do link de pagamento (POS-009). Contrato das financeiras (POS-013) |
| F. Pagamentos e caixa | 8 parciais e 1 bloqueado | Nada que dependa só do Claude Code (o **PAY-014b**, de 24/11, fez o balcão do pedido pago: a venda registra o "pago pelo site" sem cobrar de novo; o **PAY-014a** deixou o Pix pela Asaas pronto e desligado; o PAY-011a ligou o débito do extrato ao estorno) | Proprietário: aceites; a chave de teste da Asaas e o sim para ligar o worker (PAY-014). Contrato e arquivo real de cada maquininha (PAY-010 e, no PAY-011, a antecipação e o débito de valor diferente do estorno). PicPay POS (PAY-013) |
| G. Financeiro | 3 parciais | Nada (os lotes de 24/11: o **FIN-002a** pôs a taxa observada das financeiras no resultado do mês, e o **FIN-006a** conferiu o depósito agrupado da maquininha com o extrato do banco; os dois requisitos seguem parciais) | Proprietário: a decisão D-013 (FIN-007: vender a prazo próprio), o arquivo OFX de verdade e como as maquininhas depositam (FIN-006). Contador: o imposto (FIN-002). WhatsApp oficial (FIN-007) |
| H. Gráficos e relatórios | 5 parciais | Os painéis do Início e do Financeiro com o catálogo de verdade (achado de 24/11 à noite: sozinhos, abaixo de 1 s; com várias páginas abertas juntas no banco pequeno, o de estoque chegou a 20 s e houve 31 erros de tempo esgotado entre 18:46 e 18:50; nenhum era função dos lotes do dia). Antes (24/11: as provas com login de 19/11, J2-a, já fechavam a "jornada com login" de REPORT-001, 003 e 006; as notas do 003 e do 006 foram acertadas no lote QUAL-006a, e a do 001 já dizia) | Proprietário: o ranking (P3), a regra da comissão, o arquivo real de cada maquininha (REPORT-005), o sim para a prova do aviso no celular (REPORT-002) |
| I. Metas e bônus | 4 parciais e 1 não iniciado | Nada | Proprietário: a regra do bônus, P3 e D-014. Provedor de IA (PERF-010) |
| J. Fiscal | 4 parciais e 4 bloqueados | Nada | Contador e emissor fiscal |
| K. Ora Connect / Nogle | 5 parciais | Nada (o **CONNECT-d**, de 24/11, fez a primeira chamada de verdade, só de leitura: a chave é do tipo marca e o estoque de chips de cada loja aparece no sistema) | Nogle: as respostas que faltam, uma linha e um chip de teste e o sim do proprietário a cada operação (a transferência de chips inclusive) |
| L. PayJoy e Aiva | (em POS-013 e PAY-002) | Nada | Contrato e documentação de cada financeira. O prazo de repasse já se grava na tela (FIN-007a) |
| M. Loja online | 4 parciais, 1 não iniciado e 2 bloqueados | Nada (o **ONLINE-i**, de 24/11, deixou a vitrine de 7 a 8 vezes mais rápida no banco, com as mesmas ofertas). O **ONLINE-h**, de 24/11, levou o endereço do cadastro à loja online; o **ONLINE-g**, a pedido do proprietário, deu a cara de loja: o topo, os atalhos, as vantagens, as categorias com ícone e o rodapé; o **ONLINE-f** deixou a vitrine de 60 em 60, com os disponíveis primeiro, para os 634 produtos de verdade; o ONLINE-e, a compra com um botão só; o PAY-014a, o Pix no pedido, desligado) | Proprietário: o CNPJ das lojas (sem ele, nada aparece disponível), D-024, D-025 e a transportadora; a chave de teste da Asaas |
| N. Marketplaces | 5 parciais e 3 bloqueados | Nada | Contrato e autorização de cada canal |
| O. WhatsApp | 1 parcial, 6 não iniciados e 1 bloqueado | Nada | Meta: a conta, o número e o modelo de mensagem aprovado |
| P. Meta | 2 parciais e 1 bloqueado | Nada | Proprietário: a conta de anúncios e a decisão D-022 |
| Q. Assistência técnica | 2 parciais | Nada | Proprietário: aceite e P5. WhatsApp oficial (OS-005) |
| R. Qualidade, operação e IA | 11 parciais e 6 não iniciados | Nada (o **QUAL-006a**, de 24/11, pôs o aviso no celular do dono quando o servidor erra; o QUAL-006 e o QUAL-013 seguem parciais) | Proprietário: a proteção da `main` e o Dependabot no GitHub, D-041, D-042 e D-044, a infraestrutura de produção (com ela, o monitoramento de fora: o tempo de resposta e o servidor inteiro fora do ar), o piloto (QUAL-009). Jurídico: LGPD (QUAL-011). Provedor de IA |

## A ordem dos próximos lotes que não dependem de ninguém

1. ~~**CRM-009** (área D): o pedido do site no histórico do cliente.~~ Feito em 24/11 (lote CRM-009a).
2. ~~**POS-015** (área E): a prova com login e a rede desligada.~~ Feito em 24/11 (lote POS-015a).
3. ~~**PAY-011** (área F): o chargeback ligado ao estorno da venda.~~ Feito em 24/11 (lote PAY-011a; a antecipação e o débito de valor diferente esperam o arquivo real de cada maquininha).
4. ~~**FIN-002** (área G): a taxa das financeiras no resultado do mês.~~ Feito em 24/11 (lote FIN-002a; o imposto calculado e a comissão esperam o contador e a D-014).
5. ~~**FIN-006** (área G): o depósito agrupado da maquininha.~~ Feito em 24/11 (lote FIN-006a; o saldo final do OFX real espera o arquivo).
6. ~~**REPORT-001, 003 e 006** (área H): as notas da "jornada com login".~~ Feito em 24/11, no lote QUAL-006a (a jornada estava provada desde o J2-a, de 19/11; as notas do 003 e do 006 foram acertadas).
7. ~~**QUAL-006 e QUAL-013** (área R): o aviso no celular quando o servidor erra.~~ Feito em 24/11 (lote QUAL-006a; o servidor inteiro fora do ar e o tempo de resposta esperam o monitoramento de fora).

Depois deles, o que resta depende de resposta do proprietário, de contrato ou de terceiro. A seção 4 (o catálogo e o estoque de verdade) foi feita em 24/11 com as respostas do proprietário (D-053); falta um relatório novo da Rein, o dos IMEIs e o CNPJ das lojas.

## O teste das telas de 24/11: a triagem

O relatório (`docs/analises/teste-de-telas-2026-11-24/RELATORIO.md`) testou o site no ar só lendo, com a conta Dono de teste. Cada ponto, pelo que ele é:

| Ponto | O que é | Onde entra |
|---|---|---|
| A1, A2 (erro e 5 a 25 s com várias telas juntas) | Capacidade do banco Micro e páginas pesadas: sozinhos, os painéis levam de 9 a 460 ms no banco | Código: aliviar as telas mais pesadas (Início, Produtos, Financeiro, Relatórios); a produção com banco próprio é a decisão H |
| M1, M2 (Produtos com 2,35 MB, Catálogo com 1,1 MB e só 200 produtos) | Código | Lote próprio: páginas e o formulário de edição só ao abrir |
| M3 (o texto do Novo cliente) | Código | **Feito no AUD-e** (o nome e o WhatsApp; o CPF/CNPJ e o e-mail opcionais) |
| M4 (cabeçalhos de segurança) | Código | Lote próprio, antes da produção: começar pelo HSTS e os que não quebram nada |
| M5, M7 (as lojas de teste na vitrine; tudo "Sem estoque") | Dado: só as lojas de teste têm CNPJ | Some com o CNPJ das lojas de verdade (B2); nessa hora, tirar as lojas de teste da vitrine; o texto "Sem estoque" é o F24-06 |
| M6, B6 (indexação e a versão na tela de entrada) | Esperado na homologação | Lista da produção |
| M8 (a exportação da auditoria em 12 a 16 s) | Código | Lote próprio (por período ou em segundo plano) |
| M9 (as lojas sem CNPJ e dados) | Dado | B2 da lista única |
| B1 a B5, B7 (o menu lateral, a lista de lojas dos filtros, os títulos, os rótulos, as áreas de toque, o SKU repetido) | Código, acabamento | Lote de acabamento |
| V1, V2, V5 (o Adicionar com 0 livre, o motivo das metas, o primeiro clique na loja do turno) | Conferir no código e nos testes | Próximo lote de código |
| V3 | Fechado: o repositório é público | — |
| V4 (a venda nº 4 aberta desde 17/11) | Dado de teste | Conferir de quem é antes de mexer (gravar pede o sim do proprietário) |
| O CNPJ recusado em Lojas da rede (a raiz de teste da empresa) e a mensagem fora da vista | Código | O próximo lote de código: a raiz da matriz que o proprietário mandou e a mensagem perto do formulário; a D-055 é dele |

## Seção 6: revisão de código

Feita área por área, junto de cada lote: o que o lote toca é conferido nos pontos da lista do prompt (tipos e validação, dinheiro e arredondamento, datas e fuso, vazio e erro, autorização no banco, loja e organização, concorrência e repetição, código antigo e duplicado). Função em uso só é refeita depois de conferir que a instalada no banco é igual à do repositório.
