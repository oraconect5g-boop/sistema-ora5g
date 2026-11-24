# Roteiro de aceite: lote FIN-006a (o depósito agrupado da maquininha conferido com o extrato do banco)

- **Quem faz:** o proprietário.
- **Quando:** a leitura, quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador. Casar um depósito de verdade, quando houver o primeiro extrato do banco importado (ou com o seu sim para a prova que grava na loja de teste).
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** a parte do item ORA-FIN-006 ("conciliação bancária e contas multiempresa") que faltava no extrato do banco: o depósito agrupado da maquininha. O item **segue parcial**: falta a conferência com o saldo final que o arquivo do banco traz (depende do OFX de verdade).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** a maquininha (PicPay, PagBank) junta as vendas e deposita de uma vez: um crédito no extrato do banco para várias vendas. Esse crédito só saía da conta com um motivo escrito à mão, e ninguém conferia se o depósito bateu com o que o extrato da maquininha disse que ia cair.
2. **Agora existe a tela "Depósitos das maquininhas"** (em **Gestão → Conciliação → Extratos por arquivo**, no botão "Depósitos das maquininhas"). Ela mostra, para cada maquininha e cada dia, o depósito esperado: a soma do líquido das vendas já conferidas pelo extrato da maquininha com o dinheiro para aquele dia.
3. **Casar:** em cada depósito, a tela sugere as linhas de crédito do extrato do banco da rede, do dia até 3 dias depois, com o mesmo valor primeiro. Você escolhe a linha e toca em **"Casar"**. Se o valor for outro, a tela pede o motivo (a tarifa da transferência, por exemplo), e a diferença fica registrada.
4. **Um uso só:** a linha casada vira "depósito de maquininha" no extrato. Ela não concilia venda, não é repasse de marketplace e não sai da conta; só se solta desfazendo o depósito, com o motivo. Isso vale também com duas pessoas mexendo ao mesmo tempo.
5. **A tela também conta** os pagamentos das maquininhas ainda sem conciliação: o dinheiro deles ainda não tem dia, e eles ainda não entram em depósito nenhum.
6. **Só quem concilia pela rede inteira** (o dono) vê e casa os depósitos. O gerente concilia as vendas da loja dele, como antes.

## A regra que foi escolhida (e que você pode mudar)

O depósito é **um por maquininha e por dia** do dinheiro. Não sei ainda como a PicPay e a PagBank mandam o dinheiro para o banco de vocês: se depositam um valor por dia, se juntam vários dias, ou se o dinheiro fica na conta delas. Se juntarem vários dias num depósito só, case com o dia principal e explique a diferença no motivo, e me avise: o depósito passa a juntar vários dias.

## O que fica de fora (por isso o ORA-FIN-006 segue parcial)

- **A conferência com o saldo final do arquivo do banco:** depende do arquivo OFX de verdade (item E3 da sua lista).
- **Um crédito dividido entre obrigações diferentes** (parte de uma venda, parte de um repasse): não existe hoje.

## Os passos (só leitura; nada é gravado)

1. Abra **Gestão → Conciliação** e toque em **"Extratos por arquivo: importe e concilie de uma vez"**.
2. Toque no botão **"Depósitos das maquininhas"**.
3. Ponha o período **de 01/11/2026 a 24/11/2026** e toque em **"Ver"**.
4. Na lista, **"PicPay · dinheiro de 21/11/2026"**: 1 pagamento, vendido R$ 79,00, esperado R$ 76,71 (é a venda nº 22 da Santa Cândida (teste), conferida pelo extrato da maquininha). Ela aparece **"sem linha no extrato"**: ainda não há extrato do banco importado.
5. No alto, o quadro "Sem linha no extrato" diz também quantos pagamentos das maquininhas ainda estão sem conciliação.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/deposito-da-maquininha.test.ts`, 6 testes): o painel agrupa por maquininha e dia, com as sugestões; casar marca a linha, e repetir não grava de novo; o valor diferente pede o motivo; desfazer pede o motivo, solta a linha e fica na auditoria; a linha do depósito não concilia venda, não sai da conta, não se desfaz pelo extrato e não é repasse; a linha com outro uso não vira depósito; o débito e a linha do extrato de uma loja não são depósito; só o dono (o gerente e o vendedor não; o dono de outra rede só vê a dele); o pagamento de venda cancelada depois conta no depósito (o dinheiro caiu); a regra vale para qualquer caminho, não só para a tela.
- **Duas pessoas ao mesmo tempo** (`packages/banco/src/deposito-da-maquininha-concorrencia.test.ts`, 4 testes, num PostgreSQL 17 de verdade): o depósito e a conciliação disputando a mesma linha, nas duas ordens, e dois depósitos na mesma linha. Em nenhuma ordem a linha fica com dois usos.
- **Quem não tem acesso** (`packages/banco/src/autorizacao-funcoes.test.ts`): as duas funções novas que gravam recusam os 13 tipos de atacante (217 funções conferidas).
- **Na tela** (`apps/plataforma/src/app/pagamentos/depositos/depositos.test.ts`, `apps/plataforma/src/lib/extratos/depositos.test.ts` e `apps/plataforma/src/app/pagamentos/extratos/extratos.test.ts`): a lista, as sugestões, o casado com a diferença e o motivo, o aviso para quem não é o dono, cada recusa com a mensagem dela, a linha de depósito no extrato e a resposta do banco fora da forma tratada como falha.
- **No banco do site, sem gravar nada** (24/11), com as contas de teste: o painel de novembro mostrou o depósito da PicPay de 21/11 (1 pagamento, esperado R$ 76,71) e 4 pagamentos das maquininhas ainda sem conciliação (R$ 96,00); num extrato do banco fictício, importado só dentro da prova, a linha de R$ 76,71 veio primeiro nas sugestões; casar marcou a linha como depósito, e o pedido repetido não gravou de novo; conciliar, tirar da conta e desfazer pelo extrato foram recusados, como a mesma linha em outro depósito e a PagBank sem pagamento conciliado; desfazer sem motivo foi recusado, e com o motivo soltou a linha, com a auditoria; com valor diferente, só com o motivo; o Gerente (teste) e o Vendedor (teste) foram recusados. Tudo foi desfeito no fim: 0 extratos e 0 depósitos, e a numeração devolvida.
- **A prova de leitura no site** (`apps/plataforma/e2e/depositos-das-maquininhas-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261124111725_deposito_da_maquininha_no_banco` (aplicada no banco da homologação em 24/11, com a reversão guardada): a tabela dos depósitos, o uso novo da linha, três funções novas para a tela e sete refeitas (as regras do extrato e dos repasses, com o uso novo).
