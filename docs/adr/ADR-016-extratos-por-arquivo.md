# ADR-016 — O extrato da maquininha e do banco por arquivo, com a venda sugerida para cada linha

**Situação:** proposta (17/11/2026), reversível; aplicada no lote EXT-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 3, item E3 "Extratos", a parte que não depende do arquivo real; ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006).

## Contexto

1. **A conciliação do L7a é manual, um pagamento por vez.** Quem concilia lê o extrato no site da maquininha e digita a referência, o valor líquido e a data em que o dinheiro caiu.
2. **Os provedores dão o extrato em arquivo** (CSV, Excel ou OFX), mas o formato de cada um não foi conferido com um arquivo de verdade (pendência E3). Nenhum contrato de API das maquininhas foi verificado (ORA-PAY-013): nada é buscado sozinho.

## Decisões

1. **O arquivo entra sem supor o formato do provedor.**
   - **Planilha (CSV ou Excel):** a pessoa diz qual coluna é cada campo, com sugestão pelo nome da coluna: a data e o valor (obrigatórios), a taxa, o líquido, a data do repasse, a referência (NSU, código ou E2E do Pix), a maquininha, a descrição e a coluna de crédito ou débito.
   - **OFX do banco:** o formato padrão dos extratos de banco já traz os campos com nome, e dispensa a escolha.
   - **O que fica de fora, contado:** as linhas de saldo, de total, sem data, sem valor ou de valor zero.
   - **A linha que não dá para ler** (data fora do calendário, valor com letra, taxa em percentual) recusa o arquivo e aparece apontada: "Linha 12 do arquivo: não deu para ler a data".
2. **O mesmo arquivo não entra duas vezes.** A impressão digital (SHA-256) devolve o extrato que já existe. Na outra loja ou na rede, o mesmo arquivo é recusado.
3. **O extrato é da loja ou da rede.**
   - **Da loja:** a maquininha ou a conta da loja; importa e concilia quem concilia pagamentos nela (`pagamento.conciliar`), como no L7a.
   - **Da rede:** a conta do banco da empresa; só quem concilia pela rede inteira.
4. **Cada extrato diz os meios de pagamento que traz** (Pix na maquininha PicPay, cartão na maquininha PicPay, cartão na maquininha PagSeguro, Pix direto). As sugestões vêm só desses meios: o cartão da PagSeguro de mesmo valor não aparece num extrato da PicPay.
5. **A sugestão de cada linha de crédito:**
   - o pagamento confirmado e ainda não conciliado;
   - do mesmo valor bruto;
   - da venda concluída no dia da linha (um dia antes ou depois);
   - da loja do extrato;
   - da maquininha da linha, quando o arquivo e o pagamento dizem qual é;
   - a referência igual ao comprovante vem primeiro.
6. **Nada é conciliado sozinho.**
   - **Uma linha por vez:** a pessoa escolhe a sugestão.
   - **"Conciliar as certas":** de uma vez, as linhas com uma sugestão só, que não é sugestão de outra linha, e com o dinheiro já caído.
   - **A conciliação é a de sempre** (L7a): a referência da linha (ou "Extrato nº, linha nº"), o líquido do arquivo (ou o valor menos a taxa) e a data do repasse (ou a da linha), nunca antes do dia da venda.
   - **O repasse com data futura** ainda não concilia: o dinheiro não caiu.
7. **A linha que não é venda sai da conta com o motivo:** tarifa, estorno, chargeback, saque. Desfazer também pede o motivo, e tudo vai para a auditoria. Desfazer a conciliação na tela da Conciliação devolve a linha do extrato para "a conferir".
8. **Venda não é dinheiro recebido.** O resumo do extrato separa:
   - o bruto das vendas;
   - as taxas;
   - o líquido;
   - os estornos e as saídas;
   - o que ainda vai cair.

   A lista "Vendas do período ainda sem conciliação" mostra a diferença no outro sentido: a venda do sistema que o extrato não trouxe.

## O que fica de fora

1. **As parcelas.** O extrato com uma linha por parcela (a agenda de recebíveis) não casa com o pagamento: use o relatório de vendas, com uma linha por venda. A regra das parcelas depende dos prazos e das taxas do contrato de cada maquininha (E2).
2. **O depósito agrupado no banco** (um crédito para vários pagamentos): por enquanto, sai da conta com o motivo, e a conciliação é feita pelo extrato da maquininha.
3. **As contas bancárias de cada empresa, com o saldo** (a parte multiempresa do ORA-FIN-006).
4. **O chargeback ligado ao estorno da venda** (ORA-PAY-011): hoje a linha sai da conta com o motivo.
5. **A busca do extrato pela API do provedor** (ORA-PAY-013): sem contrato verificado.

## Atualização de 18/11/2026: as contas bancárias (lote CONTAS-a)

- **A conta:** cada empresa da rede tem as suas contas (o apelido, o banco e, se quiser, a agência e a conta), com o saldo inicial no fim de um dia.
- **O extrato do banco vai para a conta:** só o do banco. Dois extratos da mesma conta não podem cruzar o período (a mesma linha contaria duas vezes): o banco recusa com OR044.
- **O saldo é o do extrato:** o saldo inicial mais todas as linhas dos extratos ligados depois daquele dia, conciliadas com uma venda ou não. Ele vale até o último dia coberto, e a tela diz que dia é esse.
- **Quem:** quem concilia pela rede inteira (o dono). A mudança da conta e tirar um extrato dela pedem o motivo, que vai para a auditoria.
- **Fica de fora:** a conferência com o saldo final que o arquivo do banco traz (o OFX real) e o depósito agrupado da maquininha.

## Consequências

1. **Quem concilia confere só o que não casou,** em vez de digitar cada pagamento.
2. **A conferência com o arquivo real** de cada maquininha e do banco faz parte do aceite (E3).
3. **Reverter:** a reversão da migration tira os extratos, as linhas, as funções e o gatilho. As conciliações já feitas ficam, porque são as de sempre.
