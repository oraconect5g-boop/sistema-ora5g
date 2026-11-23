# Roteiro de aceite: lote TRF-e (a transferência com falta não some das pendências; a prova no site com as lojas de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o complemento do TRF-d (itens ORA-INV-007 e ORA-QUAL-006) e a prova no site que você autorizou em 23/11 ("Sim, provar"), entre as duas lojas de teste.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. **O defeito:** quando uma loja recebia uma transferência com falta, ela saía da lista do que espera alguém. O que tinha faltado continuava sem destino, mas ninguém era avisado: só quem abrisse a tela de Transferências via.
2. **Agora, enquanto o que faltou não tem destino, a transferência continua aparecendo:**
   - no **Início** da loja de origem e da loja de destino, no cartão **Transferências**, que passa a dizer "separar, enviar, receber ou dar destino ao que faltou";
   - no **sino** do topo, que usa a mesma conta;
   - na **Saúde da operação**, numa fila própria: **Transferências com falta**, com quantas são e há quantos dias a mais antiga espera.
3. **Quando tudo o que faltou tem destino** (chegou depois, voltou para a origem ou baixa), ela sai dos três lugares.

## A prova no site, com as lojas de teste (autorizada em 23/11)

O teste automático faz, no site no ar, num celular simulado de 360 px, com três pessoas de teste:

1. O **Gerente 2 (teste)**, na Loja de teste 2, pede 3 capas à Santa Cândida (teste).
2. O **Gerente (teste)**, na Santa Cândida (teste), separa e envia.
3. O Gerente 2 (teste) recebe contando **1**: faltaram 2.
4. Enquanto isso, o cartão Transferências do Início das duas lojas conta uma a mais, e a Saúde da operação mostra a fila "Transferências com falta".
5. O Gerente 2 (teste) confirma que **1 chegou depois**: ela entra no estoque da Loja de teste 2.
6. O Gerente (teste), na origem, vê o botão "Voltou para esta loja", mas **não** vê a baixa: dar baixa é só de quem ajusta estoque.
7. O **Dono (teste)** dá **baixa** na que não apareceu, com o motivo.
8. No fim: "Faltaram 2: 1 chegou depois e 1 com baixa", nenhum botão, as pendências de volta ao que eram, a Santa Cândida (teste) com 3 capas a menos e a Loja de teste 2 com 2 a mais.

**O que fica gravado:** uma transferência de 3 capas entre as duas lojas de teste e 1 capa baixada como perda na Santa Cândida (teste). Nenhuma loja de verdade é tocada, e nada é chamado fora do sistema.

O resultado da prova (a hora e o que passou) fica no registro das publicações, a branch `registro/publicacoes` do repositório.

## Os passos

1. Abra o **Início** da Santa Cândida (teste): o cartão **Transferências** mostra a contagem e a frase "separar, enviar, receber ou dar destino ao que faltou".
2. Abra **Gestão → Saúde da operação**: a fila **Transferências com falta** aparece entre as filas (ou entre as "sem nada esperando", quando não há nenhuma).
3. Abra **Estoque e catálogo → Transferências entre lojas**: a transferência do teste (o motivo começa com "teste automático da transferência com falta") mostra "Faltaram 2: 1 chegou depois e 1 com baixa" e o que cada pessoa escreveu.
4. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/pendencias-numa-ida.test.ts`): a conta das pendências inclui a transferência com falta sem destino, para a origem e para o destino; a resolvida não conta; a de outras lojas não conta; para cada perfil, a conta numa ida só é igual à das leituras separadas.
- **Na tela** (`apps/plataforma/src/lib/operacao/filas.test.ts`): a fila nova, com a contagem e a data do recebimento; num banco de antes do TRF-d, ela some sem derrubar as outras; quem só consulta o estoque não a lê.
- **A prova que grava** (`apps/plataforma/e2e/transferencia-com-falta-real.spec.ts`): cada passo olha o estado antes de agir; se parar no meio, continua de onde parou. No CI, fica pulada.
- **Migration:** `20261123174000_pendencia_da_falta_na_transferencia` (aplicada no banco da homologação em 23/11, com a reversão guardada). A função é a mesma de antes, com uma condição a mais; a instalada foi conferida com a do repositório antes da troca.
