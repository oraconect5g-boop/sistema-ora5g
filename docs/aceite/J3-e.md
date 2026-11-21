# Roteiro de aceite: lote J3-e (o cliente, o funil, a ordem de serviço, o pedido de nota e as metas, na loja de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** dois testes automáticos no site no ar: o cliente, o funil e a ordem de serviço (itens ORA-CRM-001, ORA-CRM-003, ORA-CRM-004, ORA-CRM-005, ORA-OS-001 a ORA-OS-004 e ORA-OS-006); e o pedido de nota, sem emitir, e as metas do mês (itens ORA-POS-011, ORA-FISC-001, ORA-FISC-002, ORA-PERF-003, ORA-PERF-004 e ORA-PERF-005). Os seus sins de 21/11: "Cliente e oportunidade", "Ordem de serviço", "Pedido de nota fiscal" e "Metas do mês", só nas lojas de teste, sem cliente de verdade e sem nota emitida.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que os testes fazem

Com o **Vendedor (teste)** e o **Gerente (teste)** da **Santa Cândida (teste)**, num celular simulado de 360 px, no site no ar:

**1. O cliente, o funil e a ordem de serviço** (cerca de 1 minuto):

1. O vendedor procura o **"Cliente (teste)"** pelo CPF de teste **000.000.001-91** (válido pelos dígitos verificadores, sem pessoa de verdade). Na primeira vez, não achou e cadastrou, com um WhatsApp de teste; nas seguintes, acha.
2. No **Funil**, a oportunidade da vez anterior é marcada como perdida ("Desistiu"), e o vendedor registra uma nova, escolhendo o cliente pelo CPF: "Galaxy A15 e chip", R$ 1.299,90, de origem "Na loja".
3. Agenda uma **ligação** para amanhã e, na **Agenda**, encerra como feita, com o resultado. A oportunidade passa para **"Em contato"**.
4. Pela ficha do cliente, o vendedor abre uma **ordem de serviço** de um aparelho fictício (IMEI de teste, "a tela não liga") e envia à **Assistência (teste)**.
5. O gerente registra, **em nome do técnico**, o recebimento, o **orçamento** (R$ 120,00 de mão de obra), o conserto e a volta; o vendedor registra a **aprovação do cliente** ("Na loja") e a chegada na loja.
6. O vendedor **cobra no PDV** (R$ 120,00 em dinheiro) e registra a **entrega**: a OS fica "Entregue e cobrada".

**2. O pedido de nota e as metas** (cerca de 30 segundos):

1. O vendedor vende uma capa (R$ 79,00 em dinheiro) e **pede a nota** no comprovante, sem nome nem CPF.
2. O gerente **aprova** na fila de **Notas fiscais** e depois **cancela o pedido**, com o motivo. **Nenhuma nota é emitida**: o sistema não fala com o fisco (a emissão se registra à mão, com a chave de acesso), e o teste não registra nenhuma.
3. O gerente define a **meta de novembro** da loja (R$ 5.000,00 de vendido líquido) e a do vendedor (R$ 2.000,00), com o motivo.
4. O vendedor vê a meta dele em **Metas** e, no **extrato**, as vendas, os cancelamentos e as devoluções do mês (as das outras provas de hoje).

O primeiro rodou três vezes em 21/11 (às 10:04, 10:07 e 10:10) e o segundo, duas (às 10:06 e 10:07); passaram em todas. Na segunda vez, o primeiro não fechou a oportunidade da vez anterior: ele contava os cartões do funil antes de a tela terminar de chegar (um erro do teste, não do sistema). Corrigido, a terceira vez fechou as duas anteriores.

## O que fica gravado (só na loja de teste)

- **O "Cliente (teste)"** (o cliente nº 1 do sistema), com o CPF de teste e um WhatsApp de teste. Nenhuma mensagem foi enviada: o teste não toca nos botões de aviso pelo WhatsApp.
- **Por vez:** uma oportunidade (que fica em "Em contato" até a vez seguinte, que a marca como perdida), uma ligação encerrada como feita, uma OS entregue e cobrada numa venda de R$ 120,00, uma venda de uma capa com o pedido de nota aprovado e cancelado.
- **Em 21/11:** as OS **nº 1, 2 e 3**; as vendas **nº 17, 19 e 21** (as cobranças das OS) e **nº 18 e 20** (as capas com o pedido de nota); as oportunidades **nº 1 e 2** perdidas e a **nº 3** em contato; as metas de novembro da Santa Cândida (teste).
- **O caixa do Vendedor (teste) fica aberto**, com o dinheiro das vendas; a prova do caixa (J3-a) fecha e confere esse caixa quando roda.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Clientes** (no menu) e procure pelo CPF **000.000.001-91**: deve aparecer o "Cliente (teste)"; na ficha, as ordens de serviço dele.
3. Abra o **Funil de oportunidades** (no menu, em Clientes): a oportunidade do "Cliente (teste)" em **Em contato**; abra e veja a ligação encerrada no histórico.
4. Abra **Assistência** (no menu, em Operação): a OS nº 3 "Entregue e cobrada", com a trilha dos 10 passos.
5. Abra **Notas fiscais** (no menu, em Gestão): a fila não deve ter pedidos do teste (foram cancelados).
6. Abra **Metas e desempenho** (no menu, em Gestão): a meta de novembro da Santa Cândida (teste), R$ 5.000,00, e a do Vendedor (teste), R$ 2.000,00.
7. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/clientes-e-os-real.spec.ts e2e/nota-e-metas-real.spec.ts --project=celular-360 --workers=1
```

## O que fica de fora

- **Emitir a nota de verdade:** depende do provedor fiscal e do contador (a integração segue bloqueada sem contrato); hoje a loja emite no portal e registra a chave de acesso.
- **O orçamento recusado** e a devolução do aparelho sem conserto: os testes do banco cobrem.
- **As peças do estoque da assistência** usadas na OS: ficam para uma próxima prova, se o senhor quiser.
- **Os avisos pelo WhatsApp** (comprovante, orçamento, aparelho pronto): o botão abre a conversa com a mensagem pronta; quem envia é a pessoa, e o teste não envia nada.
- **No CI:** os testes precisam do arquivo das contas de teste, que só existe no servidor; no CI, ficam pulados.
