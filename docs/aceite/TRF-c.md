# Roteiro de aceite: lote TRF-c (o pedido de transferência reserva na origem)

- **Quem faz:** o proprietário.
- **Quando:** quando a loja de origem tiver estoque no sistema (depois da carga da planilha da Rein). Até lá, este roteiro é só de leitura, e a demonstração já explica a regra (`/demo/estoque`, aba "Transferências").
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o achado F18-05 da reanálise do Codex de 18/11 e a sua orientação de 18/11 (a decisão D-049): reduzir o disponível da origem quando o produto é colocado em transferência (ORA-INV-007).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **Antes:** pedir uma transferência não mexia no estoque. O produto só saía do disponível da origem quando a origem separava. Nesse meio-tempo, um vendedor da origem podia vender a peça pedida.
2. **Agora, pedir já reserva na origem.** A quantidade sai do disponível de lá na hora, e a venda não leva o que foi pedido. O físico continua lá até o envio.
3. **Sem o disponível suficiente, o pedido não é feito,** e a tela avisa. Na remessa com vários produtos, se faltar um, nenhum é pedido.
4. **No aparelho e no chip,** o pedido reserva a quantidade, e o IMEI ou o ICCID continua sendo escolhido na separação. Separar não reserva de novo: a reserva só passa da quantidade para cada IMEI.
5. **Cancelar ou recusar** devolve a reserva ao disponível da origem. **Enviar** baixa o físico da origem uma vez só.

## Os passos (com estoque na loja de origem)

1. Na loja que vai receber, peça 1 unidade de um acessório que a outra loja tem, de um destes jeitos:
   - pelo estoque: abra o produto e toque em "na rede";
   - pela remessa: **Estoque e catálogo → Transferências entre lojas → "Pedir vários produtos de uma vez (nova remessa)"**.
2. Na loja de origem, veja o saldo do produto:
   - o "reservado" subiu 1 e o "disponível" caiu 1, já no pedido;
   - o físico continua igual.
3. Cancele o pedido: o disponível da origem volta.
4. Peça de novo, separe e envie:
   - o físico da origem cai 1 só no envio;
   - o reservado volta ao que era antes.
5. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/transferencias.test.ts`, `transferencia-remessa.test.ts` e `concorrencia.test.ts`):
  - o pedido reserva uma vez, mesmo enviado de novo com a mesma chave;
  - a venda não leva o reservado, e o pedido não leva o que a venda reservou;
  - o aparelho troca a reserva pela do IMEI sem contar duas vezes;
  - cancelar antes ou depois da separação devolve tudo;
  - a remessa é tudo ou nada;
  - com duas conexões ao mesmo tempo num PostgreSQL de verdade, o pedido e a venda disputando a última capa, nas duas ordens: quem chega primeiro fica, e o outro é recusado;
  - a mesma remessa enviada duas vezes ao mesmo tempo reserva uma vez.
- **Na tela:** cada transferência diz o que o passo fez no estoque (`app/transferencias/transferencias.test.ts`), e a remessa avisa que pedir já reserva (`remessa.test.ts`).

## Um ponto para você decidir depois

**Hoje quem pede é quem consulta o estoque na loja de destino.** Com a reserva no pedido, esse pedido prende o estoque da origem até a origem separar, recusar ou alguém cancelar. Se quiser que só a gerência peça, isso é uma mudança de permissão, e eu só faço com a sua resposta.
