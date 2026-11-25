# Roteiro de aceite: lote CONNECT-d (o estoque de chips da Nogle no sistema, só leitura)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, uns 5 minutos, no celular ou no computador.
- **O que o lote entrega:** a tela **Ora Connect → Chips na Nogle**, com o estoque de chips virgens que a Nogle tem em cada loja e o estoque geral da Ora na Nogle (a MVNO), lido pelo servidor a cada 30 minutos, das 7h às 22h (a sua escolha de 24/11). **Só leitura:** nada aqui transfere, ativa ou reserva chip, e o livro de estoque da Ora não muda.
  - A primeira chamada de verdade à Nogle foi feita em 24/11, com o seu "sim, só consultas": a chave entra como **marca** (a pergunta P9 ficou respondida sem precisar da Nogle). Há 18 PDVs na Nogle; cada uma das 11 lojas tem o seu, ligado pelo nome, como você decidiu (o Santa Felicidade é o 5218). O PDV 5407 é o cadastro da matriz na Nogle; ele e as 6 revendas aparecem como "outros PDVs".
  - O sistema guarda só o necessário: do PDV, o número, o nome, a cidade e o estoque mínimo; do chip, o ICCID, o tipo e a data do repasse. Não guarda CPF, CNPJ, contato, endereço nem as pessoas do PDV, nem o código de ativação do eSIM, que a Nogle manda junto e que bastaria para instalar o chip.
  - A tela avisa a loja que está abaixo do estoque mínimo que a própria Nogle tem para ela (10 chips nas lojas) e acha um chip pelo fim do ICCID ("Onde está o chip?").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que ficou errado ou faltando.

## Os passos

1. Entre no sistema e abra **Ora Connect → Chips na Nogle**.
2. Confira a **hora da última leitura** no aviso do alto da tela (de 30 em 30 minutos, das 7h às 22h).
3. Na parte **Lojas**, confira que as 11 lojas aparecem, cada uma com o PDV dela na Nogle e a quantidade de chips físicos e de eSIM. Se alguma estiver ligada ao PDV errado, abra o PDV ("Ver os chips") e troque a loja em "Loja ligada a este PDV".
4. Abra os chips de uma loja ("Ver os chips") e compare com o que o painel da Nogle mostra para o mesmo PDV.
5. Em **Onde está o chip?**, digite os últimos dígitos do ICCID de um chip que você tem em mãos e veja em que loja (ou no estoque geral) ele está.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- O servidor lê a Nogle com o worker da Ora Connect (que continua desligado para ativar, recarregar ou portar): a lista dos PDVs, o estoque geral e o de cada PDV, e grava tudo de uma vez; o PDV que não respondeu fica como estava, com a hora da leitura antiga.
- Quem vê o quê é o banco que decide (RLS): o dono vê a rede toda; o administrador vê os PDVs e as contagens (para ligar o PDV à loja), sem a lista dos chips; quem opera a Ora Connect numa loja (o gerente e o vendedor) vê só o PDV e os chips da loja dele.
- A ligação de um PDV a uma loja fica na auditoria, com quem fez e o motivo.
- Achado na primeira consulta: o filtro de tipo da Nogle funciona com "fisico" sem acento; com acento, como a Nogle escreveu em 10/11, ele devolve tudo. A leitura pede o estoque inteiro e separa pelo tipo de cada chip, então não depende disso.
- A transferência de chips pela API (um chip, um lote ou eSIM por quantidade) está documentada, mas não foi ligada: ela muda o estoque na Nogle e espera o seu sim, operação por operação.
