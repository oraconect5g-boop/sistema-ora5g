# Fila integral pela ordem do prompt de 23/11/2026

> **Estado em 24/11/2026, depois do lote FIN-006a.** Este arquivo põe o que falta na ordem do prompt que o proprietário entregou em 23/11 (escrito pelo Codex): a seção 4 (cadastros e estoque da loja piloto), as áreas A a R da seção 5 e a revisão da seção 6. Em 23/11 à noite o proprietário pediu para seguir esse planejamento. A fonte do estado de cada requisito continua sendo `status-requisitos.json`; o que depende do proprietário está, inteiro, em `docs/PENDENCIAS_DO_PROPRIETARIO.md`. Aqui fica só a ordem de trabalho.

## Placar

Dos 179 requisitos: **72 testados**, 78 parciais, 14 não iniciados, 13 bloqueados e 2 restrições respeitadas. Nenhum homologado: o aceite do proprietário e a revisão do Codex vêm depois de cada lote. Parcial não conta como pronto.

## O que já saiu do prompt

| Seção do prompt | Situação |
|---|---|
| 1 e 2. Leitura dos relatórios e reconciliação | Feito: `LEITURA_AUDITORIA_2026-11-21.md` |
| 3. Defeitos reproduzidos pelo Codex (F21-01 a F21-04) | Feito e no ar: lotes AUD-c, TRF-d e AUD-d |
| 4, passos 1 e 2. O relatório original da Rein, lido inteiro em ambiente privado | Feito: lote REIN-d (83 colunas, 2.271 produtos, nenhuma linha com erro) |

## Seção 4: cadastros e estoque da loja piloto

Vem antes das áreas, e hoje espera o proprietário:

| Passo | O que falta | Quem resolve |
|---|---|---|
| 3. Confirmar o mapeamento das colunas | A tabela de preço da loja (são três no relatório), o tipo de cada família (só CELULARES sai como aparelho) e o código do produto (a coluna "Código" ou a coluna "SKU") | O proprietário. Em 23/11 recebeu um resumo privado, feito do relatório, para responder (fora do GitHub) |
| 4. Apresentar a prévia e as inconsistências | Gerar a prévia no sistema, com a conta de administrador de teste | Eu, com as três respostas e o sim do proprietário |
| 5 a 8. Reconciliar e aprovar a carga | Conferir e aplicar a prévia (quem gera não aplica) | O proprietário |
| 9 a 11. Estoque de cada loja | Um relatório novo, do dia da virada (o de 10/11 não é a posição de hoje) | O proprietário, no dia da virada |
| Lojas, pessoas e fotos | CNPJ, endereço, telefone e horário de cada loja; as pessoas de verdade; as fotos dos produtos | O proprietário |

## Seção 5: as áreas, na ordem do prompt

"Posso fazer já" quer dizer: sem contrato, sem credencial e sem decisão que falte. O resto está na lista única do proprietário.

