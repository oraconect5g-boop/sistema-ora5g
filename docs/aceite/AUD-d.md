# Roteiro de aceite: lote AUD-d (as duas transferências de teste da Muffato Santa, regularizadas)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o último achado da auditoria integral do Codex de 21/11 (F21-04), no item ORA-INV-007, feito com o seu "Sim, registrar" de 23/11.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que foi feito

1. **O problema:** em 17/11, num teste, saíram da **Santa Cândida (teste)** para a **Muffato Santa**, que é uma loja de verdade, uma capa e um Galaxy A15 de teste (as transferências nº 1 e nº 2). Ficaram "em trânsito" desde então, e a Muffato Santa tinha duas chegadas pendentes que nunca chegariam.
2. **O que não foi feito:** receber os dois na Muffato Santa e mandar de volta. Isso poria mercadoria de teste no estoque de uma loja de verdade.
3. **O que foi feito, em 23/11, pelas telas do site:**
   - na **Muffato Santa**, o Dono (teste) recebeu as duas com **zero**, com a explicação "Transferência de teste de 17/11: nada foi enviado de verdade. Regularização autorizada pelo proprietário em 23/11.";
   - na **Santa Cândida (teste)**, o Gerente (teste) registrou que os dois **voltaram para a origem**: a capa pela quantidade e o Galaxy pelo IMEI.
4. **Como ficou:**
   - as duas transferências aparecem como "Recebida com divergência", com "Faltou 1: 1 voltou para a origem", e não pedem mais nada de ninguém;
   - a **Muffato Santa** continua sem nenhum movimento de estoque: nada entrou e nada saiu dela;
   - a **Santa Cândida (teste)** voltou a ter a capa (13 no estoque) e o Galaxy (2 no estoque; o de IMEI final 0016 está disponível de novo);
   - nenhum movimento antigo foi apagado: a saída de 17/11 continua no histórico, e a volta de 23/11 ficou ao lado dela, com o nome de quem fez e o motivo.

## Os passos

1. Entre com a sua conta e escolha a loja **Muffato Santa**.
2. Abra **Estoque e catálogo → Transferências entre lojas**. As nº 1 e nº 2 aparecem como **Recebida com divergência**, com a frase "Faltou 1: 1 voltou para a origem". Não há botão "Receber e conferir" em nenhuma.
3. Abra **Estoque e catálogo → Estoque e conferência**: a Muffato Santa não tem a capa nem o Galaxy de teste.
4. Troque para a loja **Santa Cândida (teste)** e abra o estoque: a capa de proteção e o Galaxy A15 estão lá.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco do site, depois da regularização (23/11, 13:47):**
  - as duas transferências com zero recebido pelo Dono (teste) e uma resolução cada, "voltou para a origem", pelo Gerente (teste);
  - no livro do estoque de cada uma: a saída de 17/11 e a entrada de volta de 23/11, as duas na Santa Cândida (teste);
  - a Muffato Santa com 0 movimentos de estoque e nenhum saldo;
  - a conferência do livro (`privado.divergencias_estoque`) sem nenhuma diferença.
- **No site, só lendo** (`apps/plataforma/e2e/transferencias-leitura-real.spec.ts`, num celular de 360 px): as duas transferências regularizadas vistas pela Santa Cândida (teste) e pela Muffato Santa, onde não sobra chegada a receber.
- **A primeira prova das telas do TRF-d no site:** a regularização usou as telas novas de verdade ("receber com zero" e "voltou para esta loja", pela quantidade e pelo IMEI). Os outros dois destinos ("chegou depois" e "baixa") seguem provados só nos testes e no banco.
- **Sem migration e sem mudança nas telas:** só o registro do que foi feito e a prova de leitura.
