# Roteiro de aceite: lote EXT-a (o extrato da maquininha por arquivo)

- **Quem faz:** o proprietário, no computador (ou no celular), com a conta de dono.
- **Quanto tempo leva:** uns 10 minutos.
- **O que precisa:** um extrato de verdade da maquininha da Santa Cândida, baixado do site ou do app da PicPay (ou da PagBank): o **relatório de vendas** de um dia ou de uma semana, em CSV ou Excel.
- **O que o lote entrega:** o ORA-PAY-009 (passa a testado), e partes do ORA-PAY-010 e do ORA-FIN-006 (passam a parcial). Plano de 16/11, Onda 3, item E3.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que não bateu.

## Antes de começar

- **Use o relatório de vendas da maquininha.** Ele não traz o nome dos clientes.
- **Não use, por enquanto, o extrato do banco (OFX).** Ele pode trazer o nome de quem pagou o Pix, e isto é a homologação: dado de cliente de verdade só entra aqui com a sua autorização.

## O que mudou

1. **O extrato entra por arquivo.** Você diz qual coluna é a data, o valor e o resto; o sistema sugere pelo nome da coluna.
2. **Para cada linha, o sistema sugere a venda:** mesmo valor, mesmo dia, mesma loja, mesmo meio de pagamento.
3. **Nada é conciliado sozinho.** Você concilia uma linha por vez, ou todas as "certas" de uma vez.
4. **O resumo mostra:**
   - o bruto das vendas;
   - as taxas;
   - o líquido;
   - o que ainda vai cair.
5. **Também aparece a venda do sistema que o extrato não trouxe.**

## O que você faz

1. No menu, abra **Gestão → Conciliação**. No celular, a Conciliação fica em **Mais**.
2. Toque em **"Extratos por arquivo: importe e concilie de uma vez"** e depois em **Importar extrato**.
3. Preencha:
   - **De onde:** "Da loja Santa Cândida";
   - **Tipo:** "Da maquininha";
   - **Nome:** por exemplo, "PicPay da Santa Cândida";
   - **Pagamentos:** marque os que o extrato traz, por exemplo, Pix e cartão na maquininha PicPay.
4. Escolha o arquivo.
   - Confira a coluna de cada campo: **a data e o valor** são obrigatórios; a taxa, o líquido, a data do repasse e o NSU ajudam.
   - Embaixo aparece quantos lançamentos foram lidos, o período e o total dos créditos e dos débitos.
5. Toque em **Importar o extrato**. Confira com o site da maquininha:
   - o bruto;
   - as taxas;
   - o líquido;
   - o que ainda vai cair.
6. Volte e importe **o mesmo arquivo de novo**: o sistema avisa que ele já tinha sido importado e abre o mesmo extrato.
7. Numa linha, toque em **Tirar da conta**, escreva um motivo e confirme. Depois, em **Voltar para a conta**.

## O que você confere

1. Os números do resumo batem com os do site da maquininha.
2. Nenhuma linha foi lida errado: data, valor e taxa.
3. O mesmo arquivo não entra duas vezes.
4. Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Conciliar de verdade.** A sugestão precisa de uma venda registrada no sistema com Pix ou cartão. Isso vem com as contas de teste, que dependem da chave secreta do Supabase.
- **As parcelas.** O extrato com uma linha por parcela (a agenda de recebíveis) não casa: por isso, use o relatório de vendas.
- **O extrato do banco e as contas bancárias de cada empresa.** Ficam para depois da sua autorização sobre os dados de clientes e de um lote seguinte.
