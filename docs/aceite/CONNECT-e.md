# Roteiro de aceite: lote CONNECT-e (a transferência de chips pela Nogle, pelo sistema)

- **Quem faz:** o proprietário, com a sua conta (só o dono pede).
- **Quando:** depois da publicação, uns 10 minutos, no celular ou no computador. **Este roteiro move chips de verdade na Nogle:** escolha uma transferência que você faria de qualquer jeito, como repor a Butiatuvinha ou o Almirante, que estão abaixo do mínimo.
- **O que o lote entrega:** em **Ora Connect → Chips na Nogle**, o cartão **Transferir chips**, para mandar chips do estoque geral da Ora na Nogle para uma loja ou PDV, de três jeitos: **eSIM por quantidade** (a Nogle escolhe quais), **um chip físico** (pelo ICCID) ou **um lote de físicos** (do primeiro ao último ICCID).
  - É a sua decisão de 25/11 ("Sim, monte"), depois da primeira transferência de verdade (1 eSIM para a Santa Cândida): **só o dono pede**. O gerente, o vendedor e o administrador não veem o formulário, e o banco recusa se tentarem.
  - O servidor envia **uma vez só**, em até 1 minuto, e **confirma pelo estoque da loja**: lê o estoque do PDV antes e depois, porque a resposta da Nogle só diz "Sucesso." (não diz qual chip foi).
  - Se a Nogle não responder, o pedido fica como **resultado desconhecido** e **não é reenviado**: confira no painel da Nogle. Isso evita mandar chips em dobro.
  - Dá para **cancelar** o pedido enquanto ele está **na fila** (antes de sair), com o motivo. Tudo fica na auditoria.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que ficou errado ou faltando.

## Os passos

1. Entre no sistema com a sua conta e abra **Ora Connect → Chips na Nogle**.
2. No cartão **Transferir chips**, confira os livres no estoque geral (a última leitura) e peça uma transferência:
   - eSIM: escolha "eSIM por quantidade", a loja em "Para onde" e a quantidade;
   - ou um chip físico: escolha "Um chip físico", a loja e o ICCID (use "Onde está o chip?" para achar um livre);
   - escreva o motivo, se quiser (por exemplo, "reposição da Butiatuvinha"), e toque em **Pedir a transferência**.
3. O pedido aparece em **Transferências pedidas** como **Na fila**. Recarregue a tela depois de 1 minuto: ele deve ficar **Confirmada**, com os chips que chegaram.
4. Confira na loja escolhida (em **Lojas**, "Ver os chips") e, se quiser, no painel da Nogle.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- O pedido passa por uma função do banco que confere que é o dono, o estoque livre da última leitura (descontando o que já está pedido) e se algum chip já está noutro pedido em andamento; o clique repetido não cria dois pedidos.
- O worker do servidor pega a fila a cada minuto, lê o estoque do PDV, envia, lê de novo e grava o resultado (confirmada, em parte, recusada ou resultado desconhecido). Depois de enviar, ele lê o estoque inteiro de novo, e a tela já mostra os chips na loja nova.
- No lote, o ICCID vai sem o último dígito (o verificador), como a Nogle pede.
- O envio que não terminar em 10 minutos vira resultado desconhecido e não volta para a fila.
