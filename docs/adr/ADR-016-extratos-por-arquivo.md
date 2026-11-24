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
4. **O chargeback ligado ao estorno da venda** (ORA-PAY-011): feito em 24/11, no lote PAY-011a (ver a atualização de 24/11, abaixo). O débito de valor diferente do estorno continua saindo da conta com o motivo.
5. **A busca do extrato pela API do provedor** (ORA-PAY-013): sem contrato verificado.

## Atualização de 18/11/2026: as contas bancárias (lote CONTAS-a)

- **A conta:** cada empresa da rede tem as suas contas (o apelido, o banco e, se quiser, a agência e a conta), com o saldo inicial no fim de um dia.
- **O extrato do banco vai para a conta:** só o do banco. Dois extratos da mesma conta não podem cruzar o período (a mesma linha contaria duas vezes): o banco recusa com OR044.
- **O saldo é o do extrato:** o saldo inicial mais todas as linhas dos extratos ligados depois daquele dia, conciliadas com uma venda ou não. Ele vale até o último dia coberto, e a tela diz que dia é esse.
- **Quem:** quem concilia pela rede inteira (o dono). A mudança da conta e tirar um extrato dela pedem o motivo, que vai para a auditoria.
- **Fica de fora:** a conferência com o saldo final que o arquivo do banco traz (o OFX real) e o depósito agrupado da maquininha.

## Atualização de 23/11/2026: a linha do extrato tem um uso só (lote AUD-c, achado F21-02 do Codex)

- **O defeito:** a mesma linha de crédito conciliava uma venda (aqui) e era o recebimento de um repasse de marketplace (ADR-018), nas duas ordens. Os dois caminhos não se viam.
- **Um uso só, e ele é a situação da linha:** pendente, conciliada (com uma venda), repasse (o recebimento de um repasse de marketplace) ou ignorada (fora da conta). Nenhuma tabela nova: a linha já tinha a situação.
- **A mesma trava nos dois caminhos:** conciliar, tirar da conta, desfazer, casar o repasse e desfazer o repasse travam a linha antes de decidir. A ordem é fixa, para ninguém esperar em círculo: nos repasses, a trava do repasse e depois a da linha; nos extratos, a da linha e depois a do pagamento.
- **A regra está nas tabelas, não só nas funções:** gatilhos na linha e no repasse recusam qualquer escrita que deixe a linha com dois usos (OR046) ou o repasse mudar de linha (OR045).
- **Repetir não grava de novo:** o mesmo pedido devolve o que já estava, marcado como repetido.
- **Desfazer libera a linha,** dos dois lados, com o motivo na auditoria.
- **Fica de fora o rateio:** um crédito dividido entre várias obrigações (parte de uma venda, parte de um repasse) pede um modelo próprio, com a soma das partes limitada ao valor da linha. Só quando houver o caso de verdade.
- **Reverter:** a reversão da migration `20261123121828_linha_do_extrato_um_uso` volta as funções à versão anterior e tira os gatilhos; as linhas de repasse voltam a pendentes.

## Atualização de 24/11/2026: o débito do extrato confirma o estorno da venda (lote PAY-011a, ORA-PAY-011)

- **O defeito de antes:** o débito do extrato (o estorno ou o chargeback que a maquininha ou o banco tirou) só saía da conta com o motivo, e o estorno da venda (`public.estornos_externos`) só se confirmava digitando o código do comprovante. O mesmo débito podia servir de prova a dois estornos, e a venda não mostrava que o dinheiro saiu.
- **Um débito, um estorno:** a linha ganha o uso "estorno", com o estorno que ela prova. Uma linha por estorno e um estorno por linha (índice único). O uso é o mesmo da regra do AUD-c: o débito ligado não sai da conta nem concilia uma venda.
- **As sugestões:** para cada débito pendente, os estornos da mesma loja (ou da rede, no extrato do banco), com o mesmo valor, de um meio do extrato, ainda sem débito, pedidos até 60 dias antes ou depois da data da linha (o chargeback aparece no extrato antes de a loja cancelar a venda; o estorno comum, depois).
- **Ligar:** o estorno que espera é confirmado pela confirmação de sempre, com a referência da linha como comprovante (ou "EXTRATO-nº-Llinha"); confirmar continua sendo da gerência da loja da venda (venda.cancelar), na loja do turno. O estorno já confirmado à mão só ganha a prova. O mesmo pedido de novo não grava outra vez.
- **Desfazer:** a prova de um estorno já confirmado se solta, com o motivo. O débito que confirmou o estorno não se solta (OR047): a confirmação não se desfaz (o registro é fixo desde os lotes de integridade), e a linha solta confirmaria outro estorno com o mesmo dinheiro.
- **O chargeback:** a marca diz que o débito foi contestação do cliente no banco; ela se corrige com o motivo. O chargeback de uma venda ainda concluída passa antes pelo cancelamento de sempre (o estorno a confirmar, a saída da comissão uma vez só e o retorno do aparelho, que pode fechar como "não voltou"). O débito não vira uma saída à parte: nada é lançado duas vezes.
- **As travas:** a linha, depois a venda e o estorno (a ordem de `public.confirmar_estorno_externo`). Nenhum caminho toma a venda ou o estorno e depois espera um débito do extrato.
- **A regra está na tabela:** um gatilho só aceita como estorno o débito de um estorno confirmado, do mesmo valor e da mesma rede, e não deixa soltar a linha que confirmou.
- **Fica de fora:** o débito de valor diferente do estorno (o chargeback de parte da venda, ou com a tarifa junta) e a antecipação como operação própria, que dependem do arquivo real de cada maquininha (E3).
- **Reverter:** a reversão da migration `20261124082944_debito_do_extrato_confirma_o_estorno` solta os débitos ligados e volta as funções do AUD-c. O estorno que um débito confirmou continua confirmado, com a referência da linha no comprovante e na observação.

## Consequências

1. **Quem concilia confere só o que não casou,** em vez de digitar cada pagamento.
2. **A conferência com o arquivo real** de cada maquininha e do banco faz parte do aceite (E3).
3. **Reverter:** a reversão da migration tira os extratos, as linhas, as funções e o gatilho. As conciliações já feitas ficam, porque são as de sempre.
