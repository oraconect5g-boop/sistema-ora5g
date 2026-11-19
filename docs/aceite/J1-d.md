# Roteiro de aceite: lote J1-d (a transferência de um aparelho pelo IMEI, com duas pessoas, entre as lojas de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático do caso mais importante da transferência (ORA-INV-007): um aparelho escolhido pelo IMEI na origem e recebido lendo o mesmo número no destino. O seu sim de 19/11: "Sim, seguir", para o teste do aparelho com IMEI, ida e volta.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que o teste faz

Com o Gerente (teste) na Santa Cândida (teste) e o Gerente 2 (teste) na Loja de teste 2, cada um no seu celular simulado de 360 px, no site no ar, com um **Moto G24**:

1. **Ida:**
   - o Gerente (teste) pede um Moto G24 da Loja de teste 2;
   - o Gerente 2 (teste) separa **escolhendo o aparelho pelo IMEI** e envia;
   - o Gerente (teste) recebe **lendo o IMEI** que chegou.
   A busca pelo IMEI no Estoque mostra o aparelho na Santa Cândida (teste), disponível e no estoque.
2. **Volta:** o Gerente 2 (teste) pede um Moto G24 de volta, e o Gerente (teste) separa **o mesmo aparelho** (pelo mesmo IMEI) e envia. O Gerente 2 (teste) recebe lendo o IMEI, e a busca mostra o aparelho de novo na Loja de teste 2.
3. **A cada passo,** o teste confere quantos aparelhos estão disponíveis nas duas lojas. No fim, é o mesmo do começo.

O mesmo arquivo de teste também roda a ida e volta da capa (o lote J1-c). Os dois juntos levam cerca de 1 minuto e 20 segundos.

## O que aconteceu nas rodadas de 19/11

- **A primeira rodada do aparelho passou sozinha.**
- **Na rodada seguinte, o banco teve um pico de lentidão:** idas que levam 0,2 s levaram de 3 a 4,5 s. O teste esperava no máximo 5 s por tela e parou depois da ida: o aparelho ficou na Santa Cândida (teste) (transferência nº 9). Nenhum dado foi perdido.
- **O aparelho foi devolvido à Loja de teste 2 pelas telas,** com as duas contas de teste (transferência nº 10).
- **Duas mudanças no teste (não no sistema):**
  - contra o site no ar, cada conferência espera até 15 s;
  - se o teste parar no meio, o fim dele arruma: cancela a ida que ainda não saiu da origem ou termina a volta, para nada ficar na loja errada.
- **Depois disso, os dois casos (a capa e o aparelho) passaram duas vezes seguidas.**

## O que fica gravado (só nas duas lojas de teste)

- **Duas transferências recebidas por caso, a cada vez,** com o motivo "teste automático da transferência". Em 19/11, contando a capa e o aparelho, ficaram 18, todas recebidas.
- **O estoque das duas lojas não muda:** a capa (19 e 9) e o Moto G24 (2 e 1) terminam como começaram, e o aparelho que viajou termina na loja de onde saiu.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a **Loja de teste 2**.
2. Abra **Transferências**: devem aparecer as transferências de teste do Moto G24, recebidas.
3. Em cada uma delas, o cartão deve mostrar "1 IMEI/ICCID separado(s)" e "Recebida".
4. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/transferencia-real.spec.ts --project=celular-360
```

## O que fica de fora

- **A remessa com vários produtos** e **o recebimento com divergência** (quando chega menos do que saiu): ficam para um próximo teste, se você quiser.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
