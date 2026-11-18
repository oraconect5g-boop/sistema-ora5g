# Roteiro de aceite: lote PDV-c (as formas de pagamento da venda)

- **Quem faz:** o proprietário.
- **Quando:** já, pela demonstração (`ora5g.com.br/demo/vender` e `/demo/connect`). No PDV real, quando as lojas tiverem o CNPJ cadastrado e as contas de teste existirem: sem o CNPJ, a venda real é recusada.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o pedido do proprietário de 18/11 sobre a venda (decisão D-050): as formas de pagamento por um botão, a PayJoy e a Aiva só sobre o celular e com as parcelas, a entrada à parte, o chip pago à parte na mesma venda e o link de pagamento só na compra online.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **As formas de pagamento não ficam mais todas na tela.** Elas aparecem quando você toca em **Adicionar forma de pagamento** e escolhe uma. Cada forma mostra só os campos dela. Cabem até 8 formas na mesma venda.
2. **PayJoy e Aiva:**
   - aparecem como **"Recebimento via PayJoy"** ou **"Recebimento via Aiva"**;
   - você digita o valor financiado e as parcelas (de 1 a 48);
   - o número do contrato é opcional.
3. **A entrada é outro lançamento, na mesma venda.** Adicione dinheiro, Pix ou cartão e marque **"É a entrada da PayJoy ou da Aiva"**. Todos os valores podem ser editados.
4. **Cartão:** você escolhe as parcelas, de 1x (à vista) a 24x.
5. **O chip, os acessórios e os serviços entram na mesma venda e são pagos à parte.** O sistema não deixa a PayJoy ou a Aiva financiar mais que o valor do celular.
6. **A loja não gera link de pagamento.** O link fica só para a compra online. Na Ora Connect da loja, a recarga e a ativação são pagas no caixa e saem do saldo da Ora.
7. **O comprovante mostra cada lançamento.** Por exemplo:
   - "Recebimento via PayJoy: R$ 1.899,00 em 12x";
   - "Entrada do financiamento (Dinheiro): R$ 300,00";
   - "Pix na maquininha PicPay: R$ 79,00".

## O chip contado à parte

- **Nos relatórios** (Início e Relatórios), o chip já aparece separado do celular, no grupo da Ora Connect.
- **Nas metas,** os celulares contam por unidade e a Ora Connect conta as operações confirmadas.
- **Ainda não há uma meta só de chips.** Se você quiser, diga, e ela entra num próximo lote.

## Os passos (na demonstração)

1. Abra **ora5g.com.br/demo/vender**, no perfil vendedor.
2. Monte o carrinho:
   - busque "galaxy", toque no aparelho e escolha um IMEI;
   - busque "capa" e adicione.
3. Lance a PayJoy:
   - toque em **Adicionar forma de pagamento** e depois em **Financiamento PayJoy**;
   - confira que o valor sugerido é só o do celular (R$ 2.199,00);
   - digite as parcelas (por exemplo, 12);
   - mude o valor para R$ 1.899,00.
4. Lance a entrada: toque em **Adicionar forma de pagamento** e depois em **Dinheiro**, digite R$ 300,00 e marque **É a entrada da PayJoy ou da Aiva**.
5. Pague a capa: toque em **Adicionar forma de pagamento** e depois em **Pix na maquininha PicPay**. O valor que falta já vem preenchido.
6. Conclua a venda:
   - veja "Pagamento confere com o total";
   - conclua e confira o comprovante.
7. Teste o limite: numa venda nova, tente financiar o celular e a capa juntos. O sistema avisa que a PayJoy e a Aiva financiam só o celular.
8. Abra **/demo/connect**, na aba **Recarga**. Não há a opção de link: a recarga sai do saldo da Ora.
9. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **Os limites de parcelas são um padrão que se muda fácil (D-050):** 48 na PayJoy e na Aiva; 24 no cartão. Diga se forem outros.
- **A venda real na loja** continua esperando:
  - o CNPJ de cada loja;
  - as contas de teste (a chave do Supabase no servidor).
- **O link de pagamento da compra online** espera a escolha do provedor (E1).
- **O banco da Ora Connect ainda aceita o LINK,** para a compra online do futuro. A loja não oferece o LINK, e o servidor o recusa.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/vendas.test.ts`, o bloco PDV-c):
  - o celular pela PayJoy em 12 parcelas, com a entrada em dinheiro e o chip no Pix, cada um no seu lançamento;
  - o financiamento acima do celular, ou sem celular, recusado;
  - as parcelas obrigatórias na PayJoy e na Aiva, e de 1 a 24 no cartão;
  - a entrada só em dinheiro, Pix ou cartão, e só numa venda com a PayJoy ou a Aiva.
- **Na regra comum à tela e ao banco** (`packages/dominio/src/pagamento.test.ts`): a mesma conferência e o nome de cada lançamento no comprovante.
- **Na tela** (em `apps/plataforma/src/`: `app/vender/vender.test.ts`, `lib/vendas/*.test.ts` e `app/vendas/conserto-da-os.test.ts`):
  - o botão e os campos de cada forma;
  - o valor sugerido só do celular;
  - o resumo e o comprovante.
- **Na Ora Connect da loja** (`apps/plataforma/src/lib/connect/regras.test.ts`): o LINK recusado pelo servidor.
- **Na demonstração** (`e2e/demonstracao.spec.ts` e `e2e/connect.spec.ts`): o fluxo inteiro, no celular e no computador.
