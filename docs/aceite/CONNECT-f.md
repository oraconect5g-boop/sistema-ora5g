# Roteiro de aceite: lote CONNECT-f (a Ora Connect pronta para operar nas lojas)

- **Quem faz:** o proprietário, com a sua conta, e um vendedor de uma loja que tenha chips da Nogle (a Santa Cândida, por exemplo).
- **Quando:** depois da publicação. **Este roteiro faz operações de verdade na Nogle:** a carteira da Ora paga à Nogle a ativação e a recarga. Faça com um cliente de verdade, que paga no caixa.
- **O que o lote entrega** (as suas decisões de 25/11: "Sim, ligue" e "Sim, pelo número"):
  - **Os planos da Nogle no caixa:** cada plano da lista oficial vira dois serviços no PDV, a **Recarga Ora Connect** e a **Ativação Ora Connect** daquele plano, pelo valor de face. Em 25/11 a lista tinha 5 planos: 6 GB + 5GB (R$ 49,90), 10 GB (R$ 54,90), 15 GB (R$ 64,90), 23 GB (R$ 74,90) e 45 GB (R$ 94,90). O servidor confere a lista todo dia às 6h: o plano novo entra no caixa, o que sai da lista sai do caixa, e o preço que muda é trocado (o antigo fica no histórico).
  - **Os chips da Nogle no estoque das lojas:** os chips físicos que a Nogle mostra no PDV de cada loja entram no estoque da loja **pelo número (ICCID)**, como "Chip Ora Connect", uma vez só. O vendedor vende o chip certo, pelo número, e a ativação aceita esse chip. O "CHIP ORA" da Rein (por quantidade) está zerado nas lojas: não conta em dobro.
  - **O preço do chip:** o "Chip Ora Connect" passa a custar **R$ 25,00**, o preço do CHIP ORA no catálogo da Rein (antes estava com R$ 10,00, um valor de teste). Se o preço for outro, mude em Produtos.
  - **Chips para conferir:** em **Ora Connect → Chips na Nogle**, você vê o chip que está no estoque de uma loja mas não está mais no PDV dela na Nogle (vendido ou ativado por fora do sistema, ou levado para outra loja). Nada é apagado: a loja confere.
  - **A trava do plano:** a operação só aceita a venda do **mesmo plano** (vendida a recarga de 10 GB, não dá para pedir a de 45 GB com ela). Sem a trava, a carteira da Ora pagaria um plano mais caro do que o cliente pagou.
  - **As operações ligadas:** a ativação, a recarga e a portabilidade saem para a Nogle pelo servidor, a cada minuto. A primeira de cada uma é acompanhada pelo Claude Code.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que ficou errado ou faltando.

## Os passos

1. Entre com a sua conta e abra **Ora Connect → Chips na Nogle**. Confira as lojas e o cartão **Chips para conferir** (logo depois da primeira entrada, ele deve dizer que não há nenhum).
2. Abra **Estoque** numa loja ligada (a Santa Cândida, por exemplo): os chips aparecem como "Chip Ora Connect", cada um com o ICCID.
3. **Ativação** (o vendedor, no celular): no **Vender**, ponha o chip (pelo ICCID impresso nele) e a **Ativação Ora Connect** do plano que o cliente quer; receba o pagamento e conclua a venda. Depois, em **Ora Connect**, registre a ativação: escolha a venda (ela aparece com o nome do plano), o mesmo plano, o DDD, o ICCID e os dados do cliente.
4. Em até 1 minuto, a operação sai para a Nogle. Recarregue a tela de Ora Connect e acompanhe a situação até **Confirmada** (ou o motivo da recusa).
5. **Recarga:** venda a **Recarga Ora Connect** do plano, conclua a venda e registre a recarga com a linha do cliente.
6. **Portabilidade:** registre com a linha, a linha da outra operadora e a operadora (não tem pagamento no caixa).
7. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- Duas migrations: `20261125130939_planos_e_chips_da_nogle_nas_lojas` (os planos no caixa, os chips no estoque e as divergências) e `20261125131555_servico_do_mesmo_plano` (a trava do plano na função que registra a operação; o resto da função não mudou).
- O worker do servidor chama os planos no caixa depois das listas da Nogle (todo dia às 6h) e a entrada dos chips depois de cada leitura do estoque (a cada 30 minutos, das 7h às 22h).
- O script do worker agora espera a execução anterior terminar, em vez de desistir: antes, a leitura do estoque das :00 e :30 podia se perder quando a fila das transferências, que roda a cada minuto, pegava a vez.
- O chip com o número fora da forma (o dígito verificador não confere) não entra e é contado no log; o eSIM não entra (a ativação do eSIM não leva ICCID).
