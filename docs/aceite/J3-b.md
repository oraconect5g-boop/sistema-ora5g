# Roteiro de aceite: lote J3-b (a venda com desconto aprovado e pagamento misto, na loja de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático da venda com desconto e três formas de pagamento, no site no ar (itens ORA-POS-005, ORA-POS-006, ORA-POS-007 e ORA-PAY-001). O seu sim de 21/11: "Desconto com aprovação" e "Pagamento misto", só nas lojas de teste, sem cliente de verdade e sem cobrança de verdade.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com duas contas de teste da loja **Santa Cândida (teste)**, o **Vendedor (teste)** e o **Gerente (teste)**, num celular simulado de 360 px, no site no ar:

1. Confere quantas **capas de proteção (ACE-0001)** estão livres no Estoque.
2. O vendedor abre o PDV (abre o caixa com troco zero, se estiver fechado), **cancela uma venda que tenha ficado aberta** numa vez que falhou e **abre uma venda nova** com uma capa (R$ 79,00).
3. Dá **R$ 5,00 de desconto**. O sistema avisa que o desconto **passa do limite** e pede a aprovação do gerente ou do dono. O vendedor pede, com o motivo; o botão **Concluir venda fica travado** enquanto a aprovação está pendente.
4. O gerente **aprova** na tela **Aprovações de desconto**, com uma observação.
5. De volta ao PDV, a venda mostra **"desconto aprovado"** e o total de **R$ 74,00**. O cliente paga em três formas: **R$ 30,00 em dinheiro**, **R$ 20,00 em Pix direto** e **R$ 24,00 no cartão da maquininha PicPay**, cada uma com um comprovante de teste ("PIX-TESTE-…" e "NSU-TESTE-…").
6. A venda é **concluída**. O comprovante mostra o desconto, o total e as três formas, e o Estoque tem **uma capa a menos**.

Leva cerca de 20 segundos. Rodou três vezes em 21/11 (às 09:18, 09:21 e 09:26) e passou nas três.

**Por que todo desconto pede aprovação hoje:** a categoria das capas (e a dos celulares) ainda não tem a política de desconto (o teto e a margem mínima), que é sua decisão (P14) e se ajusta no Cadastro de produtos. Sem ela, o limite sem aprovação é zero.

## O que fica gravado (só na loja de teste)

- **Por vez:** uma venda concluída no nome do Vendedor (teste): a capa de proteção, R$ 79,00, com R$ 5,00 de desconto aprovado pelo Gerente (teste), total de R$ 74,00, pago em dinheiro, Pix direto e cartão PicPay.
- **Em 21/11:** as vendas **nº 9, 10 e 11**. O estoque da capa na loja de teste foi de **19 para 16**.
- **O caixa do Vendedor (teste) fica aberto**, com o dinheiro da última venda. A prova do caixa (J3-a) fecha e confere esse caixa quando roda.
- **Nenhuma cobrança de verdade:** o Pix e o cartão são só registros, com comprovantes inventados para o teste; nenhuma maquininha foi usada. **Nenhum cliente e nenhum pedido de nota fiscal.**

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Vendas** (no menu) e escolha o período que inclui 21/11: devem aparecer as vendas nº 9, 10 e 11 do **Vendedor (teste)**, cada uma de R$ 74,00.
3. Abra uma delas: o comprovante deve mostrar a capa, o desconto de R$ 5,00 e as três formas de pagamento, com os comprovantes de teste.
4. Se quiser, faça você mesmo: uma venda com desconto pelo celular (o pedido de aprovação aparece para o gerente em **Aprovações de desconto**, no menu, em Gestão) e pague em mais de uma forma.
5. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/venda-com-desconto-real.spec.ts --project=celular-360 --workers=1
```

## O que fica de fora

- **Negar um desconto** e o pedido que vence (30 minutos): os testes do banco cobrem; o teste no site só aprova.
- **A conciliação do Pix e do cartão** (conferir o comprovante com o extrato): é a prova "Conciliação de pagamento", do lote J3-f.
- **Qual maquininha foi usada:** nenhuma maquininha está cadastrada no sistema ainda (nem nas lojas de teste), e o PDV só pergunta qual foi usada quando a loja tem uma cadastrada em **Maquininhas** (no menu, em Gestão). O pagamento no cartão ficou com o comprovante e sem a maquininha.
- **Financiamento (PayJoy, Aiva) e boleto:** dependem das integrações, que seguem bloqueadas sem contrato.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
