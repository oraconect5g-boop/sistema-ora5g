# Roteiro de aceite: lote PDV-c (as formas de pagamento da venda)

- **Quem faz:** o proprietário.
- **Onde:** no sistema real, em **ora5g.com.br**, com a sua conta de dono. A demonstração não é mais usada (o seu pedido de 18/11).
- **Em que loja:** na loja de teste **Santa Cândida (teste)**. Ela tem CNPJ cadastrado e produtos com estoque. As 11 lojas de verdade ainda não têm o CNPJ cadastrado e recusam a venda até ele entrar.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** o seu pedido de 18/11 sobre a venda (decisão D-050): as formas de pagamento por um botão, a PayJoy e a Aiva só sobre o celular e com as parcelas, a entrada à parte, o chip pago à parte na mesma venda e o link de pagamento só na compra online.
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
6. **A loja não gera link de pagamento.** O link fica só para a compra online. Na Ora Connect da loja, a recarga e a ativação usam o saldo da Ora e pedem o serviço já pago no caixa.
7. **O comprovante mostra cada lançamento.** Por exemplo:
   - "Recebimento via PayJoy: R$ 999,00 em 12x";
   - "Entrada do financiamento (Dinheiro): R$ 300,00";
   - "Pix direto: R$ 10,00".

## O chip contado à parte

- **Nos relatórios** (Início e Relatórios), o chip já aparece separado do celular, no grupo da Ora Connect.
- **Nas metas,** os celulares e os chips contam por unidade (os chips desde o lote PERF-a) e a Ora Connect conta as operações confirmadas.
- **A meta só de chips entrou no lote PERF-a.** O roteiro dela está em `PERF-a.md`.

## Os passos (no sistema real)

1. Entre em **ora5g.com.br** com a sua conta e escolha a loja **Santa Cândida (teste)**.
2. Abra o caixa: **Caixa → Abrir caixa**, com um fundo de troco (por exemplo, R$ 100,00).
3. Monte a venda em **Vender**:
   - busque "Galaxy", adicione o **Galaxy A15 128 GB Azul** (R$ 1.299,00) e escolha um IMEI;
   - busque "chip", adicione o **Chip Ora Connect** (R$ 10,00) e escolha o ICCID.
4. Lance a PayJoy:
   - toque em **Adicionar forma de pagamento** e depois em **Financiamento PayJoy**;
   - confira que o valor sugerido é só o do celular (R$ 1.299,00), e não o do chip;
   - mude o valor para R$ 999,00;
   - digite as parcelas (por exemplo, 12).
5. Lance a entrada: toque em **Adicionar forma de pagamento** e depois em **Dinheiro**, digite R$ 300,00 e marque **É a entrada da PayJoy ou da Aiva**.
6. Pague o chip: toque em **Adicionar forma de pagamento** e depois em **Pix direto**. O valor que falta (R$ 10,00) já vem preenchido. Digite um código de comprovante de teste, com 4 letras ou mais.
7. Conclua a venda e confira o comprovante. Ele mostra os três lançamentos, cada um com o nome dele.
8. Teste o limite: numa venda nova, tente financiar R$ 1.309,00 (o celular e o chip juntos). O sistema recusa: a PayJoy e a Aiva financiam só o celular.
9. Abra a **Ora Connect**, na recarga ou na ativação. Não há a opção de link: o pagamento é no caixa, pelo saldo da Ora.
10. Responda **"aceito"** ou **"não aceito"**.

A venda de teste fica registrada na loja de teste. Se quiser, cancele depois: **Vendas → a venda → Cancelar**, com o motivo.

## O que fica de fora

- **Os limites de parcelas são um padrão que se muda fácil (D-050):** 48 na PayJoy e na Aiva; 24 no cartão. Diga se forem outros.
- **A venda nas lojas de verdade** espera o CNPJ de cada loja e as contas de teste do gerente e do vendedor (a chave do Supabase no servidor, J1).
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
