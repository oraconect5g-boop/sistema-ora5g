# Roteiro de aceite: lote PAY-011a (o débito do extrato confirma o estorno da venda; o chargeback ligado ao estorno)

- **Quem faz:** o proprietário.
- **Quando:** a leitura, quando quiser, com a sua conta de dono em `ora5g.com.br`, pelo celular ou pelo computador. Os passos com um débito de verdade, quando houver o primeiro extrato da maquininha com um estorno ou um chargeback (ou com o seu sim para a prova que grava nas lojas de teste).
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a parte do item ORA-PAY-011 ("gerir chargebacks, estornos, antecipação e ajustes", com o efeito financeiro e a comissão sem contar duas vezes) que liga o débito do extrato ao estorno da venda. O item **segue parcial**.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** o débito do extrato (o estorno ou o chargeback que a maquininha ou o banco tirou) só saía da conta com um motivo escrito à mão. O estorno da venda era confirmado digitando o código do comprovante. Os dois não se falavam: nada impedia o mesmo débito de "provar" dois estornos, e a venda não mostrava que o dinheiro saiu de verdade.
2. **Agora o débito é a prova do estorno, e cada débito prova um estorno só.** Na tela do extrato, cada débito a conferir mostra os estornos de venda desta loja com o mesmo valor e o mesmo meio do extrato (cartão ou Pix), pedidos até 60 dias antes ou depois. Em cada um:
   - **o estorno ainda espera a confirmação:** o botão **"Confirmar o estorno"**. O comprovante passa a ser a referência da linha do extrato (ou "EXTRATO-nº-Llinha", quando a linha não tem referência), e a observação do estorno diz de qual extrato e de qual linha veio. No cancelamento, o pagamento da venda fica estornado; na devolução, o pagamento continua como estava, e só o reembolso fica confirmado. Como a confirmação à mão, **não se desfaz**. Confirmar continua sendo da gerência, na loja da venda: quem está em outra loja vê o aviso para trocar de loja;
   - **o estorno já foi confirmado à mão:** o botão **"Guardar como a prova"**. O estorno não muda; o débito fica como a prova dele. Essa ligação se solta depois, com o motivo ("Soltar do estorno");
   - a caixa **"Foi contestação do cliente no banco (chargeback)"** marca o débito com o selo "chargeback". A marca se corrige depois, com o motivo, sem mexer no estorno.
3. **O chargeback de uma venda que ainda está concluída:** a loja cancela a venda primeiro, pela tela dela (o cancelamento de sempre: o estorno nasce a confirmar, a venda sai das metas e da comissão uma vez só, e o aparelho fica em "Itens a receber de volta", que pode ser fechado como "não voltou"). Depois, no extrato, o débito confirma o estorno. **Nada é lançado duas vezes:** o débito não vira uma saída à parte.
4. **Na venda:** o cartão "Estornos de cartão, Pix e financeira" diz, para quem concilia, "Confirmado pelo débito do extrato nº tal (de onde), linha tal, de dd/mm/aaaa", com o selo "chargeback" quando for o caso. O toque abre o extrato.
5. **Na lista dos extratos e no extrato:** a contagem "de estorno" e o filtro **De estorno**. O débito ligado não sai da conta nem concilia uma venda: ele já tem o uso dele.

## O que fica de fora (por isso o ORA-PAY-011 segue parcial)

- **O débito de valor diferente do estorno** (o chargeback de parte da venda, ou com a tarifa junta no mesmo débito): continua saindo da conta, com o motivo.
- **A antecipação como operação própria:** depende do arquivo real de cada maquininha, com a taxa da antecipação.
- **A busca automática do extrato na maquininha** (ORA-PAY-013): sem contrato.

## Os passos (só leitura; nada é gravado)

1. Entre na **Santa Cândida (teste)**. Abra **Gestão → Conciliação** e toque em **"Extratos por arquivo: importe e concilie de uma vez"**. A lista diz "Nenhum extrato importado ainda": é o esperado (nenhum extrato foi importado na homologação).
2. Abra **Vendas**, toque em **"30 dias"** e em **"Canceladas"**. Abra a **venda nº 12** (ou a nº 14), que teve parte paga no Pix e foi cancelada.
3. No cartão **"Estornos de cartão, Pix e financeira"**, o texto de cima diz que o estorno só fica confirmado "com o código do comprovante do estorno, ou com o débito do extrato importado (em Conciliação, Extratos por arquivo)". O estorno dessa venda foi confirmado à mão em 21/11, então não há débito ligado a ele.
4. Responda **"aceito"** ou **"não aceito"**.

