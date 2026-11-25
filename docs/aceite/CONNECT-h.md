# Roteiro de aceite: lote CONNECT-h (a consulta completa: o relatório do número e o do cliente)

- **Quem faz:** o proprietário, com a sua conta; se quiser, também um vendedor numa loja.
- **Quando:** depois da publicação, uns 10 minutos. **Só consulta:** nada muda na linha, no chip ou no cliente. Tenha à mão o número de uma linha Ora Connect de verdade (a sua, por exemplo), o ICCID de um chip e o CPF de um cliente que tenha linha (o seu, por exemplo).
- **O que o lote entrega** (o seu pedido de 25/11: "todas as funções da Nogle, consulta completa, relatório individual, número situação", e a sua escolha dos relatórios do número e do cliente; a D-060):
  - **Relatório completo do número:** numa página só, que dá para imprimir ou salvar em PDF, tudo de uma linha: a situação (ativa ou cancelada, bloqueada, o plano, o titular com o CPF mascarado, a data de ativação, até quando vai o plano e quando o cliente perde o número sem recarga), o saldo (internet, minutos e SMS), as recargas, as cobranças em aberto, o consumo do mês (internet, ligações e SMS), a portabilidade (quando a linha veio de outra operadora), a ativação do chip e as transações dos últimos 12 meses.
  - **Relatório do cliente (pelo CPF ou CNPJ):** o cadastro dele na Nogle (o nome, o documento mascarado, o contato e a cidade) e todas as linhas dele, cada uma com a situação.
  - **As consultas que faltavam, uma a uma:** cobranças em aberto, ligações e SMS do mês, se o número existe na Nogle, a situação do chip (virgem, ativo ou com problema) e se o chip já tem plano pago.
  - Como no CONNECT-g: só quem pediu vê, a resposta é apagada em 24 horas, e o **CPF ou o CNPJ do relatório do cliente também** (fica só o mascarado).
  - **A correção:** nas recargas da linha, o valor mostrado agora é o que o cliente pagou; antes aparecia o que a Ora pagou à Nogle (o custo), que não é para a tela da loja.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que ficou errado ou faltando.

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Consultar linha**.
2. Digite o número de uma linha (com DDD), deixe **Relatório completo do número** e toque em **Consultar**. Em alguns segundos ele fica **Respondida**: toque em **Abrir o relatório** e confira as seções. Experimente **Imprimir ou salvar em PDF**.
3. Digite um CPF (ou CNPJ) de cliente, escolha **Relatório do cliente** e consulte. Abra o relatório: o cadastro, as linhas e a situação de cada uma.
4. Se quiser, teste as consultas avulsas novas (cobranças, ligações, SMS, situação do chip, plano pago).
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- O worker monta cada relatório em partes: os detalhes da linha primeiro (sem eles, o relatório para aí, com o aviso da Nogle); depois cada parte, e a parte que a Nogle não respondeu aparece marcada, sem derrubar as outras. No relatório do cliente, o cadastro primeiro, depois as linhas (as ativas primeiro, até 10 com a situação).
- O que nunca é guardado: o PDF de instalação do eSIM, o documento inteiro do titular, os links e códigos de pagamento das cobranças, o termo da portabilidade, a rua e o CEP do cliente e quem pediu cada recarga.
- Migration `20261125164116_consulta_completa_da_nogle`; a reversão volta as funções ao CONNECT-g.
