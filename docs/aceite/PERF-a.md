# Roteiro de aceite: lote PERF-a (os chips contados à parte nas metas e no bônus)

- **Quem faz:** o proprietário.
- **Onde:** no sistema real, em **ora5g.com.br**, com a sua conta de dono.
- **Em que loja:** na loja de teste **Santa Cândida (teste)**. Ela tem CNPJ cadastrado e o Chip Ora Connect com estoque.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** o seu pedido de 18/11 ("o chip é vendido separado do celular. Eles têm que contar como separado", decisão D-050), agora também nas metas: os chips viram uma **medida própria**, ao lado do valor vendido líquido, dos aparelhos, dos acessórios e do Ora Connect confirmado.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **As metas têm cinco medidas.** Antes eram quatro. A nova é **Chips (unidades)**: a loja e cada vendedor podem ter uma meta de chips no mês.
2. **Como os chips contam:**
   - entram os chips das vendas concluídas no mês;
   - saem os chips das vendas canceladas e os chips devolvidos, no mês em que isso acontece;
   - é a mesma regra dos aparelhos.
   - A ativação na operadora continua contando à parte, na medida **Ora Connect**.
3. **A tabela "Equipe no mês"** ganhou a coluna **Chips**, com a meta e quanto dela já foi feito.
4. **O bônus pode ter faixas de chips.** Nas regras do bônus, a medida **Chips** tem as mesmas faixas das outras.
5. **O extrato do vendedor** mostra "+1 chip" na venda e tem a coluna **Chips** na planilha.
6. **O teto do pagamento subiu.** No fechamento do mês, o valor aprovado por vendedor ia até R$ 400.000,00, que são as quatro medidas na faixa mais alta (R$ 100.000,00 cada). Com cinco medidas, o teto é R$ 500.000,00.

## Os passos (no sistema real)

1. Entre em **ora5g.com.br** com a sua conta e escolha a loja **Santa Cândida (teste)**.
2. Abra **Metas**. Na loja inteira, toque em **Editar**. Digite **30** em **Chips (unidades)**, escreva o motivo ("teste da meta de chips") e toque em **Salvar**.
3. Confira o cartão da loja: aparece **Chips**, com "0 de 30".
4. Venda um chip:
   - abra o caixa, se ainda não estiver aberto: **Caixa → Abrir caixa**;
   - em **Vender**, busque "chip", adicione o **Chip Ora Connect** (R$ 10,00) e escolha o ICCID;
   - pague com **Pix direto**, com um código de comprovante de teste, e conclua.
5. Volte em **Metas**. O cartão da loja mostra **Chips: 1 de 30**. Na tabela **Equipe no mês**, a sua linha tem 1 na coluna **Chips** (a sua linha pode aparecer como "fora da equipe atual", porque o dono não é da equipe da loja).
6. Abra o seu extrato: digite **ora5g.com.br/metas/extrato** no navegador. A venda aparece com "+1 chip". Na planilha, a coluna **Chips** tem o 1.
7. Opcional: em **Metas**, no cartão do bônus, toque em **Definir as regras** (ou **Regras do bônus**) e veja a medida **Chips** com as faixas. Não precisa salvar regra nenhuma.
8. Cancele a venda de teste: **Vendas → a venda → Cancelar**, com o motivo. Em **Metas**, os chips do mês voltam a 0.
9. Se quiser, retire a meta de teste: **Editar**, apague o 30, escreva o motivo e salve.
10. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **As ativações e as recargas de cada vendedor, separadas, na visão do gerente.** Hoje:
  - o vendedor vê as dele separadas em **Ora Connect**;
  - o gerente vê as da loja separadas;
  - nas metas, as três operações (ativação, portabilidade e recarga) somam juntas na medida **Ora Connect** (D-014).
  - Se quiser uma meta só de recargas, ou só de ativações, diga.
- **A venda nas lojas de verdade** espera o CNPJ de cada loja (tela **Lojas**) e as contas da equipe (a chave do Supabase no servidor).

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/metas.test.ts` e `packages/banco/src/bonus.test.ts`):
  - o chip vendido conta 1 na medida dos chips e não mexe nos aparelhos nem nos acessórios;
  - a meta de chips da loja e do vendedor;
  - o cancelamento no mês tira o chip da conta;
  - a regra do bônus dos chips paga a faixa batida;
  - o extrato mostra o chip, fato a fato, e o total bate com o das metas.
- **No banco** (`packages/banco/src/bonus-fechamento.test.ts`): o valor aprovado acima de R$ 500.000,00 é recusado.
- **Na tela** (em `apps/plataforma/src/`: `app/metas/*.test.ts`, `lib/metas/painel.test.ts` e `lib/bonus/*.test.ts`):
  - o campo **Chips (unidades)** no formulário das metas;
  - a coluna **Chips** na equipe e no extrato;
  - as faixas dos chips nas regras do bônus;
  - o teto novo no fechamento.