| Área | Não testados | Posso fazer já | Espera quem |
|---|---|---|---|
| A. Organização, lojas e acessos | 7 parciais | Nada | Proprietário: dados das lojas (ORG-001), SMTP próprio (ORG-002 e 006), os papéis novos (ORG-003), a verificação em duas etapas obrigatória (ORG-007, D-046). Contador: parâmetros por estado (ORG-010). Codex: conferências |
| B. Catálogo, fotos e preços | 2 parciais | Nada | Proprietário: as três respostas do catálogo (CAT-002) e as fotos de verdade (CAT-011) |
| C. Estoque, compras e transferências | 4 parciais | Nada | Proprietário: aceites e a decisão D-043 (INV-012). Nogle: o ICCID na ativação (INV-011) |
| D. Clientes e CRM | 4 parciais | Nada (o **CRM-009a**, de 24/11, pôs o pedido do site na tela da venda e na ficha do cliente) | Nogle (CRM-002), WhatsApp oficial (CRM-007), decisão D-045 (CRM-008). No CRM-009: o contrato de cada marketplace e a decisão de privacidade sobre os pedidos do site que não viraram venda |
| E. PDV e vendas | 8 parciais | Nada (o **POS-015a**, de 24/11, provou no site, com login, que nada é gravado sem rede: o ORA-POS-015 passou a testado) | Proprietário: aceites, o celular de verdade da loja (POS-015 e POS-016), D-035 (POS-014). Nogle (POS-003). Provedor do link de pagamento (POS-009). Contrato das financeiras (POS-013) |
| F. Pagamentos e caixa | 7 parciais e 2 bloqueados | Nada (o **PAY-011a**, de 24/11, ligou o débito do extrato ao estorno da venda; o ORA-PAY-011 segue parcial) | Proprietário: aceites. Contrato e arquivo real de cada maquininha (PAY-010 e, no PAY-011, a antecipação e o débito de valor diferente do estorno). Provedor de pagamento (PAY-008, 013 e 014) |
| G. Financeiro | 3 parciais | Nada (os lotes de 24/11: o **FIN-002a** pôs a taxa observada das financeiras no resultado do mês, e o **FIN-006a** conferiu o depósito agrupado da maquininha com o extrato do banco; os dois requisitos seguem parciais) | Proprietário: a decisão D-013 (FIN-007: vender a prazo próprio), o arquivo OFX de verdade e como as maquininhas depositam (FIN-006). Contador: o imposto (FIN-002). WhatsApp oficial (FIN-007) |
| H. Gráficos e relatórios | 5 parciais | Conferir se as provas de leitura com login (J2-a e J2-b) já fecham a "jornada com login" de REPORT-001, 003 e 006, e acertar as notas | Proprietário: o ranking (P3), a regra da comissão, o arquivo real de cada maquininha (REPORT-005), o sim para a prova do aviso no celular (REPORT-002) |
| I. Metas e bônus | 4 parciais e 1 não iniciado | Nada | Proprietário: a regra do bônus, P3 e D-014. Provedor de IA (PERF-010) |
| J. Fiscal | 4 parciais e 4 bloqueados | Nada | Contador e emissor fiscal |
| K. Ora Connect / Nogle | 5 parciais | Nada | Nogle: o tipo da chave, as respostas e o contrato de cada operação |
| L. PayJoy e Aiva | (em POS-013 e PAY-002) | Nada | Contrato e documentação de cada financeira. O prazo de repasse já se grava na tela (FIN-007a) |
| M. Loja online | 4 parciais, 1 não iniciado e 2 bloqueados | Nada | Proprietário: marcar os produtos do site, D-024, D-025 e a transportadora. Provedor de pagamento |
| N. Marketplaces | 5 parciais e 3 bloqueados | Nada | Contrato e autorização de cada canal |
| O. WhatsApp | 1 parcial, 6 não iniciados e 1 bloqueado | Nada | Meta: a conta, o número e o modelo de mensagem aprovado |
| P. Meta | 2 parciais e 1 bloqueado | Nada | Proprietário: a conta de anúncios e a decisão D-022 |
| Q. Assistência técnica | 2 parciais | Nada | Proprietário: aceite e P5. WhatsApp oficial (OS-005) |
| R. Qualidade, operação e IA | 11 parciais e 6 não iniciados | **QUAL-006 e QUAL-013:** o aviso no celular do dono quando o servidor erra | Proprietário: a proteção da `main` e o Dependabot no GitHub, D-041, D-042 e D-044, a infraestrutura de produção, o piloto (QUAL-009). Jurídico: LGPD (QUAL-011). Provedor de IA |

## A ordem dos próximos lotes que não dependem de ninguém

1. ~~**CRM-009** (área D): o pedido do site no histórico do cliente.~~ Feito em 24/11 (lote CRM-009a).
2. ~~**POS-015** (área E): a prova com login e a rede desligada.~~ Feito em 24/11 (lote POS-015a).
3. ~~**PAY-011** (área F): o chargeback ligado ao estorno da venda.~~ Feito em 24/11 (lote PAY-011a; a antecipação e o débito de valor diferente esperam o arquivo real de cada maquininha).
4. ~~**FIN-002** (área G): a taxa das financeiras no resultado do mês.~~ Feito em 24/11 (lote FIN-002a; o imposto calculado e a comissão esperam o contador e a D-014).
5. ~~**FIN-006** (área G): o depósito agrupado da maquininha.~~ Feito em 24/11 (lote FIN-006a; o saldo final do OFX real espera o arquivo).
6. **REPORT-001, 003 e 006** (área H): as notas da "jornada com login".
7. **QUAL-006 e QUAL-013** (área R): o aviso no celular quando o servidor erra.

Depois deles, o que resta depende de resposta do proprietário, de contrato ou de terceiro. A seção 4 passa à frente de tudo assim que as três respostas do catálogo chegarem.

## Seção 6: revisão de código

Feita área por área, junto de cada lote: o que o lote toca é conferido nos pontos da lista do prompt (tipos e validação, dinheiro e arredondamento, datas e fuso, vazio e erro, autorização no banco, loja e organização, concorrência e repetição, código antigo e duplicado). Função em uso só é refeita depois de conferir que a instalada no banco é igual à do repositório.
