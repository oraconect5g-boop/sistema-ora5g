# Roteiro de aceite: lote CONNECT-g (as consultas da Nogle: Consultar linha e a Carteira)

- **Quem faz:** o proprietário, com a sua conta; se quiser, também um vendedor numa loja.
- **Quando:** depois da publicação, uns 5 minutos, no celular ou no computador. **Só consulta:** nada muda na linha, no chip ou na carteira; tenha à mão o número de uma linha Ora Connect de verdade (a sua, por exemplo) e o ICCID de um chip.
- **O que o lote entrega:** em **Ora Connect → Consultar linha** (a sua decisão de 24/11, "só consultas", e o seu pedido de 25/11 para as funções da Nogle da demonstração funcionarem):
  - **Pelo número da linha (com DDD):** a situação da linha (ativa ou cancelada, bloqueada, o plano, o titular com o CPF mascarado, até quando vai o plano e quando o cliente perde o número sem recarga), o saldo (internet, minutos e SMS), as recargas feitas e o consumo de internet do mês.
  - **Pelo ICCID do chip:** o número da linha daquele chip e a ativação dele (quando, o plano, o número e o cliente).
  - **Só para você:** o **saldo da carteira da Ora na Nogle** (o dinheiro que paga as ativações e recargas feitas pelo SALDO).
  - A resposta chega em poucos segundos (a tela se atualiza sozinha). **Só quem pediu vê** a resposta, e ela é **apagada em 24 horas**, porque pode ter o nome do titular; fica só o registro de quem consultou o quê e quando.
  - Cada pessoa faz até 30 consultas por hora (a Nogle não é para varredura).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que ficou errado ou faltando.

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Consultar linha**.
2. Digite o número de uma linha (com DDD), escolha **Situação da linha** e toque em **Consultar**. Em poucos segundos a resposta aparece em **Minhas consultas**. Confira se bate com o que você sabe da linha.
3. Repita com **Saldo da linha**, **Recargas da linha** e **Consumo de internet no mês**.
4. Digite o ICCID impresso num chip (19 dígitos, começa com 8955) e escolha **Número do chip** ou **Ativação do chip**.
5. Na aba **Carteira e relatórios** (desde o CONNECT-o, 25/11; antes ficava aqui), toque em **Consultar o saldo**, no cartão Consultar na Nogle, e confira o cartão **Saldo na Nogle** com o painel da Nogle.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- O site nunca fala com a Nogle: a tela grava o pedido no banco (função `connect_consultar`, que confere quem pode), e o worker do servidor, que roda a cada minuto e olha a fila a cada 2 segundos, consulta a Nogle e grava a resposta já limpa (só os campos que a tela mostra; nunca o PDF do eSIM nem o documento inteiro do titular).
- A consulta que a Nogle não responde falha com o aviso, e a pessoa pede de novo: a consulta não se repete sozinha.
- Migration `20261125141320_consultas_da_nogle`; a reversão tira a tabela e as funções.
