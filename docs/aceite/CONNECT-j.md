# Roteiro de aceite: lote CONNECT-j (as funções que mudam algo na Nogle)

- **Quem faz:** o proprietário, com a sua conta; se quiser, também um gerente.
- **Quando:** depois da publicação. **Este roteiro muda algo de verdade na Nogle:** escolha uma ação que você faria de qualquer jeito (por exemplo, o apelido de uma linha sua, ou um bloqueio e o desbloqueio logo depois numa linha sua).
- **O que o lote entrega** (o seu pedido de 25/11, "todas as funções da Nogle", e a sua resposta "Sim, todas para dono e gerentes"; a D-061): em **Ora Connect → Ações na Nogle**:
  - **Linha do cliente:** bloquear (perda, roubo, troca, bloqueio de IMEI ou inadimplência) e desbloquear a linha; bloquear e desbloquear a recarga automática; mudar o apelido da linha; programar recargas pela carteira da Ora (quantas, ou sem fim); reenviar o SMS de aceite da portabilidade.
  - **Cliente na Nogle:** cadastrar e atualizar o cadastro do cliente na Nogle.
  - **Compra de chip com entrega:** a Nogle manda o chip pelo correio para o cliente (até 15 por pedido, com ou sem plano), pago pelo link (o cliente paga) ou pela carteira da Ora.
  - **PDVs da Nogle:** criar um PDV (com o usuário dele), atualizar, criar um usuário no PDV e inativar o PDV (com todos os usuários). O gerente mexe só no PDV ligado à loja dele; o dono, em todos.
  - **Pedidos:** cada pedido com a situação (na fila, feita, recusada pela Nogle ou resultado desconhecido), a mensagem da Nogle e o resultado (o número do pedido e o link de pagamento da compra, a próxima recarga, o PDV criado). Dá para cancelar enquanto está na fila.
  - **A segurança:** só o dono e os gerentes pedem; cada pedido fica com quem pediu, o motivo e a auditoria; o servidor envia **uma vez** em até 1 minuto, e o pedido sem resposta clara fica como resultado desconhecido e **não é reenviado** (confira no painel da Nogle). O CPF, o endereço e a senha do usuário do PDV ficam guardados à parte, só até o envio.
- **Resposta:** "aceito" ou "não aceito".

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Ações na Nogle**.
2. Abra **Mudar o apelido da linha**, digite uma linha sua, um apelido e o motivo, e toque em **Pedir**. O pedido aparece em **Pedidos** como **Na fila**; recarregue em 1 minuto: deve ficar **Feita**. Confira o apelido em **Consultar linha → Situação da linha**.
3. Se quiser, teste outra ação de verdade que você faria de qualquer jeito (por exemplo, bloquear e desbloquear uma linha sua).
4. Peça uma ação e cancele antes de sair, com o motivo: ela fica **Cancelada**.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- Cada pedido passa por uma função do banco que confere quem pede e o que cada ação precisa (a linha com DDD, o plano da lista da Nogle, o CPF ou CNPJ, o CEP e a cidade da lista oficial, a senha de 8 a 64 caracteres); o clique repetido não cria dois pedidos.
- Onde a documentação da Nogle diverge, a escolha está escrita: no reenvio do SMS vão os dois nomes de campo; no PDV novo, o endereço e o usuário vão em listas, como no exemplo oficial. A primeira de cada ação diz se a Nogle aceitou.
- Migration `20261125172755_acoes_na_nogle`; a reversão tira as funções e as tabelas (o que a Nogle já fez não volta).
