# Roteiro de aceite: lote AUD-a (o que a auditoria do Codex de 17/11 pediu)

- **Quem faz:** o proprietário. A parte 2 é no sistema; a parte 1 depende do arquivo da Rein no servidor.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** as correções que a auditoria do Codex de 17/11 (PR #104) e o adendo de 16/11 (PR #100) pediram:
  - o rodapé da planilha da Rein (achado F01);
  - os anúncios com as devoluções, a moeda e o fuso (aceite A14);
  - os estados honestos dos requisitos e o registro da leitura.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.
- **Registro da leitura:** [`docs/alinhamento/LEITURA_AUDITORIA_2026-11-17.md`](../alinhamento/LEITURA_AUDITORIA_2026-11-17.md). Ele diz, para cada achado, o que já estava corrigido, o que este lote corrige e o que segue aberto.

## 1. A planilha da Rein: o rodapé fica de fora (F01)

- **O problema:** a última linha do seu relatório de produtos (a linha 2.273) é a dos totais, só com números, sem a palavra "Total". Ela entrava como se fosse um produto sem código e sem nome e travava a segunda parte da importação.
- **Agora:** ela fica de fora, à vista. A prévia diz "Ficou de fora a linha 2273 da planilha: rodapé de totais no fim da planilha (sem código e sem nome, só números em N colunas; em M delas o número é a soma das linhas de cima)".
- **O que não mudou de propósito:** a linha do meio sem código, ou a última com algum texto, continua indo à prévia como erro, para nada sumir calado.
- **Como conferir:**
  1. Ponha o arquivo `relatorioProdutos131258.xlsx` no servidor, em `~/entrada/rein/` (sem passar pelo chat).
  2. Eu rodo a prova do Codex (2.271 produtos, em partes de 2.000 e 271) e te mostro o resultado.
  3. No sistema, a importação é enviada pelo administrador e aprovada por você. A conta de administrador espera a chave do servidor (J1).

## 2. Os anúncios: a devolução sai da conta

1. Entre como dono e abra **Gestão → Relatórios → Anúncios**.
2. No fim da tela, em **"Como cada número é calculado"**, confira que aparecem:
   - o CPA pelas vendas que ficaram (sem as devolvidas por inteiro);
   - o ROAS pela receita líquida (o valor das vendas menos o que foi devolvido);
   - o "recebido de fato" sem o que voltou ao cliente em dinheiro, Pix ou cartão;
   - "Atribuição não é prova de causa";
   - a moeda (só real) e o fuso da conta de anúncios.
3. **Com uma venda de campanha devolvida**, a linha da campanha mostra:
   - "2 vendas (1 devolvida por inteiro)";
   - "receita R$ X − devolvido R$ Y = R$ Z";
   - "(já sem R$ W devolvidos ao cliente)".
   Hoje o banco da homologação não tem venda de campanha, então este passo fica para quando houver.
4. **Um arquivo em dólar** (a coluna "Amount spent (USD)") é recusado com a mensagem "O valor usado deste arquivo não está em reais (BRL)".

## 3. Os estados dos requisitos

- **ORA-MKTPL-005 e ORA-MKTPL-008 voltam a "parcial".** Falta o que o aceite A13 pede: o líquido recebido conferido com o extrato do banco, as divergências por pedido e a importação automática de cada canal.
- **Os 16 requisitos que não tinham linha no arquivo de status ganham a sua**, como "não iniciado", com o que falta. A conta por estado não muda.

## O que segue aberto (depende de você)

- O arquivo da Rein no servidor (`~/entrada/rein/`).
- A chave do servidor (J1), para as contas de administrador, gerente e vendedor de teste.
- A proteção da `main` no GitHub (pendência 5.5).
- A proteção de senha vazada no Supabase (pendência 5.8).
- A decisão D-049: a transferência reserva o estoque já no pedido ou só na separação?
