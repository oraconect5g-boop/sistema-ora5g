# Roteiro de aceite: lote TRF-d (o que faltou no recebimento da transferência tem destino)

- **Quem faz:** o proprietário.
- **Quando:** a leitura, quando quiser. Os passos pedem uma transferência recebida com falta, o que hoje só existe se você autorizar a prova entre as duas lojas de teste ou a regularização das duas transferências da Muffato Santa (veja o fim deste roteiro).
- **Quanto tempo leva:** uns 5 minutos de leitura; uns 10 minutos com os passos.
- **O que o lote entrega:** o que faltava para o achado F21-04 da auditoria integral do Codex de 21/11 (PR #105), no item ORA-INV-007 (transferência entre lojas, com trânsito e recebimento).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **Antes:** a loja de destino recebia e conferia. Se faltava alguma coisa, a transferência ficava "recebida com divergência", com a explicação, e parava aí. O que não tinha chegado ficava sem lugar no sistema:
   - o aparelho ou o chip ficava "em trânsito" para sempre (e a entrada de mercadoria não aceita um aparelho em trânsito);
   - a capa ou o acessório tinha saído do estoque da origem e não entrava em lugar nenhum.
2. **Agora o que faltou tem três destinos, e só eles:**
   - **chegou depois:** a loja de **destino** confere e dá a entrada (lendo o IMEI do aparelho, ou contando o acessório);
   - **voltou para a origem:** a loja de **origem** confere e dá a entrada de volta, do mesmo jeito;
   - **baixa (não apareceu):** quem ajusta estoque na origem (hoje, só o dono) dá baixa em tudo o que ainda falta, com o motivo. No estoque da origem ficam registradas a volta e a perda, uma depois da outra: o saldo não muda, e a perda aparece como perda, com o nome de quem decidiu.
3. **Pode ser em partes.** De 3 que faltaram, 1 pode ter chegado depois, 1 voltado para a origem e 1 ter baixa. A soma nunca passa do que faltou.
4. **Cada lado faz só a sua parte.** O destino não diz que voltou para a origem; a origem não diz que chegou no destino; o vendedor não resolve.
5. **Cada resolução fica registrada e não muda:** quem, quando, quanto, o destino e o motivo (pelo menos 10 letras). O mesmo aparelho é resolvido uma vez só.
6. **Tocar duas vezes não lança duas vezes.** E se duas pessoas resolvem ao mesmo tempo, a segunda espera a primeira terminar.
7. **Na tela Transferências,** a transferência recebida com falta mostra uma frase como "Faltaram 3: 1 chegou depois, 1 voltou para a origem e 1 ainda sem destino", a lista do que já foi resolvido e, para quem pode, os botões **Chegou depois nesta loja**, **Voltou para esta loja** e **Dar baixa no que não apareceu**.

## Os passos (com uma transferência recebida com falta)

1. Na loja de **destino**, abra **Estoque e catálogo → Transferências entre lojas** e receba uma transferência contando menos do que veio, com a explicação. Ela fica "Recebida com divergência", com a frase "Faltou...".
2. Na loja de **origem**, abra a mesma tela, toque em **Voltou para esta loja**, diga quantas estão aí (ou leia o IMEI) e o que houve. O estoque da origem sobe de volta.
3. Se ainda sobrar alguma sem destino, com a sua conta de dono na loja de origem, toque em **Dar baixa no que não apareceu** e escreva o motivo.
4. A frase passa a dizer o destino de cada parte, e os botões somem: a divergência está resolvida.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/transferencia-divergencia.test.ts`, 8 casos):
  - voltou para a origem, com o saldo de volta;
  - em partes (chegou depois, voltou e baixa), com mais do que falta recusado;
  - o mesmo pedido de novo sem lançar de novo, e a mesma chave com outros dados recusada;
  - cada lado só faz a sua parte; o vendedor, a loja de fora e a outra rede não resolvem;
  - só a transferência recebida com divergência tem o que resolver;
  - no aparelho, pelo IMEI: um voltou e o outro chegou depois, cada um na loja certa; o mesmo aparelho não é resolvido duas vezes;
  - a baixa leva o aparelho de "em trânsito" a "baixado", com a volta e a perda no livro;
  - ninguém muda nem apaga uma resolução gravada, e ninguém grava direto na tabela.
- **Com duas conexões ao mesmo tempo, num PostgreSQL de verdade** (`transferencia-divergencia-concorrencia.test.ts`, 5 ordens): a soma das resoluções nunca passa do que faltou, e o mesmo aparelho termina numa loja só.
- **O livro do estoque continua fechando** em todos os casos (a conferência `privado.divergencias_estoque` não acha nada).
- **No inventário de autorização** (`autorizacao-funcoes.test.ts`): a função nova recusa os 13 tipos de quem não deveria chamá-la.
- **No banco da homologação, em 23/11, sem gravar nada:** com a identidade do Dono (teste), entre as duas lojas de teste, dentro de uma operação desfeita no fim: 3 capas pedidas, 1 recebida, o destino recusado ao dizer que voltou (42501), 3 "chegaram" com 2 faltando recusado, 1 voltou, o mesmo pedido de novo sem lançar, a baixa da última, tudo resolvido; o saldo da origem foi de 12 para 10 e o do destino de 9 para 10, como esperado, e o livro fechou. Depois dela: as mesmas 20 transferências, nenhuma resolução, os saldos em 12 e 9.
- **Na tela** (`apps/plataforma/src/app/transferencias/transferencias.test.ts` e `lib/transferencias/*.test.ts`): o que cada lado vê e pode fazer, a frase do que faltou, a ação com os dados errados que nem chegam ao banco e as recusas do banco viradas em mensagem.
- **No site, só lendo** (`apps/plataforma/e2e/transferencias-leitura-real.spec.ts`): a tela de Transferências abre com a leitura nova para o Dono (teste) e para o Gerente 2 (teste), e as duas transferências para a Muffato Santa seguem lá, sem ninguém mexer.
- **Migration:** `20261123133323_transferencia_resolver_divergencia` (aplicada no banco da homologação em 23/11, com a reversão guardada).

## O que preciso de você

1. **As duas transferências de teste para a Muffato Santa** (nº 1, uma capa; nº 2, um Galaxy A15 de teste; enviadas pela sua conta em 17/11). Com o seu "sim", faço assim:
   - na **Muffato Santa**, com o Dono (teste), recebo as duas com **zero** e a explicação "transferência de teste: nada foi enviado de verdade" (nada entra no estoque da Muffato Santa);
   - na **Santa Cândida (teste)**, digo que os dois **voltaram para a origem** (a capa e o Galaxy voltam ao estoque da loja de teste).
   - Fica no histórico da Muffato Santa que duas transferências de teste chegaram sem nada. O estoque dela não muda.
2. **A prova no site entre as duas lojas de teste** (uma transferência com falta e a resolução dela, gravando só nas lojas de teste): posso fazer?
