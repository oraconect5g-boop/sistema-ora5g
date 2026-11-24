# Roteiro de aceite: lote ONLINE-h (o endereço do cadastro da loja na loja online)

- **Quem faz:** o proprietário.
- **Quando:** quando a primeira loja de verdade for liberada para vender no site (com o CNPJ gravado). Hoje nenhuma loja com endereço vende no site: a Butiatuvinha tem o endereço desde 24/11, mas o CNPJ dela espera o estoque novo (a sua decisão de 24/11).
- **Quanto tempo leva:** uns 2 minutos.
- **O que o lote entrega:** um defeito achado pelo Claude Code em 24/11, ao gravar o endereço da Butiatuvinha que você confirmou. A tela **Lojas da rede** grava o endereço (rua, número, complemento, bairro e CEP) na configuração da loja, mas a loja online lia outro campo, que nada preenchia: o "Retire em" da página do produto, da reserva e do pedido nunca mostrava o endereço. Agora a loja online mostra o endereço da configuração em vigor. Os itens ORA-ONLINE-001 (a vitrine) e ORA-ONLINE-002 (o pedido do site) **seguem parciais**.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que mudou

1. Na página do produto, em cada loja: o endereço do cadastro ("Av. Manoel Ribas, 8285 - Quiosque dentro do mercado - Butiatuvinha · Curitiba", no caso da Butiatuvinha).
2. No pedido e na reserva do site ("Retire em"): o mesmo endereço.
3. A configuração marcada para uma data futura só vale a partir dela; a loja sem a rua na configuração mostra o endereço de antes (quando houver).

## Os passos (só leitura; nada é gravado)

1. Quando a Butiatuvinha (ou outra loja com endereço) for liberada para vender no site, abra um produto com estoque nela em `ora5g.com.br/loja`.
2. Na lista das lojas, confira o endereço embaixo do nome.
3. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/loja-online-vitrine.test.ts` e `loja-online-pedido.test.ts`): a configuração em vigor vale na página do produto e no pedido; a futura ainda não; a nova sem rua volta ao endereço de antes; o endereço só com a rua sai certo. As três funções trocadas são as que estavam em vigor (conferidas pelo md5 antes de trocar).
- **No banco do site, numa prova desfeita no fim** (nada gravado): com um endereço de teste na Santa Cândida (teste), a página de um produto do site mostrou o endereço nessa loja.
- **A reversão** volta as três funções de antes (provado no teste das migrations, que aplica e desfaz).
