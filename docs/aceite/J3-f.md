# Roteiro de aceite: lote J3-f (o financeiro da loja de teste: contas a pagar, conciliação e repasse da financeira)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático do financeiro no site no ar (itens ORA-FIN-003, ORA-FIN-004, ORA-FIN-005, ORA-PAY-002 e ORA-PAY-007). Os seus sins de 21/11: "Contas a pagar", "Conciliação de pagamento" e "A receber das financeiras", só nas lojas de teste, sem cobrança de verdade.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com o **Vendedor (teste)** e o **Gerente (teste)** da **Santa Cândida (teste)**, num celular simulado de 360 px, no site no ar:

1. **Contas a pagar.** O gerente lança uma **conta de luz fictícia** (R$ 100,00, vence hoje) e registra o **pagamento**, com uma referência de teste. Lança outra (R$ 50,00, "lançada em dobro") e **cancela**, com o motivo.
2. **Conciliação.** O vendedor vende uma capa no **cartão da maquininha PicPay** (R$ 79,00, comprovante de teste). O gerente, em **Conciliação de pagamentos**, concilia esse pagamento com um **extrato fictício**: caiu hoje, líquido de **R$ 76,71** (R$ 2,29 de taxa).
3. **A receber da financeira.** O vendedor vende um **Galaxy A15** (R$ 1.299,00) pela **PayJoy**: R$ 1.099,00 financiados em 12 parcelas (contrato de teste) e **R$ 200,00 de entrada** em dinheiro. O gerente, em **A receber das financeiras**, registra o **repasse fictício** da PayJoy: caiu hoje, **R$ 1.050,00** (a diferença, R$ 49,00, fica como a taxa da financeira).

Leva cerca de 30 segundos. Rodou uma vez em 21/11 (às 10:16) e passou. Não rodou a segunda vez para não vender o último Galaxy A15 livre da loja de teste (veja "Uma decisão sua").

## O que fica gravado (só na loja de teste)

- **Duas contas a pagar:** a de luz, **paga**, e a "em dobro", **cancelada**, as duas com "teste automático do financeiro" na descrição.
- **A venda nº 22** (uma capa no cartão), **conciliada** com o extrato fictício.
- **A venda nº 23** (o Galaxy A15 pela PayJoy, com a entrada em dinheiro) e o **primeiro "a receber" de financeira** do sistema, **recebido** com o repasse fictício.
- **Nenhuma cobrança, financiamento ou repasse de verdade:** a PayJoy não é chamada (a integração segue bloqueada sem o contrato) e os comprovantes são de teste.
- **O caixa do Vendedor (teste) fica aberto**, com a entrada de R$ 200,00; a prova do caixa (J3-a) fecha e confere esse caixa quando roda.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a loja **Santa Cândida (teste)**.
2. Abra **Contas a pagar** (no menu, em Gestão): a conta de luz em "pagas" e a "em dobro" em "canceladas", com o motivo.
3. Abra **Conciliação de pagamentos** (no menu, em Gestão): a venda nº 22, "conciliado", com o líquido, a taxa e a referência do extrato.
4. Abra **A receber das financeiras** (no menu, em Gestão): a venda nº 23, PayJoy, "recebida", com R$ 1.050,00 e a taxa de R$ 49,00.
5. Responda **"aceito"** ou **"não aceito"**.

## Uma decisão sua

- **Os aparelhos da loja de teste.** Cada vez que este teste roda, ele vende um Galaxy A15 da Santa Cândida (teste); hoje sobra **um**. Para o teste não gastar os aparelhos de teste, ele pode trazer o próprio aparelho: uma compra fictícia de um Galaxy A15 com IMEI de teste (do "Fornecedor (teste)"), **sem estorno**, vendida logo em seguida pela PayJoy. Isso é uma entrada de mercadoria que fica (a da prova J3-d é desfeita), por isso só faço com o seu sim.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/financeiro-real.spec.ts --project=celular-360 --workers=1
```

## O que fica de fora

- **O fechamento do bônus** (a quarta prova que o senhor aprovou): **não há nenhuma regra de bônus** no sistema, e a regra vale para a **rede inteira** (não por loja), então definir uma é decisão sua de política, não algo que o teste possa inventar. Além disso, o fechamento só abre **depois que o mês termina**. Com a regra definida, faço a prova em 1º/12, com o fechamento de novembro da loja de teste.
- **A conciliação por arquivo de extrato** (importar o extrato do banco ou da maquininha): fica para uma próxima prova, se o senhor quiser; hoje o teste concilia à mão, como a loja faz.
- **Parcela, desfazer e corrigir o repasse:** os testes do banco cobrem.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
