# Roteiro de aceite: lote CONTAS-a (as contas bancárias, com o saldo pelo extrato)

- **Quem faz:** o proprietário.
- **Onde:** no sistema real, em **ora5g.com.br**, com a sua conta de dono.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** o extrato do banco já entrava por arquivo (lote EXT-a), mas não havia o cadastro das contas de cada empresa nem o saldo delas. Agora cada conta tem um **saldo pelo extrato**:
  - o saldo que você informa num dia (o que o banco mostra no fim daquele dia);
  - mais o que entrou e menos o que saiu, pelas linhas dos extratos ligados à conta, depois daquele dia.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **A tela Contas bancárias.** O caminho é **Gestão → Conciliação de pagamentos → Extratos → Contas bancárias**.
2. **Cada conta mostra:**
   - o saldo pelo extrato e até que dia ele vale;
   - o que entrou e o que saiu desde o saldo inicial;
   - os extratos ligados a ela.
3. **Você liga cada extrato do banco à conta dele.** Dois extratos da mesma conta não podem cobrir os mesmos dias: a mesma linha contaria duas vezes, e o sistema recusa.
4. **Tirar um extrato da conta, ou mudar os dados dela, pede o motivo.** A mudança fica na auditoria.
5. **Quem vê e mexe:** só quem concilia pela rede inteira (o dono). O gerente de uma loja não vê as contas.
6. **O saldo é o do banco, não o das vendas.** Ele conta todas as linhas do extrato, conciliadas com uma venda ou não.

## Os passos (no sistema real)

1. Entre em **ora5g.com.br** com a sua conta.
2. Abra **Gestão → Conciliação de pagamentos → Extratos** e toque em **Contas bancárias**.
3. Em **Nova conta**, cadastre uma conta de teste:
   - empresa: a sua;
   - apelido: "Conta de teste";
   - banco: o nome de qualquer banco;
   - saldo inicial: R$ 1.000,00, no fim de um dia da semana passada.
4. Se já houver um extrato do banco importado, ligue-o à conta em **Ligar um extrato do banco**. Confira o saldo e até que dia ele vale.
5. Se não houver, importe um extrato do banco de teste em **Extratos → Importar extrato**, com o tipo "Do banco". Depois volte e ligue-o.
6. Ao final, desative a conta de teste: **Mudar os dados da conta**, desmarque "A conta continua ativa" e escreva o motivo.
7. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **O saldo que o próprio arquivo do banco traz (o saldo final do OFX).** Hoje a importação lê as linhas, não o saldo. A conferência entre o saldo calculado e o do banco fica para quando houver o arquivo real.
- **O depósito agrupado da maquininha no banco.** Hoje ele sai da conta com motivo, linha a linha.
- **As contas de outras empresas da rede.** Entram quando a empresa estiver cadastrada.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/contas-bancarias.test.ts`):
  - só quem concilia pela rede cadastra e vê a conta; o gerente da loja e a outra rede, não;
  - o saldo é o inicial mais as linhas depois do dia dele; a linha do próprio dia não conta duas vezes;
  - o extrato que cruza o período de outro da mesma conta é recusado;
  - só o extrato do banco vai para a conta;
  - tirar ou trocar pede o motivo, e a conta inativa não recebe extrato;
  - a mudança fica na auditoria com o motivo.
- **Na tela** (em `apps/plataforma/src/`: `lib/contas-bancarias/regras.test.ts` e `app/pagamentos/contas-bancarias/contas-bancarias.test.ts`):
  - a leitura estrita do saldo (forma inesperada é falha, nunca zero);
  - os formulários e as mensagens de cada recusa.