Para ver o débito confirmando o estorno na tela, é preciso importar um extrato com um débito e ter uma venda de cartão cancelada na loja de teste. Isso grava, e eu só faço com o seu sim (ou com o primeiro extrato de verdade).

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/debito-do-extrato-e-estorno.test.ts`, 11 testes):
  - o estorno pendente é sugerido ao débito do mesmo valor; ligar confirma o estorno pela confirmação de sempre, com a referência da linha como comprovante, e o pagamento do cancelamento fica estornado (o da devolução continua confirmado); repetir não grava de novo;
  - um uso só, dos dois lados: a linha que confirmou não confirma outro estorno, não sai da conta e não se desfaz; o estorno não aceita outro débito; a confirmação à mão com outro código continua recusada;
  - o estorno já confirmado só ganha a prova; a ligação se solta com o motivo, e o estorno não muda;
  - as regras: só débito, do mesmo valor, de um meio do extrato, com a data entre o dia da venda e hoje;
  - a loja: o extrato da loja não alcança o estorno de outra; o da rede alcança, e confirmar pede a loja da venda no turno;
  - quem pode: quem não concilia não vê nem liga; quem concilia sem ser da gerência guarda a prova, mas não confirma; a outra rede não alcança;
  - a devolução com reembolso no cartão; o chargeback que chega antes do cancelamento; a marca de chargeback corrigida com o motivo; a auditoria de cada mudança;
  - a regra vale para qualquer caminho, não só para a tela (gatilho e índice no banco).
- **Duas pessoas ao mesmo tempo** (`packages/banco/src/debito-do-extrato-e-estorno-concorrencia.test.ts`, 6 testes, num PostgreSQL 17 de verdade): dois débitos no mesmo estorno, o mesmo débito em dois estornos, a confirmação à mão e o extrato nas duas ordens, e tirar da conta o débito que está sendo ligado. Em nenhuma ordem um débito prova dois estornos nem um estorno fica com dois débitos, e ninguém espera em círculo.
- **Quem não tem acesso** (`packages/banco/src/autorizacao-funcoes.test.ts`): as três funções novas recusam os 13 tipos de atacante, e nada muda no banco (215 funções conferidas).
- **Na tela** (`apps/plataforma/src/app/pagamentos/extratos/extratos.test.ts`, `apps/plataforma/src/lib/extratos/estornos.test.ts`, `apps/plataforma/src/lib/extratos/regras.test.ts` e `apps/plataforma/src/app/vendas/comprovante-rodadas.test.ts`): o que cada pessoa vê e pode fazer em cada sugestão; cada recusa do banco com a mensagem dela; a anotação na venda, sem leitura a mais; a resposta do banco fora da forma tratada como falha, nunca como meia sugestão.
- **No banco do site, sem gravar nada** (24/11), com as contas de teste, num extrato fictício importado só dentro da prova:
  - antes do cancelamento, os débitos de R$ 29,00 receberam como sugestão os estornos nº 1 e nº 2 (das vendas nº 12 e nº 14, já confirmados à mão), e o débito de R$ 79,00 nenhuma;
  - a venda nº 22 (cartão PicPay, R$ 79,00) foi cancelada dentro da prova: nasceu o estorno nº 3, a confirmar, e o débito de R$ 79,00 passou a recebê-lo;
  - o Dono (teste), com a Loja de teste 2 no turno, viu a sugestão como "fora da loja do turno" e o confirmar foi recusado ("entre na loja da venda");
  - o Gerente (teste) confirmou o estorno pelo débito, marcando o chargeback: o estorno ficou confirmado com o comprovante da linha, o pagamento ficou estornado; o mesmo pedido de novo voltou como repetido; as recusas esperadas aconteceram (a mesma linha em outro estorno, outro débito no estorno já provado, o crédito, tirar da conta, desfazer e confirmar à mão com outro código);
  - a marca de chargeback foi tirada e posta de novo com o motivo, sem mudar o estorno, e a auditoria guardou cada mudança;
  - o débito de R$ 29,00 ligado ao estorno nº 1 só guardou a prova (o estorno não mudou); a outra linha no mesmo estorno foi recusada; soltar a linha com o motivo funcionou, e o estorno continuou igual;
  - o resumo e a lista contaram 2 débitos de estorno; o Vendedor (teste) e o Gerente 2 (teste) foram recusados e não leram as linhas do extrato.
  - Tudo foi desfeito no fim: 0 extratos, os estornos nº 1 e nº 2 como estavam, a venda nº 22 concluída com o pagamento conciliado, e a numeração devolvida.
- **A prova de leitura no site** (`apps/plataforma/e2e/debito-do-extrato-real.spec.ts`): só abre telas. Roda depois da publicação, e o resultado fica no registro das publicações, a branch `registro/publicacoes` do repositório.
- **Migration:** `20261124082944_debito_do_extrato_confirma_o_estorno` (aplicada no banco da homologação em 24/11, com a reversão guardada): três colunas novas nas linhas do extrato, um gatilho, três funções novas e quatro refeitas. A reversão solta os débitos ligados; o estorno que um débito confirmou continua confirmado.
